import { app } from '@core/app';
import { acidMiddleware } from '@middleware/auth/accountIdMiddleware';
import { ratelimitMiddleware } from '@middleware/core/rateLimitMiddleware';
import { FortniteProfile } from '@utils/mcp/base-profile';
import { mcpValidationMiddleware } from '@middleware/game/mcpValidationMiddleware';
import { odysseus } from '@core/error';
import { type } from 'arktype';
import { arktypeValidator } from '@hono/arktype-validator';

const setItemFavoriteStatusSchema = type({
	bFavorite: 'boolean',
	targetItemId: 'string',
});

app.post(
	'/fortnite/api/game/v2/profile/:accountId/client/SetItemFavoriteStatus',
	arktypeValidator('json', setItemFavoriteStatusSchema),
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

		const item = await profile.getItemBy('id', body.targetItemId);
		if (!item) {
			return odysseus.mcp.invalidPayload.withMessage('Item not found').toResponse();
		}

		await profile.modifyItem(item.id, 'favorite', body.bFavorite);

		profile.trackChange({
			changeType: 'itemAttrChanged',
			itemId: item.id,
			attributeName: 'favorite',
			attributeValue: body.bFavorite,
		});

		return c.json(profile.createResponse());
	},
);
