import { DurableObject } from 'cloudflare:workers';
import { nanoid } from 'nanoid';
import { JWT } from '@utils/auth/jwt';
import { getDB } from '@core/db/client';
import { ACCOUNTS } from '@core/db/schemas/account';
import { FRIENDS } from '@core/db/schemas/friends';
import { eq, and } from 'drizzle-orm';
import type { Account } from '@core/db/schemas/account';

interface XMPPClient {
	accountId: string;
	account: Account;
	jid: string;
	id: string;
	sessionId: string;
	authenticated: boolean;
	friends: string[]; // List of accepted friend account IDs
	lastPresenceUpdate: {
		away: boolean;
		status: string;
	};
}

interface XMLElement {
	name: string;
	attributes: Record<string, string>;
	content: string;
	children: XMLElement[];
}

interface ParsedXML {
	root: XMLElement | null;
}

/**
 * XMPP Durable Object for handling real-time messaging and presence
 * Re-implemented to use Cloudflare Workers infrastructure and fix logic flaws
 */
export class XMPPServer extends DurableObject {
	/**
	 * Handle WebSocket upgrade requests and other HTTP requests
	 */
	async fetch(request: Request): Promise<Response> {
		const url = new URL(request.url);

		// Handle HTTP endpoints
		if (request.method === 'POST' && url.pathname === '/send') {
			return this.handleHttpSend(request);
		}

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
		const [client, server] = Object.values(webSocketPair);

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
	 * Handle HTTP send endpoint for sending messages to multiple clients
	 */
	private async handleHttpSend(request: Request): Promise<Response> {
		try {
			const body = (await request.json()) as { accountIds: string[]; message: object };

			if (!body.accountIds || !body.message) {
				return new Response('Missing accountIds or message', { status: 400 });
			}

			this.sendMessageMulti(body.accountIds, body.message);

			return new Response(JSON.stringify({ success: true }), {
				headers: { 'Content-Type': 'application/json' },
			});
		} catch (error) {
			console.error('Error handling HTTP send:', error);
			return new Response(JSON.stringify({ error: 'Failed to process request' }), {
				status: 500,
				headers: { 'Content-Type': 'application/json' },
			});
		}
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
		const parsedXML = this.parseXML(messageStr);

		if (!parsedXML.root) {
			this.sendErrorAndClose(ws, 'bad-format');
			return;
		}

		const clientData = this.getClientData(ws);
		if (!clientData) {
			this.sendErrorAndClose(ws, 'internal-server-error');
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
		const openResponse = this.buildXML('open')
			.attribute('xmlns', 'urn:ietf:params:xml:ns:xmpp-framing')
			.attribute('from', 'prod.ol.epicgames.com')
			.attribute('id', clientData.sessionId)
			.attribute('version', '1.0')
			.attribute('xml:lang', 'en');

		this.sendToClient(ws, openResponse);

		const features = clientData.authenticated ? this.buildAuthenticatedFeatures() : this.buildUnauthenticatedFeatures();

		this.sendToClient(ws, features);
	}

	/**
	 * Handle XMPP authentication with proper JWT validation
	 */
	private async handleAuth(ws: WebSocket, parsedXML: ParsedXML, clientData: XMPPClient): Promise<void> {
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
		const authParts = decodedAuth.split('\u0000');
		if (authParts.length !== 3) {
			this.sendSaslError(ws, 'malformed-request');
			return;
		}

		const [, _, password] = authParts;

		// Validate JWT token as password
		const payload = await JWT.verifyToken(password);
		if (!payload || !payload.sub) {
			this.sendSaslError(ws, 'not-authorized');
			return;
		}

		const accountId = payload.sub as string;

		// Check if user is already connected (atomic check)
		if (this.isAccountConnected(accountId)) {
			this.sendSaslError(ws, 'resource-constraint');
			return;
		}

		// Fetch account from database
		const db = getDB({
			req: { raw: { cf: { colo: 'DFW' } } },
			var: { cacheIdentifier: nanoid() },
		} as any);

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

		console.log(`XMPP client authenticated: ${account.displayName} (${accountId})`);

		const successResponse = this.buildXML('success').attribute('xmlns', 'urn:ietf:params:xml:ns:xmpp-sasl');

		this.sendToClient(ws, successResponse);
	}

	/**
	 * Handle IQ (Info/Query) stanzas
	 */
	private async handleIQ(ws: WebSocket, parsedXML: ParsedXML, clientData: XMPPClient): Promise<void> {
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
					const response = this.buildXML('iq')
						.attribute('to', clientData.jid)
						.attribute('from', 'prod.ol.epicgames.com')
						.attribute('id', iqId)
						.attribute('xmlns', 'jabber:client')
						.attribute('type', 'result');

					this.sendToClient(ws, response);
				}
		}
	}

