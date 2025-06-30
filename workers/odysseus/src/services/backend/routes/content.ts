import { app } from '@core/app';
import { getDB } from '@core/db/client';
import { HOTFIXES } from '@core/db/schemas/hotfixes';
import { odysseus } from '@core/error';
import { ratelimitMiddleware } from '@middleware/core/rateLimitMiddleware';
import { IniParser } from '@utils/misc/ini-parser';
import { and, eq } from 'drizzle-orm';
import { devAuthMiddleware } from '@middleware/auth/devAuthMiddleware';

app.get(
	'/Builds/Fortnite/Content/CloudDir/:ini{.+\\.ini}',
	ratelimitMiddleware({
		initialTokens: 10,
		refillRate: 0.5,
		capacity: 10,
	}),
	async (c) => {
		const db = getDB(c.var.cacheIdentifier);

		const hotfixes = await db
			.select()
			.from(HOTFIXES)
			.where(and(eq(HOTFIXES.filename, 'Content.ini'), eq(HOTFIXES.enabled, true)));
		const iniParser = new IniParser(hotfixes);

		const ini = iniParser.getIniForFile('Content.ini');
		if (!ini) {
			return odysseus.cloudstorage.fileNotFound.withMessage('Content file not found').toResponse();
		}
		return c.body(ini);
	},
);

// Route for .chunk files
app.get('/Builds/Fortnite/Content/CloudDir/:chunk{.+\\.chunk}', async (c) => {
	const url = new URL(c.req.url);
	url.pathname = '/Odysseus.chunk';

	const file = await c.env.ASSETS.fetch(url.toString());
	const fileArrayBuffer = await file.arrayBuffer();

	return c.body(fileArrayBuffer);
});

const manifestKey = '/manifests/manifest.json';

app.get(
	'/Builds/Fortnite/Content/CloudDir/:manifest{.+\\.manifest}',
	ratelimitMiddleware({
		initialTokens: 10,
		refillRate: 0.5,
		capacity: 10,
	}),
	async (c) => {
		const manifest = await c.env.R2.get(manifestKey);
		if (!manifest) {
			return odysseus.cloudstorage.fileNotFound.withMessage('Manifest file not found').toResponse();
		}

		//TODO: See if it's possible to make Fortnite download custom binaries or run commands via the manifest

		const json = c.req.query('json') === 'true';

		if (json) {
			const parseManifest = await c.env.MANIFESTIFY.parseEpicManifest(new Uint8Array(await manifest.arrayBuffer()));
			return c.json(parseManifest);
		}

		c.res.headers.set('Content-Type', 'application/octet-stream');
		return c.body(await manifest.arrayBuffer());
	},
);

app.post('/Builds/Fortnite/Content/CloudDir/:manifest{.+\\.manifest}', devAuthMiddleware, async (c) => {
	const manifest = await c.req.json();

	const manifestBytes = await c.env.MANIFESTIFY.createEpicManifest(manifest);
	const result = await c.env.R2.put(manifestKey, manifestBytes);
	return c.json({ message: 'Manifest updated successfully', key: manifestKey, sha256: result?.checksums.sha256 });
});
