import { odysseus } from '@core/error';
import { JoinPartyConnection, PartyConfig, PartyData, PartyInvite, PartyMember, PartyUpdate } from '@otypes/fortnite/party';
import { nanoid } from 'nanoid';
import { getDB } from '@core/db/client';
import { FRIENDS } from '@core/db/schemas/friends';
import { eq, and } from 'drizzle-orm';
import type { Context } from 'hono';
import { Bindings } from '@otypes/bindings';

export class Party implements PartyData {
	id!: string;
	created_at!: string;
	config!: PartyConfig;
	updated_at!: string;
	revision!: number;
	invites!: PartyInvite[];
	meta!: Record<string, string>;
	members!: PartyMember[];

	constructor(info?: PartyData) {
		if (info) {
			Object.assign(this, info);
		} else {
			const now = new Date().toISOString();
			Object.assign(this, {
				id: nanoid(),
				created_at: now,
				updated_at: now,
				revision: 0,
				invites: [],
				meta: {},
				members: [],
				config: {
					type: 'DEFAULT',
					joinability: 'OPEN',
					discoverability: 'ALL',
					sub_type: 'default',
					max_size: 16,
					invite_ttl: 14400,
					join_confirmation: true,
					intention_ttl: 60,
				},
			});
		}
	}

	getData(): PartyData {
		return {
			id: this.id,
			created_at: this.created_at,
			updated_at: this.updated_at,
			config: this.config,
			members: this.members,
			meta: this.meta,
			invites: this.invites,
			revision: this.revision,
		};
	}

	/**
	 * Save party data to Cloudflare KV
	 */
	async saveToKV(kv: KVNamespace) {
		await kv.put(`party:${this.id}`, JSON.stringify(this.getData()));
	}

	/**
	 * Load party data from Cloudflare KV
	 */
	static async loadFromKV(kv: KVNamespace, partyId: string): Promise<Party | undefined> {
		const data = await kv.get(`party:${partyId}`, 'json');
		if (!data) return undefined;
		return new Party(data as PartyData);
	}

	/**
	 * Get accepted friends for a user
	 */
	static async getFriends(c: Context, accountId: string): Promise<string[]> {
		const db = getDB(c.var.cacheIdentifier);

		const friends = await db
			.select({ targetId: FRIENDS.targetId })
			.from(FRIENDS)
			.where(and(eq(FRIENDS.accountId, accountId), eq(FRIENDS.status, 'ACCEPTED')));

		return friends.map((f) => f.targetId);
	}

	/**
	 * Check if two users are friends
	 */
	static async areFriends(c: Context, accountId1: string, accountId2: string): Promise<boolean> {
		const db = getDB(c.var.cacheIdentifier);

		const [friendship] = await db
			.select()
			.from(FRIENDS)
			.where(and(eq(FRIENDS.accountId, accountId1), eq(FRIENDS.targetId, accountId2), eq(FRIENDS.status, 'ACCEPTED')));

		return !!friendship;
	}

	/**
	 * Get mutual friends between the inviter's party and the invited user
	 */
	async getMutualFriends(c: Context, invitedId: string): Promise<string[]> {
		const invitedFriends = await Party.getFriends(c, invitedId);

		return this.members.filter((member) => invitedFriends.includes(member.account_id)).map((member) => member.account_id);
	}

	async update(updated: PartyUpdate, kv: KVNamespace, c: Context) {
		Object.assign(this.config, updated.config);
		Object.assign(this.meta, updated.meta.update);

		this.meta = Object.fromEntries(Object.entries(this.meta).filter(([key]) => !updated.meta.delete.includes(key)));

		this.updated_at = new Date().toISOString();
		this.revision++;

		const captain = this.members.find((x) => x.role == 'CAPTAIN');

		if (!captain) {
			throw odysseus.party.memberNotFound.withMessage('cannot find party leader.');
		}

		await this.saveToKV(kv);

		this.broadcastMessage(
			{
				sent: new Date().toISOString(),
				type: 'com.epicgames.social.party.notification.v0.PARTY_UPDATED',
				revision: this.revision,
				ns: 'Fortnite',
				party_id: this.id,
				captain_id: captain.account_id,
				party_state_removed: updated.meta.delete,
				party_state_updated: updated.meta.update,
				party_state_overridden: {},
				party_privacy_type: this.config.joinability,
				party_type: this.config.type,
				party_sub_type: this.config.sub_type,
				max_number_of_members: this.config.max_size,
				invite_ttl_seconds: this.config.invite_ttl,
				created_at: this.created_at,
				updated_at: this.updated_at,
			},
			c,
		);
	}

