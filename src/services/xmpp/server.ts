import { DurableObject } from 'cloudflare:workers';
import { nanoid } from 'nanoid';
import { JWT } from '@utils/auth/jwt';
import { DB, getDBSimple } from '@core/db/client';
import { ACCOUNTS, accountSchema } from '@core/db/schemas/account';
import { FRIENDS } from '@core/db/schemas/friends';
import { eq, and } from 'drizzle-orm';
import type { Account } from '@core/db/schemas/account';
import { buildXML, parseXML } from '@utils/xmpp/xml';
import type { Document, Node } from 'xml-parser';
import xmlbuilder from 'xmlbuilder';
import { ArkError, type } from 'arktype';
import { Party } from '@utils/party/base';
import type { Bindings } from 'src/types/bindings';

const XMPP_DOMAIN = 'prod.ol.epicgames.com';

const xmppClientSchema = type({
	accountId: 'string',
	account: accountSchema,
	jid: 'string',
	id: 'string',
	sessionId: 'string',
	authenticated: 'boolean',
	friends: 'string[]',
	lastPresenceUpdate: type({
		away: 'boolean',
		status: 'string',
	}),
});

type XMPPClient = typeof xmppClientSchema.infer;

/**
 * XMPP Durable Object for handling real-time messaging and presence
 * Re-implemented to use Cloudflare Workers infrastructure and fix logic flaws
 */
export class XMPPServer extends DurableObject<Bindings> {
	private clientsByAccountId: Map<string, { ws: WebSocket; data: XMPPClient }> = new Map();
	private clientsByJid: Map<string, { ws: WebSocket; data: XMPPClient }> = new Map();
	private mapsInitialized = false;

	/**
	 * Handle WebSocket upgrade requests and other HTTP requests
	 */
	async fetch(request: Request): Promise<Response> {
		// Handle WebSocket upgrade
		const upgradeHeader = request.headers.get('Upgrade');
		if (!upgradeHeader || upgradeHeader !== 'websocket') {
			return new Response('Expected WebSocket upgrade', { status: 426 });
		}

		const protocol = request.headers.get('Sec-WebSocket-Protocol');
		if (!protocol || protocol.toLowerCase() !== 'xmpp') {
			return new Response('Expected XMPP protocol', { status: 400 });
		}

		const webSocketPair = new WebSocketPair();
		// The server *should* be the one we can do ws.close on etc, needs testing
		const [client, server] = Object.values(webSocketPair);

		this.ctx.acceptWebSocket(server);
		this.handleWebSocket(server);

		return new Response(null, {
			status: 101,
			webSocket: client,
			headers: {
				'Sec-WebSocket-Protocol': 'xmpp',
			},
		});
	}

	/**
	 * Handle WebSocket connection and setup client data
	 */
	private handleWebSocket(ws: WebSocket): void {
		const sessionId = nanoid();

		const clientData: XMPPClient = {
			accountId: '',
			account: {} as Account,
			jid: '',
			id: '',
			sessionId,
			authenticated: false,
			friends: [],
			lastPresenceUpdate: {
				away: false,
				status: '{}',
			},
		};

		this.setClientData(ws, clientData);
	}

	/**
	 * Handle incoming XMPP messages with proper error handling
	 */
	async webSocketMessage(ws: WebSocket, message: string | ArrayBuffer): Promise<void> {
		const messageStr = typeof message === 'string' ? message : new TextDecoder().decode(message);
		const parsedXML = parseXML(messageStr);

		if (!parsedXML.root) {
			this.sendErrorAndClose(ws, 'bad-format');
			return;
		}

		const clientData = this.getClientData(ws);
		if (!clientData) {
			this.sendErrorAndClose(ws, 'missing-client-data');
			return;
		}

		try {
			switch (parsedXML.root.name) {
				case 'open':
					await this.handleOpen(ws, clientData);
					break;

				case 'auth':
					await this.handleAuth(ws, parsedXML, clientData);
					break;

				case 'iq':
					await this.handleIQ(ws, parsedXML, clientData);
					break;

				case 'message':
					await this.handleXMPPMessage(ws, parsedXML, clientData);
					break;

				case 'presence':
					await this.handlePresence(ws, parsedXML, clientData);
					break;

				default:
					console.log(`Unknown XMPP message type: ${parsedXML.root.name}`);
					this.sendErrorAndClose(ws, 'feature-not-implemented');
			}
		} catch (error) {
			console.error('Error processing XMPP message:', error);
			this.sendErrorAndClose(ws, 'internal-server-error');
		}
	}

