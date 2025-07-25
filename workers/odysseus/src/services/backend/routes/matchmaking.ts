import { app } from '@core/app';
import { accountMiddleware } from '@middleware/auth/accountMiddleware';

app.get('/fortnite/api/matchmaking/session/findPlayer/:accountId', async (c) => {
	return c.sendStatus(200);
});

app.get('/fortnite/api/game/v2/matchmaking/account/:accountId/session/:sessionId', async (c) => {
	return c.json({
		accountId: c.req.param('accountId'),
		sessionId: c.req.param('sessionId'),
		key: 'none',
	});
});

app.get('/fortnite/api/matchmaking/session/:sessionId', async (c) => {
	return c.json({
		allowInvites: false,
		allowJoinInProgress: false,
		allowJoinViaPresence: true,
		allowJoinViaPresenceFriendsOnly: false,
		attributes: {},
		buildUniqueId: c.req.param('sessionId').split(':')[0],
		id: c.req.param('sessionId'),
		isDedicated: true,
		lastUpdated: new Date().toISOString(),
		maxPrivatePlayers: 0,
		maxPublicPlayers: 0,
		openPrivatePlayers: 0,
		openPublicPlayers: 0,
		ownerId: c.req.param('sessionId').split(':')[0],
		ownerName: c.req.param('sessionId').split(':')[1],
		privatePlayers: [],
		publicPlayers: [],
		serverAddress: '127.0.0.1', //TODO: Implement properly
		serverName: c.req.param('sessionId').split(':')[0],
		serverPort: 7777, //TODO: Implement properly
		shouldAdvertise: false,
		started: false,
		totalPlayers: 0,
		usesPresence: false,
		usesStats: false,
	});
});

app.get('/fortnite/api/game/v2/matchmakingservice/ticket/player/:accountId', accountMiddleware, async (c) => {
	const bucketId = c.req.query('bucketId');

	if (typeof bucketId != 'string') return c.sendStatus(400);
	if (bucketId.split(':').length != 4) return c.sendStatus(400);

	const host = c.req.header('Host');

	return c.json({
		serviceUrl: `ws://${host}`,
		ticketType: 'mms-player',
		payload: '69=', //TODO Implement properly
		signature: '420=', //TODO Implement properly
	});
});