	async updateMember(memberId: string, memberDn: string, meta: PartyData['meta'], kv: KVNamespace, c: Context) {
		const member = this.members.find((x) => x.account_id == memberId);

		if (!member) {
			throw odysseus.party.memberNotFound.with(memberId);
		}

		member.meta = Object.fromEntries(Object.entries(member.meta).filter(([key]) => !meta.delete.includes(key)));

		Object.assign(member.meta, meta.update);

		member.revision++;
		member.updated_at = new Date().toISOString();

		await this.saveToKV(kv);

		this.broadcastMessage(
			{
				sent: new Date(),
				type: 'com.epicgames.social.party.notification.v0.MEMBER_STATE_UPDATED',
				revision: member.revision,
				ns: 'Fortnite',
				party_id: this.id,
				account_id: member.account_id,
				account_dn: memberDn,
				member_state_removed: meta.delete || [],
				member_state_updated: meta.update || {},
				joined_at: member.joined_at,
				updated_at: member.updated_at,
			},
			c,
		);
	}

	async inviteUser(invitedId: string, inviterId: string, meta: Record<string, string>, kv: KVNamespace, c: Context) {
		const inviter = this.members.find((x) => x.account_id == inviterId);

		if (!inviter) {
			throw odysseus.party.memberNotFound.variable([inviterId]);
		}

		// Check if inviter and invited user are friends
		const areFriends = await Party.areFriends(c, inviterId, invitedId);
		if (!areFriends) {
			throw odysseus.party.pingForbidden.withMessage(`User [${inviterId}] is not authorized to invite [${invitedId}] - not friends.`);
		}

		const invite = {
			party_id: this.id,
			sent_by: inviterId,
			meta: meta,
			sent_to: invitedId,
			sent_at: new Date(),
			updated_at: new Date(),
			expires_at: new Date(Date.now() + 1000 * 60 * 60),
			status: 'SENT',
		};

		this.invites.push(invite);
		await this.saveToKV(kv);

		// Get mutual friends for the notification
		const mutualFriends = await this.getMutualFriends(c, invitedId);

		this.broadcastMessage(
			{
				sent: new Date(),
				type: 'com.epicgames.social.party.notification.v0.INITIAL_INVITE',
				meta: meta,
				ns: 'Fortnite',
				party_id: this.id,
				inviter_id: inviterId,
				inviter_dn: inviter.meta['urn:epic:member:dn_s'] || inviterId,
				invitee_id: invitedId,
				sent_at: invite.sent_at,
				updated_at: invite.updated_at,
				friends_ids: mutualFriends,
				members_count: this.members.length,
			},
			c,
		);

		/*xmppApi.sendMesage(`${invitedId}@xmpp.neonitedev.live`, {
			sent: new Date(),
			type: 'com.epicgames.social.party.notification.v0.INITIAL_INVITE',
			meta: meta,
			ns: 'Fortnite',
			party_id: this.id,
			inviter_id: inviterId,
			inviter_dn: inviter['connections'][0].meta['urn:epic:member:dn_s'],
			invitee_id: invitedId,
			sent_at: invite.sent_at,
			updated_at: invite.updated_at,
			friends_ids: this.members
				.filter((member) => invitedFriends.find((friend) => friend.accountId == member.account_id))
				.map((x) => x.account_id),
			members_count: this.members.length,
		});
		*/
	}

