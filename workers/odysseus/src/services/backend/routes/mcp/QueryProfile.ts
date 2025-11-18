import { app } from '@core/app';
import { acidMiddleware } from '@middleware/auth/accountIdMiddleware';
import { ratelimitMiddleware } from '@middleware/core/rateLimitMiddleware';
import { FortniteProfile } from '@utils/mcp/base-profile';
import { mcpValidationMiddleware } from '@middleware/game/mcpValidationMiddleware';
import { odysseus } from '@core/error';

app.post(
    '/fortnite/api/game/v2/profile/:accountId/client/QueryProfile',
    acidMiddleware,
    ratelimitMiddleware({
        capacity: 10,
        initialTokens: 10,
        refillRate: 0.5,
    }),
    mcpValidationMiddleware,
    async (c) => {

        const profile = await FortniteProfile.from(c.var.accountId, c.var.profileType);
        if (!profile) {
            return odysseus.mcp.profileNotFound.toResponse();
        }
        const profileObject = await profile.buildProfileObject();

        profile.changes.track({
            changeType: 'fullProfileUpdate',
            profile: profileObject,
        });

        return c.json(profile.createResponse());
    },
);