	/**
	 * Handle XMPP stream open
	 */
	private async handleOpen(ws: WebSocket, clientData: XMPPClient): Promise<void> {
		const openResponse = buildXML('open')
			.att('xmlns', 'urn:ietf:params:xml:ns:xmpp-framing')
			.att('from', XMPP_DOMAIN)
			.att('id', clientData.sessionId)
			.att('version', '1.0')
			.att('xml:lang', 'en');

		this.sendToClient(ws, openResponse);

		const features = clientData.authenticated ? this.buildAuthenticatedFeatures() : this.buildUnauthenticatedFeatures();

		this.sendToClient(ws, features);
	}

	/**
	 * Handle XMPP authentication with proper JWT validation
	 */
	private async handleAuth(ws: WebSocket, parsedXML: Document, clientData: XMPPClient): Promise<void> {
		if (!parsedXML.root?.content) {
			this.sendSaslError(ws, 'malformed-request');
			return;
		}

		const decodedAuth = this.decodeBase64(parsedXML.root.content);
		if (!decodedAuth) {
			this.sendSaslError(ws, 'incorrect-encoding');
			return;
		}

		// SASL PLAIN: authorization-id\0authentication-id\0password
		// (but in this case it should be an access token)
		const authParts = decodedAuth.split('\u0000');
		if (authParts.length !== 3) {
			this.sendSaslError(ws, 'malformed-request');
			return;
		}

		const [, , token] = authParts;

		const payload = await JWT.verifyToken(token);
		if (!payload || !payload.sub) {
			this.sendSaslError(ws, 'not-authorized');
			return;
		}

		const accountId = payload.sub as string;

		// Check if user is already connected (atomic check)
		if (this.isAccountConnected(accountId)) {
			this.sendSaslError(ws, 'conflict');
			return;
		}

		// Fetch account from database
		const db = getDBSimple(this.env);

		const [account] = await db.select().from(ACCOUNTS).where(eq(ACCOUNTS.id, accountId)).limit(1);
		if (!account) {
			this.sendSaslError(ws, 'not-authorized');
			return;
		}

		if (account.banned) {
			this.sendSaslError(ws, 'account-disabled');
			return;
		}

		// Load friends list
		const friends = await this.loadFriendsList(db, accountId);

		// Update client data
		clientData.accountId = accountId;
		clientData.account = account;
		clientData.authenticated = true;
		clientData.friends = friends;
		this.setClientData(ws, clientData);

		console.log(`XMPP client authenticated with displayName ${account.displayName} and accountId (${accountId})`);

		const successResponse = buildXML('success').att('xmlns', 'urn:ietf:params:xml:ns:xmpp-sasl');

		this.sendToClient(ws, successResponse);
	}

	/**
	 * Handle IQ (Info/Query) stanzas
	 */
	private async handleIQ(ws: WebSocket, parsedXML: Document, clientData: XMPPClient): Promise<void> {
		if (!clientData.authenticated) {
			this.sendErrorAndClose(ws, 'not-authorized');
			return;
		}

		const iqId = parsedXML.root?.attributes?.id;
		const iqType = parsedXML.root?.attributes?.type;

		if (!iqId) {
			this.sendStanzaError(ws, clientData.jid, 'modify', 'bad-request');
			return;
		}

		switch (iqId) {
			case '_xmpp_bind1':
				await this.handleBind(ws, parsedXML, clientData);
				break;

			case '_xmpp_session1':
				await this.handleSession(ws, clientData);
				break;

			default:
				// Generic IQ response for unknown requests
				if (iqType === 'get' || iqType === 'set') {
					const response = buildXML('iq')
						.att('to', clientData.jid)
						.att('from', XMPP_DOMAIN)
						.att('id', iqId)
						.att('xmlns', 'jabber:client')
						.att('type', 'result');

					this.sendToClient(ws, response);
				}
		}
	}

