import { app } from '@core/app';
import { odysseus } from '@core/error';
import { acidMiddleware } from '@middleware/auth/accountIdMiddleware';
import { ratelimitMiddleware } from '@middleware/core/rateLimitMiddleware';
import { mcpValidationMiddleware } from '@middleware/game/mcpValidationMiddleware';
import { FortniteProfile } from '@utils/mcp/base-profile';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';

const setMtxPlatformSchema = z.object({
    newPlatform: z.string(),
});

app.post(
    '/fortnite/api/game/v2/profile/:accountId/client/SetMtxPlatform',
    zValidator('json', setMtxPlatformSchema),
    acidMiddleware,
    ratelimitMiddleware({
        capacity: 10,
        initialTokens: 3,
        refillRate: 0.5,
    }),
    mcpValidationMiddleware,
    async (c) => {
        const profile = await FortniteProfile.from(c.var.accountId, c.var.profileType);
        if (!profile) {
            return odysseus.mcp.profileNotFound.toResponse();
        }

        profile.changes.track({
            changeType: 'statModified',
            name: 'current_mtx_platform',
            value: c.req.valid('json').newPlatform || 'EpicPC',
        });

        await profile.changes.commit(c);

        return c.json(profile.createResponse());
    },
);
