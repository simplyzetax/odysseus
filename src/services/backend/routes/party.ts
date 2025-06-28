import { app } from '@core/app';
import { odysseus } from '@core/error';
import { Party } from '@utils/party/base';
import { accountMiddleware } from '@middleware/auth/accountMiddleware';
import { ratelimitMiddleware } from '@middleware/core/rateLimitMiddleware';

/**
 * Create a new party
 */
app.post('/api/v1/:deploymentId/parties', ratelimitMiddleware(), accountMiddleware, async (c) => {
	const accountId = c.var.account.id;
	const body = await c.req.json();

	if (!body.join_info?.connection?.id) {
		return c.sendError(odysseus.party.userOffline.variable([accountId]));
	}

	// Check if user is already in a party
	const existingPartyKey = await c.env.KV.get(`user:${accountId}:party`);
	if (existingPartyKey) {
		const existingParty = await Party.loadFromKV(c.env.KV, existingPartyKey);
		if (existingParty) {
			return c.sendError(odysseus.party.alreadyInParty.variable([accountId, 'Fortnite']));
		}
	}

	const party = new Party();

	await party.addMember(
		{
			id: body.join_info.connection.id,
			meta: body.join_info.connection.meta || {},
			yield_leadership: false,
		},
		accountId,
		c.env.KV,
		body.join_info.meta,
	);

	await party.update(
		{
			config: body.config,
			meta: {
				delete: [],
				update: body.meta || {},
			},
		},
		c.env.KV,
	);

	// Store user -> party mapping
	await c.env.KV.put(`user:${accountId}:party`, party.id);

	return c.json(party.getData());
});

/**
 * Update party configuration
 */
app.patch('/api/v1/:deploymentId/parties/:partyId', ratelimitMiddleware(), accountMiddleware, async (c) => {
	const accountId = c.var.account.id;
	const partyId = c.req.param('partyId');
	const body = await c.req.json();

	const party = await Party.loadFromKV(c.env.KV, partyId);
	if (!party) {
		return c.sendError(odysseus.party.partyNotFound.variable([partyId]));
	}

	const captain = party.members.find((x) => x.role === 'CAPTAIN');
	if (!captain) {
		return c.sendError(odysseus.party.memberNotFound.withMessage('cannot find party leader.'));
	}

	if (accountId !== captain.account_id) {
		return c.sendError(odysseus.party.notLeader);
	}

	await party.update(
		{
			config: body.config || {},
			meta: {
				delete: body.meta?.delete || [],
				update: body.meta?.update || {},
			},
		},
		c.env.KV,
	);

	return c.sendStatus(204);
});

/**
 * Get party information
 */
app.get('/api/v1/:deploymentId/parties/:partyId', ratelimitMiddleware(), accountMiddleware, async (c) => {
	const partyId = c.req.param('partyId');

	const party = await Party.loadFromKV(c.env.KV, partyId);
	if (!party) {
		return c.sendError(odysseus.party.partyNotFound.variable([partyId]));
	}

	return c.json(party.getData());
});

/**
 * Update party member metadata
 */
app.patch('/api/v1/:deploymentId/parties/:partyId/members/:accountId/meta', ratelimitMiddleware(), accountMiddleware, async (c) => {
	const requestAccountId = c.var.account.id;
	const targetAccountId = c.req.param('accountId');
	const partyId = c.req.param('partyId');
	const body = await c.req.json();

	if (targetAccountId !== requestAccountId) {
		return c.sendError(odysseus.party.notYourAccount.variable([targetAccountId, requestAccountId]));
	}

	const party = await Party.loadFromKV(c.env.KV, partyId);
	if (!party) {
		return c.sendError(odysseus.party.partyNotFound.variable([partyId]));
	}

	const member = party.members.find((x) => x.account_id === targetAccountId);
	if (!member) {
		return c.sendError(odysseus.party.memberNotFound.variable([targetAccountId]));
	}

	await party.updateMember(member.account_id, requestAccountId, body, c.env.KV);

	return c.sendStatus(204);
});

/**
 * Join party by ID
 */
app.post('/api/v1/Fortnite/parties/:partyId/members/:accountId/join', ratelimitMiddleware(), accountMiddleware, async (c) => {
	const requestAccountId = c.var.account.id;
	const targetAccountId = c.req.param('accountId');
	const partyId = c.req.param('partyId');
	const body = await c.req.json();

	if (targetAccountId !== requestAccountId) {
		return c.sendError(odysseus.party.notYourAccount.variable([targetAccountId, requestAccountId]));
	}

	const party = await Party.loadFromKV(c.env.KV, partyId);
	if (!party) {
		return c.sendError(odysseus.party.partyNotFound.variable([partyId]));
	}

	const existing = party.members.find((x) => x.account_id === targetAccountId);

	if (existing) {
		await party.reconnect(body.connection, targetAccountId, c.env.KV);
		return c.json({
			status: 'JOINED',
			party_id: party.id,
		});
	}

	await party.addMember(body.connection, targetAccountId, c.env.KV, body.meta);
	await c.env.KV.put(`user:${targetAccountId}:party`, party.id);

	return c.json({
		status: 'JOINED',
		party_id: party.id,
	});
});