	/**
	 * Handle resource binding with conflict checking
	 */
	private async handleBind(ws: WebSocket, parsedXML: Document, clientData: XMPPClient): Promise<void> {
		const bindElement = this.findElement(parsedXML.root!, 'bind');
		if (!bindElement) {
			this.sendStanzaError(ws, clientData.jid, 'modify', 'bad-request');
			return;
		}

		const resourceElement = this.findElement(bindElement, 'resource');
		let resource = resourceElement?.content || `OdysseusPC-${nanoid()}`;

		// Check for resource conflicts and generate unique resource if needed
		const proposedJid = `${clientData.accountId}@${XMPP_DOMAIN}/${resource}`;
		if (this.isJidInUse(proposedJid)) {
			resource = `${resource}-${nanoid()}`;
		}

		clientData.jid = `${clientData.accountId}@${XMPP_DOMAIN}/${resource}`;
		clientData.id = `${clientData.accountId}@${XMPP_DOMAIN}`;
		this.setClientData(ws, clientData);

		// Now that the client is fully authenticated and bound, add to maps
		const clientInfo = { ws, data: clientData };
		this.clientsByAccountId.set(clientData.accountId, clientInfo);
		this.clientsByJid.set(clientData.jid, clientInfo);

		const bindResponse = buildXML('iq')
			.att('to', clientData.jid)
			.att('id', '_xmpp_bind1')
			.att('xmlns', 'jabber:client')
			.att('type', 'result')
			.ele('bind')
			.att('xmlns', 'urn:ietf:params:xml:ns:xmpp-bind')
			.ele('jid', clientData.jid);

		this.sendToClient(ws, bindResponse);
	}

	/**
	 * Handle session establishment
	 */
	private async handleSession(ws: WebSocket, clientData: XMPPClient): Promise<void> {
		const sessionResponse = buildXML('iq')
			.att('to', clientData.jid)
			.att('from', XMPP_DOMAIN)
			.att('id', '_xmpp_session1')
			.att('xmlns', 'jabber:client')
			.att('type', 'result');

		this.sendToClient(ws, sessionResponse);

		// Send presence from all connected users to this new client
		await this.sendPresenceFromConnectedUsers(ws);
	}

	/**
	 * Handle XMPP messages with proper validation
	 */
	private async handleXMPPMessage(ws: WebSocket, parsedXML: Document, clientData: XMPPClient): Promise<void> {
		if (!clientData.authenticated) {
			this.sendErrorAndClose(ws, 'not-authorized');
			return;
		}

		const bodyElement = this.findElement(parsedXML.root!, 'body');
		if (!bodyElement?.content) return;

		const body = bodyElement.content;
		const messageType = parsedXML.root?.attributes?.type;
		const to = parsedXML.root?.attributes?.to;
		const messageId = parsedXML.root?.attributes?.id;

		if (messageType === 'chat' && to) {
			await this.handleChatMessage(ws, clientData, to, body, messageId);
			return;
		}

		// Handle JSON messages (party notifications, etc.)
		if (this.isValidJSON(body)) {
			await this.handleJSONMessage(ws, clientData, body, to, messageId);
		}
	}

	/**
	 * Handle direct chat messages (friends only)
	 */
	private async handleChatMessage(ws: WebSocket, sender: XMPPClient, to: string, body: string, messageId?: string): Promise<void> {
		const receiver = this.findClientByIdentifier(to);
		if (!receiver || receiver.ws === ws || !receiver.data.authenticated) {
			return; // Silently ignore invalid recipients
		}

		// Only allow chat messages between friends
		if (!sender.friends.includes(receiver.data.accountId)) {
			return; // Silently ignore non-friends
		}

		const chatMessage = buildXML('message')
			.att('to', receiver.data.jid)
			.att('from', sender.jid)
			.att('xmlns', 'jabber:client')
			.att('type', 'chat');

		if (messageId) {
			chatMessage.att('id', messageId);
		}

		chatMessage.ele('body', body);

		this.sendToClient(receiver.ws, chatMessage);
	}

