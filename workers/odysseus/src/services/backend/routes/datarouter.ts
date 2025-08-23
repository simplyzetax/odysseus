import { app } from '@core/app';
import { getDB } from '@core/db/client';
import { ANALYTICS } from '@core/db/schemas/analytics';

app.post('/datarouter/api/v1/public/data', async (c) => {
	const db = getDB(c.var.databaseIdentifier);
	c.executionCtx.waitUntil(db.insert(ANALYTICS).values({ value: await c.req.json() }));
	return c.sendStatus(204);
});
