import { app } from '@core/app';
import { acidMiddleware } from '@middleware/auth/accountIdMiddleware';
import { type } from 'arktype';
import { odysseus } from '@core/error';
import { FortniteProfile } from '@utils/mcp/base-profile';
import { arktypeValidator } from '@hono/arktype-validator';
import { inArray } from 'drizzle-orm';
import { ITEMS } from '@core/db/schemas/items';
import { mcpValidationMiddleware } from '@middleware/game/mcpValidationMiddleware';
import { ATTRIBUTE_KEYS } from '@utils/mcp/constants';

const markNewQuestNotificationSentSchema = type({
	itemIds: 'string[]',
});

app.post(
	'/fortnite/api/game/v2/profile/:accountId/client/MarkNewQuestNotificationSent',
	arktypeValidator('json', markNewQuestNotificationSentSchema),
	acidMiddleware,
	mcpValidationMiddleware,
	async (c) => {
		const { itemIds } = c.req.valid('json');

		const profile = await FortniteProfile.fromAccountId(c.var.accountId, c.var.profileType, c.var.cacheIdentifier);

		const items = await profile.db.select().from(ITEMS).where(inArray(ITEMS.id, itemIds));

		for (const item of items) {
			profile.trackChange({
				changeType: 'itemAttrChanged',
				itemId: item.id,
				attributeName: ATTRIBUTE_KEYS.QUEST_NOTIFICATIONS,
				attributeValue: true,
			});
		}

		await profile.applyChanges();

		return c.json(profile.createResponse());
	},
);
