import { app } from '@core/app';
import { getDB } from '@core/db/client';
import { ACCOUNTS } from '@core/db/schemas/account';
import { ratelimitMiddleware } from '@middleware/core/rateLimitMiddleware';
import { eq } from 'drizzle-orm';

app.get(
	'/affiliate/api/public/affiliates/slug/:slug',
	ratelimitMiddleware({
		capacity: 10,
		initialTokens: 10,
		refillRate: 0.5,
	}),
	async (c) => {
		const slug = c.req.param('slug');

		const db = getDB(c);

		const [account] = await db.select().from(ACCOUNTS).where(eq(ACCOUNTS.displayName, slug));
		if (!account) {
			return c.sendStatus(404);
		}

		return c.json({
			id: account.id,
			slug: account.displayName,
			displayName: account.displayName,
			status: account.banned ? 'BANNED' : 'ACTIVE',
			verified: account.creator,
		});
	}
);
