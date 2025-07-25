import { app } from '@core/app';
import { odysseus } from '@core/error';
import { devAuthMiddleware } from '@middleware/auth/devAuthMiddleware';
import { ratelimitMiddleware } from '@middleware/core/rateLimitMiddleware';
import { nanoid } from 'nanoid';

const eulaKey = '/eula/';

app.get(
	'/api/public/agreements/:appName/account/:accountId',
	ratelimitMiddleware({
		initialTokens: 10,
		refillRate: 0.5,
		capacity: 10,
	}),
	async (c) => {
		const appName = c.req.param('appName');

		const eula = await c.env.R2.get(`${eulaKey}${appName}.html`);
		if (!eula) {
			return odysseus.cloudstorage.fileNotFound.withMessage('EULA file not found').toResponse();
		}

		return c.json({
			key: appName,
			version: 1,
			revision: 1,
			title: 'Odysseus End User License Agreement',
			body: await eula.text(),
			locale: 'en',
			createdTimestamp: eula.uploaded.toISOString(),
			lastModifiedTimestamp: eula.uploaded.toISOString(),
			agentUserName: 'none',
			status: 'ACTIVE',
			custom: false,
			wasDeclined: false,
			hasResponse: false,
		});
	},
);

app.post('/eulatracking/api/public/agreements/:appName', devAuthMiddleware, async (c) => {
	const appName = c.req.param('appName');

	const body = await c.req.text();

	const result = await c.env.R2.put(`${eulaKey}${appName}.html`, body);

	return c.json({ message: 'EULA updated successfully', key: `${eulaKey}${appName}.json`, sha256: result?.checksums.sha256 });
});

app.get('/eulatracking/api/shared/agreements/:appName', async (c) => {
	const appName = c.req.param('appName');

	const eula = await c.env.R2.get(`${eulaKey}${appName}.html`);
	if (!eula) {
		return odysseus.cloudstorage.fileNotFound.withMessage('EULA file not found').toResponse();
	}

	const origin = c.req.header('Origin');

	return c.json({
		id: nanoid(),
		key: appName,
		version: 1,
		revision: 1,
		title: 'Odysseus End User License Agreement',
		body: await eula.text(),
		locale: 'en',
		createdTimestamp: eula.uploaded.toISOString(),
		lastModifiedTimestamp: eula.uploaded.toISOString(),
		agentUserName: 'none',
		status: 'ACTIVE',
		custom: false,
		url: `${origin}/api/public/agreements/${appName}`,
		bodyFormat: 'HTML',
	});
});

app.post('/eulatracking/api/public/agreements/fn/version/1/account/:accountId/accept', (c) => c.sendStatus(204));
