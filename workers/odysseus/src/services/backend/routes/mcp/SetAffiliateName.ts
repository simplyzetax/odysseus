import { app } from '@core/app';
import { getDB } from '@core/db/client';
import { ACCOUNTS } from '@core/db/schemas/accounts';
import { odysseus } from '@core/error';
import { acidMiddleware } from '@middleware/auth/accountIdMiddleware';
import { FortniteProfile } from '@utils/mcp/base-profile';
import { eq } from 'drizzle-orm';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { ratelimitMiddleware } from '@middleware/core/rateLimitMiddleware';
import { mcpValidationMiddleware } from '@middleware/game/mcpValidationMiddleware';

const setAffiliateNameSchema = z.object({
    affiliateName: z.string(),
});

app.post(
    '/fortnite/api/game/v2/profile/:accountId/client/SetAffiliateName',
    zValidator('json', setAffiliateNameSchema),
    acidMiddleware,
    ratelimitMiddleware({
        capacity: 10,
        initialTokens: 3,
        refillRate: 0.5,
    }),
    mcpValidationMiddleware,
    async (c) => {
        const { affiliateName } = c.req.valid('json');

        const db = getDB(c.var.databaseIdentifier);

        const [creatorAccount] = await db.select().from(ACCOUNTS).where(eq(ACCOUNTS.displayName, affiliateName));
        if (!creatorAccount) {
            return odysseus.basic.notFound.withMessage('Affiliate name not found').toResponse();
        }

        if (!creatorAccount.creator) {
            return odysseus.basic.notFound.withMessage('Creator account not verified').toResponse();
        }

        const now = new Date().toISOString();

        const profile = await FortniteProfile.construct(c.var.accountId, c.var.profileType, c.var.databaseIdentifier);

        profile.trackChange({
            changeType: 'statModified',
            name: 'mtx_affiliate_set_time',
            value: now,
        });

        profile.trackChange({
            changeType: 'statModified',
            name: 'mtx_affiliate',
            value: affiliateName,
        });

        c.executionCtx.waitUntil(profile.updateAttribute('mtx_affiliate_set_time', now));
        c.executionCtx.waitUntil(profile.updateAttribute('mtx_affiliate', affiliateName));

        return c.json(profile.createResponse());
    },
);
