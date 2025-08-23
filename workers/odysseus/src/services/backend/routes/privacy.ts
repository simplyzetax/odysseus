import { app } from '@core/app';
import { getDB } from '@core/db/client';
import { ACCOUNTS, privacySettingsSchema } from '@core/db/schemas/account';
import { arktypeValidator } from '@hono/arktype-validator';
import { accountMiddleware } from '@middleware/auth/accountMiddleware';
import { ratelimitMiddleware } from '@middleware/core/rateLimitMiddleware';
import { eq } from 'drizzle-orm';

app.get('/fortnite/api/game/v2/privacy/account/:accountId', accountMiddleware, async (c) => {
	return c.json({
		...c.var.account.settings.privacy,
		accountId: c.var.account.id,
	});
});

app.post(
	'/fortnite/api/game/v2/privacy/account/:accountId',
	accountMiddleware,
	arktypeValidator('json', privacySettingsSchema),
	ratelimitMiddleware({
		capacity: 10,
		initialTokens: 10,
		refillRate: 0.5,
	}),
	async (c) => {
		const db = getDB(c.var.databaseIdentifier);

		const body = c.req.valid('json');

		const [account] = await db
			.update(ACCOUNTS)
			.set({
				settings: {
					...c.var.account.settings,
					privacy: {
						...c.var.account.settings.privacy,
						...body,
					},
				},
			})
			.where(eq(ACCOUNTS.id, c.var.account.id))
			.returning({ settings: ACCOUNTS.settings });

		return c.json({
			...account.settings.privacy,
			accountId: c.var.account.id,
		});
	},
);
