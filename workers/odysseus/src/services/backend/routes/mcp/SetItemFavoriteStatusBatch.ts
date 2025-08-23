import { app } from '@core/app';
import { acidMiddleware } from '@middleware/auth/accountIdMiddleware';
import { type } from 'arktype';
import { odysseus } from '@core/error';
import { FortniteProfile } from '@utils/mcp/base-profile';
import { arktypeValidator } from '@hono/arktype-validator';
import { ITEMS } from '@core/db/schemas/items';
import { inArray } from 'drizzle-orm';
import { getDB } from '@core/db/client';
import { mcpValidationMiddleware } from '@middleware/game/mcpValidationMiddleware';

const setItemFavoriteStatusBatchSchema = type({
	itemIds: 'string[]',
	itemFavStatus: 'boolean',
});

app.post(
	'/fortnite/api/game/v2/profile/:accountId/client/SetItemFavoriteStatusBatch',
	arktypeValidator('json', setItemFavoriteStatusBatchSchema),
	acidMiddleware,
	mcpValidationMiddleware,
	async (c) => {
		const { itemIds, itemFavStatus } = c.req.valid('json');

		const profile = await FortniteProfile.construct(c.var.accountId, c.var.profileType, c.var.databaseIdentifier);

		const db = getDB(c.var.databaseIdentifier);

		const items = await db.select().from(ITEMS).where(inArray(ITEMS.id, itemIds));
		if (items.length !== itemIds.length) {
			return odysseus.mcp.invalidPayload.withMessage('Some items not found').toResponse();
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