	/**
	 * Handle JSON messages (party notifications, etc.)
	 */
	private async handleJSONMessage(ws: WebSocket, sender: XMPPClient, body: string, to?: string, messageId?: string): Promise<void> {
		try {
			const jsonMessage = JSON.parse(body);

			if (!jsonMessage.type || typeof jsonMessage.type !== 'string') {
				return; // Invalid message format
			}

			const messageType = jsonMessage.type.toLowerCase();

			// Handle party-related messages (friends only)
			if (this.isPartyMessage(messageType)) {
				if (to) {
					const receiver = this.findClientByIdentifier(to);
					if (receiver && receiver.data.authenticated) {
						// Only allow party messages between friends
						if (!sender.friends.includes(receiver.data.accountId)) {
							return; // Silently ignore non-friends
						}

						const partyMessage = buildXML('message').att('from', sender.jid).att('to', receiver.data.jid).att('xmlns', 'jabber:client');

						if (messageId) {
							partyMessage.att('id', messageId);
						}

						partyMessage.ele('body', body);
						this.sendToClient(receiver.ws, partyMessage);
					}
				}
			} else {
				// Echo back unknown message types to sender only
				const echoMessage = buildXML('message').att('from', sender.jid).att('to', sender.jid).att('xmlns', 'jabber:client');

				if (messageId) {
					echoMessage.att('id', messageId);
				}

				echoMessage.ele('body', body);
				this.sendToClient(ws, echoMessage);
			}
		} catch (error) {
			console.error('Error parsing JSON message:', error);
		}
	}

	/**
	 * Handle presence updates
	 */
	private async handlePresence(ws: WebSocket, parsedXML: Document, clientData: XMPPClient): Promise<void> {
		if (!clientData.authenticated) {
			this.sendErrorAndClose(ws, 'not-authorized');
			return;
		}

		const statusElement = this.findElement(parsedXML.root!, 'status');
		if (!statusElement?.content || !this.isValidJSON(statusElement.content)) {
			return; // Invalid presence update
		}

		const status = statusElement.content;
		const showElement = this.findElement(parsedXML.root!, 'show');
		const away = !!showElement;

		await this.broadcastPresenceUpdate(ws, clientData, status, away, false);
	}

	/**
	 * Handle client disconnect with proper cleanup
	 */
	async webSocketClose(ws: WebSocket, code: number, reason: string, wasClean: boolean) {
		const clientData = this.getClientData(ws);
		if (clientData?.authenticated) {
			console.log(`XMPP client disconnected: ${clientData.account.displayName} (${clientData.accountId})`);

			await this.handlePartyExit(clientData);

			// Clean up from connection maps
			this.clientsByAccountId.delete(clientData.accountId);
			this.clientsByJid.delete(clientData.jid);
			this.broadcastPresenceUpdate(ws, clientData, '{}', false, true).catch(console.error);
		}
		// Acknowledge the close event.
		ws.close(code, 'Connection closed');
	}

	/**
	 * Handle low-level WebSocket errors
	 */
	async webSocketError(ws: WebSocket, error: Error) {
		console.error('WebSocket error occurred:', error);

		const clientData = this.getClientData(ws);
		if (clientData?.authenticated) {
			console.log(`Cleaning up client due to error: ${clientData.account.displayName} (${clientData.accountId})`);

			await this.handlePartyExit(clientData);

			this.clientsByAccountId.delete(clientData.accountId);
			this.clientsByJid.delete(clientData.jid);
			await this.broadcastPresenceUpdate(ws, clientData, '{}', false, true);
		}

		// The runtime will close the socket automatically.
	}

