import { app } from '@core/app';
import { acidMiddleware } from '@middleware/auth/accountIdMiddleware';
import { type } from 'arktype';
import { odysseus } from '@core/error';
import { FortniteProfile } from '@utils/mcp/base-profile';
import { arktypeValidator } from '@hono/arktype-validator';
import { eq, inArray } from 'drizzle-orm';
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
			return c.sendError(odysseus.mcp.invalidPayload.withMessage('Missing profile ID'));
		}

		if (!FortniteProfile.isValidProfileType(requestedProfileId)) {
			return c.sendError(odysseus.mcp.invalidPayload.withMessage('Invalid profile ID'));
		}

		const { itemIds } = c.req.valid('json');

		const fp = new FortniteProfile(c, c.var.accountId, requestedProfileId);
		const profile = await fp.get();

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
	}
);
