import { app } from '@core/app';
import { odysseus } from '@core/error';
import { ratelimitMiddleware } from '@middleware/core/rateLimitMiddleware';
import { parseEpicManifest, createEpicManifest } from '@utils/manifest/manifestParser';

app.post(
	'/manifest/parse',
	ratelimitMiddleware({
		capacity: 1,
		refillRate: 0.25,
		initialTokens: 2,
	}),
	async (c) => {
		const manifest = await c.req.arrayBuffer();

		if (!manifest) {
			return c.sendError(odysseus.basic.badRequest.withMessage('No manifest file provided'));
		}

		const parsedManifest = await parseEpicManifest(new Uint8Array(manifest));

		return c.json(JSON.parse(parsedManifest));
	},
);

app.post(
	'/manifest/create',
	ratelimitMiddleware({
		capacity: 1,
		refillRate: 0.25,
		initialTokens: 2,
	}),
	async (c) => {
		const manifestJson = await c.req.json();

		if (!manifestJson) {
			return c.sendError(odysseus.basic.badRequest.withMessage('No manifest JSON provided'));
		}

		// Convert JSON object to string for WASM function
		const manifestJsonString = JSON.stringify(manifestJson);
		const createdManifest = await createEpicManifest(manifestJsonString);

		// Return the created manifest as binary data
		return new Response(createdManifest, {
			headers: {
				'Content-Type': 'application/octet-stream',
				'Content-Disposition': 'attachment; filename="manifest.chunk"',
			},
		});
	},
);