	/**
	 * On disconnect, check if the user was in a party and notify other members.
	 */
	private async handlePartyExit(clientData: XMPPClient): Promise<void> {
		let partyId: string | undefined;

		try {
			const presenceStatus = JSON.parse(clientData.lastPresenceUpdate.status);
			if (presenceStatus.Properties && typeof presenceStatus.Properties === 'object') {
				for (const key in presenceStatus.Properties) {
					if (key.toLowerCase().startsWith('party.joininfo')) {
						partyId = presenceStatus.Properties[key]?.partyId;
						if (partyId) break;
					}
				}
			}
		} catch {
			// Not a valid JSON or doesn't have the expected structure, ignore.
			return;
		}

		if (!partyId) {
			return;
		}

		const party = await Party.loadFromKV(this.env.KV, partyId);
		if (!party) {
			return;
		}

		const remainingMembers = party.members.filter((m) => m.account_id !== clientData.accountId);
		if (remainingMembers.length === 0) {
			return;
		}

		const memberExitMessage = {
			type: 'com.epicgames.party.memberexited',
			payload: {
				partyId: party.id,
				memberId: clientData.accountId,
				wasKicked: false,
			},
			timestamp: new Date().toISOString(),
		};

		const recipientIds = remainingMembers.map((m) => m.account_id);
		this.sendMessageMulti(recipientIds, memberExitMessage);

		console.log(`Sent MemberExited notification for ${clientData.accountId} from party ${party.id}`);
	}

	/**
	 * Broadcast presence updates to friends only
	 */
	private async broadcastPresenceUpdate(ws: WebSocket, sender: XMPPClient, status: string, away: boolean, offline: boolean): Promise<void> {
		// Update sender's presence data if not going offline
		if (!offline) {
			sender.lastPresenceUpdate.away = away;
			sender.lastPresenceUpdate.status = status;
			this.setClientData(ws, sender);
		}

		// Broadcast to friends only
		for (const connectedWs of this.ctx.getWebSockets()) {
			if (connectedWs === ws) continue;

			const clientData = this.getClientData(connectedWs);
			if (!clientData?.authenticated) continue;

			// Only send presence to friends
			if (!sender.friends.includes(clientData.accountId)) continue;

			const presence = buildXML('presence')
				.att('to', clientData.jid)
				.att('xmlns', 'jabber:client')
				.att('from', sender.jid)
				.att('type', offline ? 'unavailable' : 'available');

			if (!offline) {
				if (away) {
					presence.ele('show', 'away');
				}
				presence.ele('status', status);
			}

			this.sendToClient(connectedWs, presence);
		}
	}

	/**
	 * Send presence from friends to a new client
	 */
	private async sendPresenceFromConnectedUsers(newClientWs: WebSocket): Promise<void> {
		const newClientData = this.getClientData(newClientWs);
		if (!newClientData?.authenticated) return;

		for (const connectedWs of this.ctx.getWebSockets()) {
			if (connectedWs === newClientWs) continue;

			const clientData = this.getClientData(connectedWs);
			if (!clientData?.authenticated) continue;

			// Only send presence from friends
			if (!newClientData.friends.includes(clientData.accountId)) continue;

			const presence = buildXML('presence')
				.att('to', newClientData.jid)
				.att('xmlns', 'jabber:client')
				.att('from', clientData.jid)
				.att('type', 'available');

			if (clientData.lastPresenceUpdate.away) {
				presence.ele('show', 'away');
			}
			presence.ele('status', clientData.lastPresenceUpdate.status);

			this.sendToClient(newClientWs, presence);
		}
	}

	/**
	 * Send message to multiple clients by account IDs
	 * Note: This method bypasses friendship checks for server-initiated messages
	 */
	sendMessageMulti(accountIds: string[], message: object): void {
		const messageBody = JSON.stringify(message);

		for (const accountId of accountIds) {
			const client = this.findClientByIdentifier(accountId);
			if (client?.data.authenticated) {
				const xmppMessage = buildXML('message')
					.att('from', XMPP_DOMAIN)
					.att('to', client.data.jid)
					.att('xmlns', 'jabber:client')
					.ele('body', messageBody);

				this.sendToClient(client.ws, xmppMessage);
			}
		}
	}

