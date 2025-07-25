import { app } from '@core/app';
import { odysseus } from '@core/error';
import { arktypeValidator } from '@hono/arktype-validator';
import { acidMiddleware } from '@middleware/auth/accountIdMiddleware';
import { mcpValidationMiddleware } from '@middleware/game/mcpValidationMiddleware';
import { FortniteProfile } from '@utils/mcp/base-profile';
import { type } from 'arktype';

const markItemSeenSchema = type({
	itemIds: 'string[]',
});

app.post(
	'/fortnite/api/game/v2/profile/:accountId/client/MarkItemSeen',
	arktypeValidator('json', markItemSeenSchema),
	acidMiddleware,
	mcpValidationMiddleware,
	async (c) => {
		const profile = await FortniteProfile.construct(c.var.accountId, c.var.profileType, c.var.cacheIdentifier);

		const { itemIds } = c.req.valid('json');

		c.executionCtx.waitUntil(profile.updateSeenStatus(itemIds));

		for (const itemId of itemIds) {
			profile.trackChange({
				changeType: 'itemAttrChanged',
				itemId: itemId,
				attributeName: 'item_seen',
				attributeValue: true,
			});
		}

		const response = profile.createResponse();
		return c.json(response);
	},
);
