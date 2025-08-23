import { app } from '@core/app';
import { acidMiddleware } from '@middleware/auth/accountIdMiddleware';
import { ratelimitMiddleware } from '@middleware/core/rateLimitMiddleware';
import { FortniteProfile } from '@utils/mcp/base-profile';
import { mcpValidationMiddleware } from '@middleware/game/mcpValidationMiddleware';
import { odysseus } from '@core/error';
import { type } from 'arktype';
import { arktypeValidator } from '@hono/arktype-validator';

const removeGiftboxSchema = type({
	giftBoxItemIds: 'string[]',
});

app.post(
	'/fortnite/api/game/v2/profile/:accountId/client/RemoveGiftbox',
	arktypeValidator('json', removeGiftboxSchema),
	acidMiddleware,
	ratelimitMiddleware({
		capacity: 10,
		initialTokens: 10,
		refillRate: 0.5,
	}),
	mcpValidationMiddleware,
	async (c) => {
		const profile = await FortniteProfile.construct(c.var.accountId, c.var.profileType, c.var.databaseIdentifier);
		if (!profile) {
			return odysseus.mcp.profileNotFound.toResponse();
		}

		const body = c.req.valid('json');

		const items = await profile.getItems();
		const itemsToRemove = items.filter((item) => body.giftBoxItemIds.includes(item.id));

		await profile.removeItems(itemsToRemove.map((item) => item.id));

		for (const item of itemsToRemove) {
			profile.trackChange({
				changeType: 'itemRemoved',
				itemId: item.id,
			});
		}

		return c.json(profile.createResponse());
	},
);