	// Utility Methods

	/**
	 * Load friends list for an account
	 */
	private async loadFriendsList(db: DB, accountId: string): Promise<string[]> {
		// Get friends where this user is the accountId and status is ACCEPTED
		const outgoingFriends = await db
			.select({ targetId: FRIENDS.targetId })
			.from(FRIENDS)
			.where(and(eq(FRIENDS.accountId, accountId), eq(FRIENDS.status, 'ACCEPTED')));

		// Get friends where this user is the targetId and status is ACCEPTED
		const incomingFriends = await db
			.select({ accountId: FRIENDS.accountId })
			.from(FRIENDS)
			.where(and(eq(FRIENDS.targetId, accountId), eq(FRIENDS.status, 'ACCEPTED')));

		// Combine both directions to get all accepted friends
		const allFriends = [
			...outgoingFriends.map((f: { targetId: string }) => f.targetId),
			...incomingFriends.map((f: { accountId: string }) => f.accountId),
		];

		// Remove duplicates (shouldn't happen with proper data, but safe to do)
		return [...new Set(allFriends)];
	}

	/**
	 * Check if an account is already connected
	 */
	private isAccountConnected(accountId: string): boolean {
		this.ensureClientMapsPopulated();
		return this.clientsByAccountId.has(accountId);
	}

	/**
	 * Check if a JID is already in use
	 */
	private isJidInUse(jid: string): boolean {
		this.ensureClientMapsPopulated();
		return this.clientsByJid.has(jid);
	}

	/**
	 * Find client by various identifiers (fixed ambiguity issue)
	 */
	private findClientByIdentifier(identifier: string): { ws: WebSocket; data: XMPPClient } | null {
		this.ensureClientMapsPopulated();

		// Try full JID match first (e.g., accountId@domain/resource)
		const clientByJid = this.clientsByJid.get(identifier);
		if (clientByJid) {
			return clientByJid;
		}

		// Try accountId match
		const clientByAccountId = this.clientsByAccountId.get(identifier);
		if (clientByAccountId) {
			return clientByAccountId;
		}

		// Fallback for bare JID (e.g., accountId@domain)
		const accountId = identifier.split('@')[0];
		const clientByBareJid = this.clientsByAccountId.get(accountId);
		if (clientByBareJid) {
			return clientByBareJid;
		}

		return null;
	}

	/**
	 * Check if message type is party-related
	 */
	private isPartyMessage(messageType: string): boolean {
		const partyTypes = [
			'com.epicgames.party.invitation',
			'com.epicgames.social.party.notification.v0.initial_invite',
			'com.epicgames.social.party.notification.v0.party_updated',
			'com.epicgames.social.party.notification.v0.member_state_updated',
			'com.epicgames.social.party.notification.v0.member_joined',
			'com.epicgames.social.party.notification.v0.member_left',
			'com.epicgames.social.party.notification.v0.invite_cancelled',
			'com.epicgames.social.party.notification.v0.ping',
		];
		return partyTypes.includes(messageType);
	}

	/**
	 * Send various XMPP error types
	 */
	private sendSaslError(ws: WebSocket, condition: string): void {
		const error = buildXML('failure').att('xmlns', 'urn:ietf:params:xml:ns:xmpp-sasl').ele(condition);

		this.sendToClient(ws, error);
		ws.close();
	}

	private sendStanzaError(ws: WebSocket, to: string, type: string, condition: string): void {
		const error = buildXML('iq')
			.att('to', to)
			.att('type', 'error')
			.ele('error')
			.att('type', type)
			.ele(condition)
			.att('xmlns', 'urn:ietf:params:xml:ns:xmpp-stanzas');

		this.sendToClient(ws, error);
	}

	private sendErrorAndClose(ws: WebSocket, condition: string): void {
		const closeXML = buildXML('close').att('xmlns', 'urn:ietf:params:xml:ns:xmpp-framing');

		this.sendToClient(ws, closeXML);
		ws.close(1000, `Error: ${condition}`);
	}

