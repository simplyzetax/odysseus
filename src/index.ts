/// <reference types="../.dmno/.typegen/global.d.ts" />

import { HTTPException } from 'hono/http-exception';
import { logger } from 'hono/logger';
import { app } from './core/app';
import { odysseus } from './core/error';
import { responseEnhancementsMiddleware } from './middleware/rem';
import { mcpCorrectionMiddleware } from './middleware/mcpcorrection';

app.use(responseEnhancementsMiddleware);
app.use('/fortnite/api/game/v2/profile/*', mcpCorrectionMiddleware)

// Automatically import all route files from all services
import.meta.glob('./services/*/routes/**/*.ts', { eager: true });

app.onError(async (err, c) => {
	if (err instanceof HTTPException) {
		return err.getResponse()
	} else if (err instanceof Error) {
		return c.sendError(odysseus.internal.serverError.withMessage(err.message))
	}
	return c.sendError(odysseus.internal.serverError.withMessage('An unknown error occurred'))
})

app.notFound((c) => c.sendError(odysseus.basic.notFound));

export default {
	fetch: app.fetch,
} satisfies ExportedHandler<Env>;