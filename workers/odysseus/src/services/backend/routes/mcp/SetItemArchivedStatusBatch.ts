import { app } from '@core/app';
import { acidMiddleware } from '@middleware/auth/accountIdMiddleware';
import { odysseus } from '@core/error';
import { FortniteProfile } from '@utils/mcp/base-profile';
import { zValidator } from '@hono/zod-validator';
import { ITEMS } from '@core/db/schemas/items';
import { inArray } from 'drizzle-orm';
import { getDB } from '@core/db/client';
import { mcpValidationMiddleware } from '@middleware/game/mcpValidationMiddleware';
import z from 'zod';

const setItemArchivedStatusBatchSchema = z.object({
	itemIds: z.array(z.string()),
	archived: z.boolean(),
});

app.post(
	'/fortnite/api/game/v2/profile/:accountId/client/SetItemArchivedStatusBatch',
	zValidator('json', setItemArchivedStatusBatchSchema),
	acidMiddleware,
	mcpValidationMiddleware,
	async (c) => {
		const { itemIds, archived } = c.req.valid('json');

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
				attributeName: 'archived',
				attributeValue: archived,
			});

			c.executionCtx.waitUntil(profile.updateItem(item.id, { ...item.jsonAttributes, archived }));
		}

		return c.json(profile.createResponse());
	},
);