	/**
	 * Build authenticated stream features
	 */
	private buildAuthenticatedFeatures(): xmlbuilder.XMLElement {
		return buildXML('stream:features')
			.att('xmlns:stream', 'http://etherx.jabber.org/streams')
			.ele('ver')
			.att('xmlns', 'urn:xmpp:features:rosterver')
			.up()
			.ele('starttls')
			.att('xmlns', 'urn:ietf:params:xml:ns:xmpp-tls')
			.up()
			.ele('bind')
			.att('xmlns', 'urn:ietf:params:xml:ns:xmpp-bind')
			.up()
			.ele('compression')
			.att('xmlns', 'http://jabber.org/features/compress')
			.ele('method', 'zlib')
			.up()
			.up()
			.ele('session')
			.att('xmlns', 'urn:ietf:params:xml:ns:xmpp-session');
	}

	/**
	 * Build unauthenticated stream features
	 */
	private buildUnauthenticatedFeatures(): xmlbuilder.XMLElement {
		return buildXML('stream:features')
			.att('xmlns:stream', 'http://etherx.jabber.org/streams')
			.ele('mechanisms')
			.att('xmlns', 'urn:ietf:params:xml:ns:xmpp-sasl')
			.ele('mechanism', 'PLAIN')
			.up()
			.up()
			.ele('ver')
			.att('xmlns', 'urn:xmpp:features:rosterver')
			.up()
			.ele('starttls')
			.att('xmlns', 'urn:ietf:params:xml:ns:xmpp-tls')
			.up()
			.ele('compression')
			.att('xmlns', 'http://jabber.org/features/compress')
			.ele('method', 'zlib')
			.up()
			.up()
			.ele('auth')
			.att('xmlns', 'http://jabber.org/features/iq-auth');
	}

	/**
	 * Safe send to client with error handling
	 */
	private sendToClient(ws: WebSocket, xmlBuilder: xmlbuilder.XMLElement): void {
		try {
			if (ws.readyState === WebSocket.OPEN) {
				ws.send(xmlBuilder.toString());
			}
		} catch (error) {
			console.error('Error sending to client:', error);
		}
	}

	/**
	 * Find XML element by name
	 */
	private findElement(parent: Node, name: string): Node | undefined {
		return parent.children.find((child) => child.name === name);
	}

	/**
	 * Base64 decode utility with error handling
	 */
	private decodeBase64(encoded: string): string {
		try {
			return atob(encoded);
		} catch {
			return '';
		}
	}

	/**
	 * JSON validation utility
	 */
	private isValidJSON(str: string): boolean {
		try {
			JSON.parse(str);
			return true;
		} catch {
			return false;
		}
	}

	/**
	 * Client data management
	 */
	private setClientData(ws: WebSocket, clientData: XMPPClient): void {
		const validData = xmppClientSchema(clientData);
		if (validData instanceof ArkError) {
			console.error('Invalid client data:', validData.message);
			// Don't attach invalid data. The operation that triggered this should fail.
			return;
		}
		ws.serializeAttachment(clientData);
	}

	private getClientData(ws: WebSocket): XMPPClient | null {
		return ws.deserializeAttachment();
	}

	/**
	 * Rebuilds in-memory maps after hibernation
	 */
	private ensureClientMapsPopulated(): void {
		if (this.mapsInitialized) {
			return;
		}

		console.log('Rebuilding client maps after potential hibernation...');
		for (const ws of this.ctx.getWebSockets()) {
			const clientData = this.getClientData(ws);
			if (clientData && clientData.authenticated && clientData.jid) {
				const clientInfo = { ws, data: clientData };
				this.clientsByAccountId.set(clientData.accountId, clientInfo);
				this.clientsByJid.set(clientData.jid, clientInfo);
			}
		}
		this.mapsInitialized = true;
		console.log(`Maps rebuilt. ${this.clientsByAccountId.size} clients tracked.`);
	}
}
