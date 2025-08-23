import { databaseIdentifierMiddleware } from '@middleware/core/databaseIdentifierMiddleware';
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
const app = new Hono<{ Bindings: Bindings; Variables: { databaseIdentifier: string } }>()
	.use(responseEnhancementsMiddleware)
	.use(logger())
	.use(databaseIdentifierMiddleware)
	.use('/fortnite/api/game/v2/profile/*', mcpCorrectionMiddleware);

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

app.notFound(() => odysseus.basic.notFound.toResponse());

export { app };
