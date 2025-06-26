import { persistentDoMiddleware } from '@middleware/core/cacheIdentifierMiddleware';
import { responseEnhancementsMiddleware } from '@middleware/core/remMiddleware';
import { mcpCorrectionMiddleware } from '@middleware/game/mcpCorrection';
import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';

import { logger } from 'hono/logger';
import { odysseus } from './error';
import { Bindings } from '@otypes/bindings';

/**
 * The main app
 */
const app = new Hono<{ Bindings: Bindings }>();

app.use(responseEnhancementsMiddleware);
app.use(logger());
app.use(persistentDoMiddleware);
app.use('/fortnite/api/game/v2/profile/*', mcpCorrectionMiddleware);

app.onError((err, c) => {
	if (err instanceof HTTPException) {
		return err.getResponse();
	} else if (err instanceof Error) {
		return c.sendError(odysseus.internal.serverError.withMessage(err.message));
	}
	return c.sendError(odysseus.internal.serverError.withMessage('An unknown error occurred'));
});

app.notFound((c) => c.sendError(odysseus.basic.notFound));

export { app };
