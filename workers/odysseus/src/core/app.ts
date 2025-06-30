import { cacheIdentifierMiddleware } from '@middleware/core/cacheIdentifierMiddleware';
import { responseEnhancementsMiddleware } from '@middleware/core/remMiddleware';
import { mcpCorrectionMiddleware } from '@middleware/game/mcpCorrectionMiddleware';
import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';

import { logger } from 'hono/logger';
import { odysseus } from './error';
import { Bindings } from '@otypes/bindings';

/**
 * The main app
 */
const app = new Hono<{ Bindings: Bindings; Variables: { cacheIdentifier: string } }>();
export type App = typeof app;

app.use(responseEnhancementsMiddleware);
app.use(logger());
app.use(cacheIdentifierMiddleware);
app.use('/fortnite/api/game/v2/profile/*', mcpCorrectionMiddleware);

app.onError((err, c) => {
	console.error(err);
	if (err instanceof HTTPException) {
		return err.getResponse();
	} else if (err instanceof Error) {
		if (err.message.includes('Failed query:')) {
			return odysseus.internal.serverError.withMessage('Failed database query. Look at the logs for more details.').toResponse();
		}
		return odysseus.internal.serverError.withMessage(err.message).toResponse();
	}
	return odysseus.internal.serverError.withMessage('An unknown error occurred').toResponse();
});

app.notFound((c) => odysseus.basic.notFound.toResponse());

export { app };