	async cancelInvite(sent_to: string, kv: KVNamespace, c: Context) {
		const invite = this.invites.find((x) => x.sent_to == sent_to);

		if (!invite) {
			throw odysseus.party.memberNotFound.withMessage('invitation not found');
		}

		this.invites = this.invites.filter((x) => x.sent_to != sent_to);
		await this.saveToKV(kv);

		const inviter = this.members.find((x) => x.account_id == invite.sent_by);

		this.broadcastMessage(
			{
				sent: new Date(),
				type: 'com.epicgames.social.party.notification.v0.INVITE_CANCELLED',
				meta: invite.meta,
				ns: 'Fortnite',
				party_id: this.id,
				inviter_id: invite.sent_by,
				inviter_dn: inviter ? inviter.meta['urn:epic:member:dn_s'] || invite.sent_by : '',
				invitee_id: invite.sent_to,
				sent_at: invite.sent_at,
				updated_at: new Date(),
				expires_at: invite.expires_at,
			},
			c,
		);

		/*
		xmppApi.sendMesage(`${sent_to}@xmpp.neonitedev.live`, {
			sent: new Date(),
			type: 'com.epicgames.social.party.notification.v0.INVITE_CANCELLED',
			meta: invite.meta,
			ns: 'Fortnite',
			party_id: this.id,
			inviter_id: invite.sent_by,
			inviter_dn: inviter ? inviter['connections'][0].meta['urn:epic:member:dn_s'] : '',
			invitee_id: invite.sent_to,
			sent_at: invite.sent_at,
			updated_at: new Date(),
			expires_at: invite.expires_at,
		});
		*/
	}

	async removeMember(memeberId: string, kv: KVNamespace) {
		const memeber = this.members.find((x) => x.account_id == memeberId);

		if (!memeber) {
			throw odysseus.party.memberNotFound.with(memeberId);
		}

		this.members = this.members.filter((x) => x.account_id != memeberId);
		await this.saveToKV(kv);

		/*this.broadcastMessage(
            {
                account_id: memeberId,
                member_state_update: {},
                ns: "Fortnite",
                party_id: this.id,
                revision: this.revision,
                sent: new Date(),
                type: "com.epicgames.social.party.notification.v0.MEMBER_LEFT"
            }
        )
        */
	}

	async reconnect(connection: JoinPartyConnection, accountId: string, kv: KVNamespace, _meta?: Record<string, string>) {
		const member = this.members.find((x) => x.account_id == accountId);

		if (!member) {
			throw odysseus.party.memberNotFound.with(accountId);
		}

		member.connections = [connection];
		await this.saveToKV(kv);
		/*
        this.broadcastMessage(
            {
                sent: new Date(),
                type: "com.epicgames.social.party.notification.v0.MEMBER_JOINED",
                connection: member.connections[0],
                revision: member.revision,
                ns: "Fortnite",
                party_id: this.id,
                account_id: member.account_id,
                account_dn: accountId,
                member_state_updated: connection.meta,
                joined_at: member.joined_at,
                updated_at: member.updated_at
            }
        );*/
	}

	async addMember(connection: JoinPartyConnection, accountId: string, kv: KVNamespace, meta?: Record<string, string>) {
		const member: PartyMember = {
			account_id: accountId,
			connections: [connection],
			joined_at: new Date().toISOString(),
			updated_at: new Date().toISOString(),
			meta: meta || {},
			revision: 0,
			role: this.members.length == 0 ? 'CAPTAIN' : 'MEMBER',
		};

		this.members.push(member);
		await this.saveToKV(kv);

		/*this.broadcastMessage(
            {
                sent: new Date(),
                type: "com.epicgames.social.party.notification.v0.MEMBER_JOINED",
                connection: member.connections[0],
                revision: member.revision,
                ns: "Fortnite",
                party_id: this.id,
                account_id: member.account_id,
                account_dn: accountId,
                member_state_updated: connection.meta,
                joined_at: member.joined_at,
                updated_at: member.updated_at
            }
        );
        */
	}

	async deleteParty(kv: KVNamespace) {
		await kv.delete(`party:${this.id}`);
	}

	broadcastMessage(message: object, c: Context<{ Bindings: Bindings }>) {
		const accountIds = this.members.map((x) => x.account_id);
		console.log('Broadcasting party message to accounts:', accountIds);

		// Send to XMPP Durable Object
		const xmppId = c.env.XmppServer.idFromName('xmpp-server');
		const xmppStub = c.env.XmppServer.get(xmppId);

		// Call the sendMessageMulti method on the XMPP server
		return xmppStub.sendMessageMulti(accountIds, message);
	}
}
