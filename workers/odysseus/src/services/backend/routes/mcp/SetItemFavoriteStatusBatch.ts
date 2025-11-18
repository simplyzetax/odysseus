import { app } from '@core/app';
import { acidMiddleware } from '@middleware/auth/accountIdMiddleware';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { odysseus } from '@core/error';
import { FortniteProfile } from '@utils/mcp/base-profile';
import { ITEMS } from '@core/db/schemas/items';
import { inArray } from 'drizzle-orm';
import { getDB } from '@core/db/client';
import { mcpValidationMiddleware } from '@middleware/game/mcpValidationMiddleware';

const setItemFavoriteStatusBatchSchema = z.object({
    itemIds: z.array(z.string()),
    itemFavStatus: z.boolean(),
});

app.post(
    '/fortnite/api/game/v2/profile/:accountId/client/SetItemFavoriteStatusBatch',
    zValidator('json', setItemFavoriteStatusBatchSchema),
    acidMiddleware,
    mcpValidationMiddleware,
    async (c) => {
        const { itemIds, itemFavStatus } = c.req.valid('json');

        const profile = await FortniteProfile.from(c.var.accountId, c.var.profileType);
        if (!profile) {
            return odysseus.mcp.profileNotFound.toResponse();
        }

        const items = await profile.items.findByIds(itemIds);
        if (items.length !== itemIds.length) {
            return odysseus.mcp.invalidPayload.withMessage('Some items not found').toResponse();
        }

        for (const item of items) {
            profile.changes.track({
                changeType: 'itemAttrChanged',
                itemId: item.id,
                attributeName: 'favorite',
                attributeValue: itemFavStatus,
            });
        }

        await profile.changes.commit(c);

        return c.json(profile.createResponse());
    },
);