	/**
	 * Handle resource binding with conflict checking
	 */
	private async handleBind(ws: WebSocket, parsedXML: ParsedXML, clientData: XMPPClient): Promise<void> {
		const bindElement = this.findElement(parsedXML.root!, 'bind');
		if (!bindElement) {
			this.sendStanzaError(ws, clientData.jid, 'modify', 'bad-request');
			return;
		}

		const resourceElement = this.findElement(bindElement, 'resource');
		let resource = resourceElement?.content || `OdysseusPC-${nanoid()}`;

		// Check for resource conflicts and generate unique resource if needed
		const proposedJid = `${clientData.accountId}@prod.ol.epicgames.com/${resource}`;
		if (this.isJidInUse(proposedJid)) {
			resource = `${resource}-${nanoid()}`;
		}

		clientData.jid = `${clientData.accountId}@prod.ol.epicgames.com/${resource}`;
		clientData.id = `${clientData.accountId}@prod.ol.epicgames.com`;
		this.setClientData(ws, clientData);

		const bindResponse = this.buildXML('iq')
			.attribute('to', clientData.jid)
			.attribute('id', '_xmpp_bind1')
			.attribute('xmlns', 'jabber:client')
			.attribute('type', 'result')
			.element('bind')
			.attribute('xmlns', 'urn:ietf:params:xml:ns:xmpp-bind')
			.element('jid', clientData.jid);

		this.sendToClient(ws, bindResponse);
	}

	/**
	 * Handle session establishment
	 */
	private async handleSession(ws: WebSocket, clientData: XMPPClient): Promise<void> {
		const sessionResponse = this.buildXML('iq')
			.attribute('to', clientData.jid)
			.attribute('from', 'prod.ol.epicgames.com')
			.attribute('id', '_xmpp_session1')
			.attribute('xmlns', 'jabber:client')
			.attribute('type', 'result');

		this.sendToClient(ws, sessionResponse);

		// Send presence from all connected users to this new client
		await this.sendPresenceFromConnectedUsers(ws);
	}

