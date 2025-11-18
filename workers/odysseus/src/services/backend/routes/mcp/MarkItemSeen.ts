import { app } from '@core/app';
import { odysseus } from '@core/error';
import { acidMiddleware } from '@middleware/auth/accountIdMiddleware';
import { mcpValidationMiddleware } from '@middleware/game/mcpValidationMiddleware';
import { FortniteProfile } from '@utils/mcp/base-profile';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';

const markItemSeenSchema = z.object({
    itemIds: z.array(z.string()),
});

app.post(
    '/fortnite/api/game/v2/profile/:accountId/client/MarkItemSeen',
    zValidator('json', markItemSeenSchema),
    acidMiddleware,
    mcpValidationMiddleware,
    async (c) => {
        const profile = await FortniteProfile.from(c.var.accountId, c.var.profileType);
        if (!profile) {
            return odysseus.mcp.profileNotFound.toResponse();
        }

        const { itemIds } = c.req.valid('json');

        for (const itemId of itemIds) {
            profile.changes.track({
                changeType: 'itemAttrChanged',
                itemId: itemId,
                attributeName: 'item_seen',
                attributeValue: true,
            });
        }

        await profile.changes.commit(c);

        return c.json(profile.createResponse());
    },
);
