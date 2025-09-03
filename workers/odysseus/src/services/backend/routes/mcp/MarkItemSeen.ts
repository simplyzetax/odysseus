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
		const profile = await FortniteProfile.construct(c.var.accountId, c.var.profileType, c.var.databaseIdentifier);

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
