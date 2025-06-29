import { app } from '@core/app';
import { odysseus } from '@core/error';
import { arktypeValidator } from '@hono/arktype-validator';
import { acidMiddleware } from '@middleware/auth/accountIdMiddleware';
import { FortniteProfile } from '@utils/mcp/base-profile';
import { type } from 'arktype';

const markItemSeenSchema = type({
	itemIds: 'string[]',
});

app.post(
	'/fortnite/api/game/v2/profile/:accountId/client/MarkItemSeen',
	arktypeValidator('json', markItemSeenSchema),
	acidMiddleware,
	async (c) => {
		const requestedProfileId = c.req.query('profileId');
		if (!requestedProfileId) return c.sendError(odysseus.mcp.invalidPayload.withMessage('profileId is required'));

		if (!FortniteProfile.isValidProfileType(requestedProfileId)) {
			return c.sendError(odysseus.mcp.invalidPayload.withMessage('Invalid profile ID'));
		}

		const fp = await FortniteProfile.construct(c.var.accountId, requestedProfileId, c.var.cacheIdentifier);
		const profile = await fp.get();

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
