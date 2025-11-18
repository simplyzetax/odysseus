import { app } from '@core/app';
import { acidMiddleware } from '@middleware/auth/accountIdMiddleware';
import { ratelimitMiddleware } from '@middleware/core/rateLimitMiddleware';
import { FortniteProfile } from '@utils/mcp/base-profile';
import { mcpValidationMiddleware } from '@middleware/game/mcpValidationMiddleware';
import { odysseus } from '@core/error';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';

const setItemFavoriteStatusSchema = z.object({
    bFavorite: z.boolean(),
    targetItemId: z.string(),
});

app.post(
    '/fortnite/api/game/v2/profile/:accountId/client/SetItemFavoriteStatus',
    zValidator('json', setItemFavoriteStatusSchema),
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

        const body = c.req.valid('json');

        const item = await profile.items.find('id', body.targetItemId, false);
        if (!item) {
            return odysseus.mcp.invalidPayload.withMessage('Item not found').toResponse();
        }

        profile.changes.track({
            changeType: 'itemAttrChanged',
            itemId: item.id,
            attributeName: 'favorite',
            attributeValue: body.bFavorite,
        });

        await profile.changes.commit(c);

        return c.json(profile.createResponse());
    },
);
