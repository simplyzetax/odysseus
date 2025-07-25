import { cacheIdentifierMiddleware } from '@middleware/core/cacheIdentifierMiddleware';
import { responseEnhancementsMiddleware } from '@middleware/core/remMiddleware';
import { mcpCorrectionMiddleware } from '@middleware/game/mcpCorrectionMiddleware';
import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';

import { logger } from 'hono/logger';
import { odysseus } from './error';
import { Bindings } from '@otypes/bindings';
import { DatabaseError } from './db/error';

/**
 * The main app
 */
const app = new Hono<{ Bindings: Bindings; Variables: { cacheIdentifier: string } }>()
	.use(responseEnhancementsMiddleware)
	.use(logger())
	.use(cacheIdentifierMiddleware)
	.use('/fortnite/api/game/v2/profile/*', mcpCorrectionMiddleware);

app.onError((err, c) => {
	console.error(err);
	if (err instanceof HTTPException) {
		return err.getResponse();
	} else if (err instanceof DatabaseError) {
		return odysseus.internal.dataBaseError.withMessage(err.message).toResponse();
	} else if (err instanceof Error) {
		return odysseus.internal.serverError.withMessage(err.message).toResponse();
	}
	return odysseus.internal.serverError.withMessage('An unknown error occurred').toResponse();
});

app.notFound(() => odysseus.basic.notFound.toResponse());

export { app };
