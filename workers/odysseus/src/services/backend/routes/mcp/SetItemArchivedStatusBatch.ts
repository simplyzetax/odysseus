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

const setItemArchivedStatusBatchSchema = type({
	itemIds: 'string[]',
	archived: 'boolean',
});

app.post(
	'/fortnite/api/game/v2/profile/:accountId/client/SetItemArchivedStatusBatch',
	arktypeValidator('json', setItemArchivedStatusBatchSchema),
	acidMiddleware,
	mcpValidationMiddleware,
	async (c) => {
		const { itemIds, archived } = c.req.valid('json');

		const profile = await FortniteProfile.construct(c.var.accountId, c.var.profileId, c.var.cacheIdentifier);

		const db = getDB(c.var.cacheIdentifier);

		const items = await db.select().from(ITEMS).where(inArray(ITEMS.id, itemIds));
		if (items.length !== itemIds.length) {
			return odysseus.mcp.invalidPayload.withMessage('Some items not found').toResponse();
		}

		for (const item of items) {
			profile.trackChange({
				changeType: 'itemAttrChanged',
				itemId: item.id,
				attributeName: 'archived',
				attributeValue: archived,
			});

			c.executionCtx.waitUntil(profile.updateItem(item.id, { ...item.jsonAttributes, archived }));
		}

		return c.json(profile.createResponse());
	},
);
