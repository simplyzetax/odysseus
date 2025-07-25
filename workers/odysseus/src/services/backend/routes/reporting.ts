import { app } from '@core/app';
import { getDB } from '@core/db/client';
import { ACCOUNTS } from '@core/db/schemas/account';
import { REPORTS } from '@core/db/schemas/reports';
import { arktypeValidator } from '@hono/arktype-validator';
import { accountMiddleware } from '@middleware/auth/accountMiddleware';
import { type } from 'arktype';
import { eq } from 'drizzle-orm';

const reportBodySchema = type({
	reason: 'string',
	details: 'string',
	playlistName: 'string',
});

app.post(
	'/game/v2/toxicity/account/:accountId/report/:offenderId',
	arktypeValidator('json', reportBodySchema),
	accountMiddleware,
	async (c) => {
		const db = getDB(c.var.cacheIdentifier);
		const [offenderAccount] = await db
			.select()
			.from(ACCOUNTS)
			.where(eq(ACCOUNTS.id, c.req.param('offenderId')));
		if (!offenderAccount) return c.sendStatus(404);

		const body = c.req.valid('json');

		await db.insert(REPORTS).values({
			reason: body.reason,
			details: body.details,
			playlistName: body.playlistName,
			accountId: c.var.account.id,
		});

		//TODO: Send embed to discord webhook or create a dashboard SOON-TM

		return c.sendStatus(204);
	},
);