	/**
	 * Handle XMPP messages with proper validation
	 */
	private async handleXMPPMessage(ws: WebSocket, parsedXML: ParsedXML, clientData: XMPPClient): Promise<void> {
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

		const chatMessage = this.buildXML('message')
			.attribute('to', receiver.data.jid)
			.attribute('from', sender.jid)
			.attribute('xmlns', 'jabber:client')
			.attribute('type', 'chat');

		if (messageId) {
			chatMessage.attribute('id', messageId);
		}

		chatMessage.element('body', body);

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

						const partyMessage = this.buildXML('message')
							.attribute('from', sender.jid)
							.attribute('to', receiver.data.jid)
							.attribute('xmlns', 'jabber:client');

						if (messageId) {
							partyMessage.attribute('id', messageId);
						}

						partyMessage.element('body', body);
						this.sendToClient(receiver.ws, partyMessage);
					}
				}
			} else {
				// Echo back unknown message types to sender only
				const echoMessage = this.buildXML('message')
					.attribute('from', sender.jid)
					.attribute('to', sender.jid)
					.attribute('xmlns', 'jabber:client');

				if (messageId) {
					echoMessage.attribute('id', messageId);
				}

				echoMessage.element('body', body);
				this.sendToClient(ws, echoMessage);
			}
		} catch (error) {
			console.error('Error parsing JSON message:', error);
		}
	}

	/**
	 * Handle presence updates
	 */
	private async handlePresence(ws: WebSocket, parsedXML: ParsedXML, clientData: XMPPClient): Promise<void> {
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
		if (clientData && clientData.authenticated) {
			console.log(`XMPP client disconnected: ${clientData.account.displayName} (${clientData.accountId})`);
			this.broadcastPresenceUpdate(ws, clientData, '{}', false, true).catch(console.error);
		}
		return ws.close(code, reason);
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

			const presence = this.buildXML('presence')
				.attribute('to', clientData.jid)
				.attribute('xmlns', 'jabber:client')
				.attribute('from', sender.jid)
				.attribute('type', offline ? 'unavailable' : 'available');

			if (!offline) {
				if (away) {
					presence.element('show', 'away');
				}
				presence.element('status', status);
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

			const presence = this.buildXML('presence')
				.attribute('to', newClientData.jid)
				.attribute('xmlns', 'jabber:client')
				.attribute('from', clientData.jid)
				.attribute('type', 'available');

			if (clientData.lastPresenceUpdate.away) {
				presence.element('show', 'away');
			}
			presence.element('status', clientData.lastPresenceUpdate.status);

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
				const xmppMessage = this.buildXML('message')
					.attribute('from', 'prod.ol.epicgames.com')
					.attribute('to', client.data.jid)
					.attribute('xmlns', 'jabber:client')
					.element('body', messageBody);

				this.sendToClient(client.ws, xmppMessage);
			}
		}
	}

	// Utility Methods

	/**
	 * Load friends list for an account
	 */
	private async loadFriendsList(db: any, accountId: string): Promise<string[]> {
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
		for (const ws of this.ctx.getWebSockets()) {
			const clientData = this.getClientData(ws);
			if (clientData?.accountId === accountId && clientData.authenticated) {
				return true;
			}
		}
		return false;
	}

	/**
	 * Check if a JID is already in use
	 */
	private isJidInUse(jid: string): boolean {
		for (const ws of this.ctx.getWebSockets()) {
			const clientData = this.getClientData(ws);
			if (clientData?.jid === jid) {
				return true;
			}
		}
		return false;
	}

	/**
	 * Find client by various identifiers (fixed ambiguity issue)
	 */
	private findClientByIdentifier(identifier: string): { ws: WebSocket; data: XMPPClient } | null {
		// First try exact JID match (most specific)
		for (const ws of this.ctx.getWebSockets()) {
			const data = this.getClientData(ws);
			if (data?.jid === identifier) {
				return { ws, data };
			}
		}

		// Then try account ID match
		for (const ws of this.ctx.getWebSockets()) {
			const data = this.getClientData(ws);
			if (data?.accountId === identifier) {
				return { ws, data };
			}
		}

		// Finally try base ID match
		for (const ws of this.ctx.getWebSockets()) {
			const data = this.getClientData(ws);
			if (data?.id === identifier) {
				return { ws, data };
			}
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
		const error = this.buildXML('failure').attribute('xmlns', 'urn:ietf:params:xml:ns:xmpp-sasl').element(condition);

		this.sendToClient(ws, error);
		ws.close();
	}

	private sendStanzaError(ws: WebSocket, to: string, type: string, condition: string): void {
		const error = this.buildXML('iq')
			.attribute('to', to)
			.attribute('type', 'error')
			.element('error')
			.attribute('type', type)
			.element(condition)
			.attribute('xmlns', 'urn:ietf:params:xml:ns:xmpp-stanzas');

		this.sendToClient(ws, error);
	}

	private sendErrorAndClose(ws: WebSocket, condition: string): void {
		const closeXML = this.buildXML('close').attribute('xmlns', 'urn:ietf:params:xml:ns:xmpp-framing');

		this.sendToClient(ws, closeXML);
		ws.close();
	}

	/**
	 * Build authenticated stream features
	 */
	private buildAuthenticatedFeatures(): any {
		return this.buildXML('stream:features')
			.attribute('xmlns:stream', 'http://etherx.jabber.org/streams')
			.element('ver')
			.attribute('xmlns', 'urn:xmpp:features:rosterver')
			.up()
			.element('starttls')
			.attribute('xmlns', 'urn:ietf:params:xml:ns:xmpp-tls')
			.up()
			.element('bind')
			.attribute('xmlns', 'urn:ietf:params:xml:ns:xmpp-bind')
			.up()
			.element('compression')
			.attribute('xmlns', 'http://jabber.org/features/compress')
			.element('method', 'zlib')
			.up()
			.up()
			.element('session')
			.attribute('xmlns', 'urn:ietf:params:xml:ns:xmpp-session');
	}

	/**
	 * Build unauthenticated stream features
	 */
	private buildUnauthenticatedFeatures(): any {
		return this.buildXML('stream:features')
			.attribute('xmlns:stream', 'http://etherx.jabber.org/streams')
			.element('mechanisms')
			.attribute('xmlns', 'urn:ietf:params:xml:ns:xmpp-sasl')
			.element('mechanism', 'PLAIN')
			.up()
			.up()
			.element('ver')
			.attribute('xmlns', 'urn:xmpp:features:rosterver')
			.up()
			.element('starttls')
			.attribute('xmlns', 'urn:ietf:params:xml:ns:xmpp-tls')
			.up()
			.element('compression')
			.attribute('xmlns', 'http://jabber.org/features/compress')
			.element('method', 'zlib')
			.up()
			.up()
			.element('auth')
			.attribute('xmlns', 'http://jabber.org/features/iq-auth');
	}

	/**
	 * Safe send to client with error handling
	 */
	private sendToClient(ws: WebSocket, xmlBuilder: any): void {
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
	private findElement(parent: XMLElement, name: string): XMLElement | null {
		return parent.children.find((child) => child.name === name) || null;
	}

	/**
	 * Improved XML builder (maintains existing interface)
	 */
	private buildXML(rootName: string): any {
		const builder = {
			_element: rootName,
			_attributes: {} as Record<string, string>,
			_children: [] as any[],
			_content: '',

			attribute(name: string, value: string) {
				this._attributes[name] = value;
				return this;
			},

			element(name: string, content?: string) {
				const child = {
					_element: name,
					_attributes: {},
					_children: [],
					_content: content || '',
					attribute: this.attribute,
					element: this.element,
					up: () => builder,
					toString: this.toString,
				};
				this._children.push(child);
				return child;
			},

			up() {
				return this;
			},

			toString() {
				let xml = `<${this._element}`;

				for (const [name, value] of Object.entries(this._attributes)) {
					xml += ` ${name}="${this.escapeXml(value)}"`;
				}

				if (this._children.length === 0 && !this._content) {
					xml += '/>';
				} else {
					xml += '>';
					xml += this.escapeXml(this._content);

					for (const child of this._children) {
						xml += child.toString();
					}

					xml += `</${this._element}>`;
				}

				return xml;
			},

			escapeXml(unsafe: string): string {
				return unsafe.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#039;');
			},
		};

		return builder;
	}

	/**
	 * Improved XML parser (still basic but more robust)
	 */
	private parseXML(xmlString: string): ParsedXML {
		// Remove XML declaration if present
		xmlString = xmlString.replace(/<\?xml[^>]*\?>/i, '').trim();

		if (!xmlString) {
			return { root: null };
		}

		// Handle self-closing tags
		const selfClosingTagRegex = /<(\w+)([^>]*?)\/>/g;
		xmlString = xmlString.replace(selfClosingTagRegex, '<$1$2></$1>');

		// Basic tag matching
		const tagRegex = /<(\w+)([^>]*?)>(.*?)<\/\1>/s;
		const match = xmlString.match(tagRegex);

		if (!match) {
			// Try to match opening tag without content
			const openTagRegex = /<(\w+)([^>]*?)>/;
			const openMatch = xmlString.match(openTagRegex);
			if (openMatch) {
				const attributes = this.parseAttributes(openMatch[2]);
				return {
					root: {
						name: openMatch[1],
						attributes,
						content: '',
						children: [],
					},
				};
			}
			return { root: null };
		}

		const [, tagName, attributeString, content] = match;
		const attributes = this.parseAttributes(attributeString);
		const children = this.parseChildren(content);

		return {
			root: {
				name: tagName,
				attributes,
				content: children.length === 0 ? content.trim() : '',
				children,
			},
		};
	}

	/**
	 * Parse XML attributes
	 */
	private parseAttributes(attributeString: string): Record<string, string> {
		const attributes: Record<string, string> = {};
		const attrRegex = /(\w+(?::\w+)?)="([^"]*)"/g;
		let match;

		while ((match = attrRegex.exec(attributeString)) !== null) {
			attributes[match[1]] = match[2];
		}

		return attributes;
	}

	/**
	 * Parse XML children elements
	 */
	private parseChildren(content: string): XMLElement[] {
		const children: XMLElement[] = [];
		const tagRegex = /<(\w+)([^>]*?)>(.*?)<\/\1>/gs;
		let match;

		while ((match = tagRegex.exec(content)) !== null) {
			const [, tagName, attributeString, tagContent] = match;
			const attributes = this.parseAttributes(attributeString);
			const grandchildren = this.parseChildren(tagContent);

			children.push({
				name: tagName,
				attributes,
				content: grandchildren.length === 0 ? tagContent.trim() : '',
				children: grandchildren,
			});
		}

		return children;
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
		ws.serializeAttachment(clientData);
	}

	private getClientData(ws: WebSocket): XMPPClient | null {
		return ws.deserializeAttachment();
	}
}