/**
 * Leave party
 */
app.delete('/api/v1/Fortnite/parties/:partyId/members/:accountId', ratelimitMiddleware(), accountMiddleware, async (c) => {
	const requestAccountId = c.var.account.id;
	const targetAccountId = c.req.param('accountId');
	const partyId = c.req.param('partyId');

	const party = await Party.loadFromKV(c.env.KV, partyId);
	if (!party) {
		return c.sendError(odysseus.party.partyNotFound.variable([partyId]));
	}

	const partyMember = party.members.find((x) => x.account_id === targetAccountId);
	if (!partyMember) {
		return c.sendError(odysseus.party.memberNotFound.variable([targetAccountId]));
	}

	const partyLeader = party.members.find((x) => x.role === 'CAPTAIN');
	if (!partyLeader) {
		return c.sendError(odysseus.internal.unknownError);
	}

	// Only allow self-leave or leader kick
	if (requestAccountId !== targetAccountId && partyLeader.account_id !== requestAccountId) {
		return c.sendError(odysseus.party.notLeader);
	}

	// Remove user -> party mapping
	await c.env.KV.delete(`user:${targetAccountId}:party`);

	if (party.members.length === 1) {
		await party.deleteParty(c.env.KV);
	} else {
		await party.removeMember(targetAccountId, c.env.KV);
	}

	return c.sendStatus(204);
});

/**
 * Get current user's parties and invites
 */
app.get('/api/v1/:deploymentId/user/:accountId', ratelimitMiddleware(), accountMiddleware, async (c) => {
	const requestAccountId = c.var.account.id;
	const targetAccountId = c.req.param('accountId');

	if (targetAccountId !== requestAccountId) {
		return c.sendError(odysseus.party.notYourAccount.variable([targetAccountId, requestAccountId]));
	}

	const currentParties = [];
	const userPartyId = await c.env.KV.get(`user:${targetAccountId}:party`);

	if (userPartyId) {
		const party = await Party.loadFromKV(c.env.KV, userPartyId);
		if (party) {
			currentParties.push(party.getData());
		}
	}

	//TODO: Implement pings system with KV
	return c.json({
		current: currentParties,
		pending: [],
		invites: [],
		pings: [],
	});
});

/**
 * Invite user to party
 */
app.post('/api/v1/:deploymentId/parties/:partyId/invites/:accountId', ratelimitMiddleware(), accountMiddleware, async (c) => {
	const requestAccountId = c.var.account.id;
	const inviteeAccountId = c.req.param('accountId');
	const partyId = c.req.param('partyId');
	const body = await c.req.json();

	if (inviteeAccountId === requestAccountId) {
		return c.sendError(odysseus.party.selfInvite);
	}

	const party = await Party.loadFromKV(c.env.KV, partyId);
	if (!party) {
		return c.sendError(odysseus.party.partyNotFound.variable([partyId]));
	}

	const member = party.members.find((x) => x.account_id === requestAccountId);
	if (!member) {
		return c.sendError(odysseus.party.memberNotFound.variable([requestAccountId]));
	}

	await party.inviteUser(inviteeAccountId, requestAccountId, body || {}, c.env.KV);

	return c.sendStatus(204);
});

/**
 * Voice chat connection endpoint
 */
app.post(
	'/api/v1/Fortnite/parties/:partyId/members/:accountId/conferences/connection',
	ratelimitMiddleware(),
	accountMiddleware,
	async (c) => {
		const requestAccountId = c.var.account.id;
		const targetAccountId = c.req.param('accountId');
		const partyId = c.req.param('partyId');

		if (targetAccountId !== requestAccountId) {
			return c.sendError(odysseus.party.notYourAccount.variable([targetAccountId, requestAccountId]));
		}

		const party = await Party.loadFromKV(c.env.KV, partyId);
		if (!party) {
			return c.sendError(odysseus.party.partyNotFound.variable([partyId]));
		}

		const partyMember = party.members.find((x) => x.account_id === targetAccountId);
		if (!partyMember) {
			return c.sendError(odysseus.party.memberNotFound.variable([targetAccountId]));
		}

		//TODO: Implement voice chat providers (Vivox, RTCP)
		const providers = {};

		return c.json({
			providers,
		});
	},
);
