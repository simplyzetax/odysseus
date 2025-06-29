import { app } from '@core/app';
import { acidMiddleware } from '@middleware/auth/accountIdMiddleware';
import { type } from 'arktype';
import { odysseus } from '@core/error';
import { FortniteProfile } from '@utils/mcp/base-profile';
import { arktypeValidator } from '@hono/arktype-validator';
import { ITEMS } from '@core/db/schemas/items';
import { eq, inArray } from 'drizzle-orm';
import { getDB } from '@core/db/client';

const setItemFavoriteStatusBatchSchema = type({
	itemIds: 'string[]',
	itemFavStatus: 'boolean',
});

app.post(
	'/fortnite/api/game/v2/profile/:accountId/client/SetItemFavoriteStatusBatch',
	arktypeValidator('json', setItemFavoriteStatusBatchSchema),
	acidMiddleware,
	async (c) => {
		const requestedProfileId = c.req.query('profileId');
		if (!requestedProfileId) {
			return c.sendError(odysseus.mcp.invalidPayload.withMessage('Missing profile ID'));
		}

		if (!FortniteProfile.isValidProfileType(requestedProfileId)) {
			return c.sendError(odysseus.mcp.invalidPayload.withMessage('Invalid profile ID'));
		}

		const { itemIds, itemFavStatus } = c.req.valid('json');

		const fp = await FortniteProfile.construct(c.var.accountId, requestedProfileId, c.var.cacheIdentifier);
		const profile = await fp.get();

		const db = getDB(c.var.cacheIdentifier);

		const items = await db.select().from(ITEMS).where(inArray(ITEMS.id, itemIds));
		if (items.length !== itemIds.length) {
			return c.sendError(odysseus.mcp.invalidPayload.withMessage('Some items not found'));
		}

		for (const item of items) {
			profile.trackChange({
				changeType: 'itemAttrChanged',
				itemId: item.id,
				attributeName: 'favorite',
				attributeValue: itemFavStatus,
			});
		}

		c.executionCtx.waitUntil(db.update(ITEMS).set({ favorite: itemFavStatus }).where(inArray(ITEMS.id, itemIds)));

		return c.json(profile.createResponse());
	},
);
