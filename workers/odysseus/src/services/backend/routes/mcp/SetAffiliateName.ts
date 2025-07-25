import { app } from '@core/app';
import { getDB } from '@core/db/client';
import { ACCOUNTS } from '@core/db/schemas/account';
import { odysseus } from '@core/error';
import { arktypeValidator } from '@hono/arktype-validator';
import { acidMiddleware } from '@middleware/auth/accountIdMiddleware';
import { FortniteProfile } from '@utils/mcp/base-profile';
import { eq } from 'drizzle-orm';
import { type } from 'arktype';
import { ratelimitMiddleware } from '@middleware/core/rateLimitMiddleware';
import { mcpValidationMiddleware } from '@middleware/game/mcpValidationMiddleware';
import { ATTRIBUTE_KEYS } from '@utils/mcp/constants';

const setAffiliateNameSchema = type({
	affiliateName: 'string',
});

app.post(
	'/fortnite/api/game/v2/profile/:accountId/client/SetAffiliateName',
	arktypeValidator('json', setAffiliateNameSchema),
	acidMiddleware,
	ratelimitMiddleware({
		capacity: 10,
		initialTokens: 3,
		refillRate: 0.5,
	}),
	mcpValidationMiddleware,
	async (c) => {
		const { affiliateName } = c.req.valid('json');

		const db = getDB(c.var.cacheIdentifier);

		const [creatorAccount] = await db.select().from(ACCOUNTS).where(eq(ACCOUNTS.displayName, affiliateName));
		if (!creatorAccount) {
			return odysseus.basic.notFound.withMessage('Affiliate name not found').toResponse();
		}

		if (!creatorAccount.creator) {
			return odysseus.basic.notFound.withMessage('Creator account not verified').toResponse();
		}

		const now = new Date().toISOString();

		const profile = await FortniteProfile.fromAccountId(c.var.accountId, c.var.profileType, c.var.cacheIdentifier);

		profile.trackChange({
			changeType: 'statModified',
			name: ATTRIBUTE_KEYS.MTX_AFFILIATE_SET_TIME,
			value: now,
		});

		profile.trackChange({
			changeType: 'statModified',
			name: ATTRIBUTE_KEYS.MTX_AFFILIATE,
			value: affiliateName,
		});

		await profile.updateAttribute(ATTRIBUTE_KEYS.MTX_AFFILIATE_SET_TIME, now);
		await profile.updateAttribute(ATTRIBUTE_KEYS.MTX_AFFILIATE, affiliateName);

		return c.json(profile.createResponse());
	},
);
