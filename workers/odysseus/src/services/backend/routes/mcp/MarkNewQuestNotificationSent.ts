import { app } from '@core/app';
import { acidMiddleware } from '@middleware/auth/accountIdMiddleware';
import { type } from 'arktype';
import { odysseus } from '@core/error';
import { FortniteProfile } from '@utils/mcp/base-profile';
import { arktypeValidator } from '@hono/arktype-validator';
import { inArray } from 'drizzle-orm';
import { ITEMS } from '@core/db/schemas/items';

const markNewQuestNotificationSentSchema = type({
	itemIds: 'string[]',
});

app.post(
	'/fortnite/api/game/v2/profile/:accountId/client/MarkNewQuestNotificationSent',
	arktypeValidator('json', markNewQuestNotificationSentSchema),
	acidMiddleware,
	async (c) => {
		const requestedProfileId = c.req.query('profileId');
		if (!requestedProfileId) {
			return odysseus.mcp.invalidPayload.withMessage('Missing profile ID').toResponse();
		}

		if (!FortniteProfile.isValidProfileType(requestedProfileId)) {
			return odysseus.mcp.invalidPayload.withMessage('Invalid profile ID').toResponse();
		}

		const { itemIds } = c.req.valid('json');

		const profile = await FortniteProfile.construct(c.var.accountId, requestedProfileId, c.var.cacheIdentifier);

		const items = await profile.db.select().from(ITEMS).where(inArray(ITEMS.id, itemIds));

		for (const item of items) {
			profile.trackChange({
				changeType: 'itemAttrChanged',
				itemId: item.id,
				attributeName: 'quest_notifications',
				attributeValue: true,
			});

			c.executionCtx.waitUntil(profile.updateItem(item.id, { ...item.jsonAttributes, quest_notifications: true }));
		}

		return c.json(profile.createResponse());
	},
);
