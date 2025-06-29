import { app } from '@core/app';
import { odysseus } from '@core/error';
import { ratelimitMiddleware } from '@middleware/core/rateLimitMiddleware';
import { parseEpicManifest } from '@utils/manifest/manifestParser';

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

		return c.text(parsedManifest);
	},
);
