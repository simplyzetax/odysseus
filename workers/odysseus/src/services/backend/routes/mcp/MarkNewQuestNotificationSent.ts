import { app } from '@core/app';
import { acidMiddleware } from '@middleware/auth/accountIdMiddleware';
import { odysseus } from '@core/error';
import { FortniteProfile } from '@utils/mcp/base-profile';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { inArray } from 'drizzle-orm';
import { ITEMS } from '@core/db/schemas/items';
import { mcpValidationMiddleware } from '@middleware/game/mcpValidationMiddleware';

const markNewQuestNotificationSentSchema = z.object({
    itemIds: z.array(z.string()),
});

app.post(
    '/fortnite/api/game/v2/profile/:accountId/client/MarkNewQuestNotificationSent',
    zValidator('json', markNewQuestNotificationSentSchema),
    acidMiddleware,
    mcpValidationMiddleware,
    async (c) => {
        const { itemIds } = c.req.valid('json');

        const profile = await FortniteProfile.from(c.var.accountId, c.var.profileType);
        if (!profile) {
            return odysseus.mcp.profileNotFound.toResponse();
        }

        const items = await profile.items.findByIds(itemIds);

        for (const item of items) {
            profile.changes.track({
                changeType: 'itemAttrChanged',
                itemId: item.id,
                attributeName: 'quest_notifications',
                attributeValue: true,
            });
        }

        await profile.changes.commit(c);

        return c.json(profile.createResponse());
    },
);
