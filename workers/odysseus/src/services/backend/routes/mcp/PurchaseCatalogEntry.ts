import { app } from '@core/app';
import { acidMiddleware } from '@middleware/auth/accountIdMiddleware';
import { ratelimitMiddleware } from '@middleware/core/rateLimitMiddleware';
import { FortniteProfile } from '@utils/mcp/base-profile';
import { mcpValidationMiddleware } from '@middleware/game/mcpValidationMiddleware';
import { type } from 'arktype';
import { arktypeValidator } from '@hono/arktype-validator';
import { profileTypesEnum } from '@core/db/schemas/profile';
import { odysseus } from '@core/error';
import { getDB } from '@core/db/client';
import { OFFERS } from '@core/db/schemas/offer';
import { eq } from 'drizzle-orm';
import { nanoid } from 'nanoid';
import { ATTRIBUTE_KEYS } from '@utils/mcp/constants';

const purchaseCatalogEntrySchema = type({
	offerId: 'string',
	purchaseQuantity: 'number >= 1',
});

app.post(
	'/fortnite/api/game/v2/profile/:accountId/client/PurchaseCatalogEntry',
	acidMiddleware,
	ratelimitMiddleware({
		capacity: 10,
		initialTokens: 10,
		refillRate: 0.5,
	}),
	arktypeValidator('json', purchaseCatalogEntrySchema),
	mcpValidationMiddleware,
	async (c) => {
		const profile = await FortniteProfile.fromAccountId(c.var.accountId, c.var.profileType, c.var.cacheIdentifier);

		if (c.var.profileType !== profileTypesEnum.common_core && c.var.profileType !== profileTypesEnum.profile0) {
			return odysseus.mcp.invalidPayload.withMessage('Invalid profile type').toResponse();
		}

		const body = c.req.valid('json');
		const db = getDB(c.var.cacheIdentifier);

		const [offer] = await db.select().from(OFFERS).where(eq(OFFERS.id, body.offerId));
		if (!offer) {
			return odysseus.mcp.invalidPayload.withMessage('Offer not found').toResponse();
		}

		const athenaProfile = await FortniteProfile.fromAccountId(c.var.accountId, profileTypesEnum.athena, c.var.cacheIdentifier);

		for (const item of offer.itemGrants) {
			const athenaItem = await athenaProfile.getItemBy('templateId', item);
			if (athenaItem) {
				return odysseus.mcp.operationForbidden.withMessage(`Profile already has item ${item}`).toResponse();
			}
		}

		const currencyAmount = await profile.getItemBy('templateId', 'currency:mtx_epic', true);
		if (!currencyAmount) {
			return odysseus.mcp.invalidPayload.withMessage('Currency amount not found').toResponse();
		}

		if (currencyAmount.quantity < offer.price) {
			return odysseus.mcp.invalidPayload.withMessage('Not enough currency').toResponse();
		}

		const lootItems: {
			itemType: string;
			itemGuid: string;
			itemProfile: string;
			quantity: number;
		}[] = [];
		for (const templateId of offer.itemGrants) {
			const id = nanoid();
			const newItem = {
				templateId: templateId,
				attributes: {
					item_seen: false,
					variants: [],
				},
				quantity: 1,
			};

			athenaProfile.trackChange({
				changeType: 'itemAdded',
				itemId: id,
				item: newItem,
			});

			lootItems.push({
				itemType: newItem.templateId,
				itemGuid: crypto.randomUUID(), //TODO: Fix this, we need to use the actual item id
				itemProfile: 'athena',
				quantity: 1,
			});
		}

		profile.trackNotification({
			type: 'CatalogPurchase',
			primary: true,
			lootResult: {
				items: lootItems,
			},
		});

		// Deduct currency once after all items are processed
		profile.trackChange({
			changeType: 'itemQuantityChanged',
			itemId: currencyAmount.id,
			quantity: currencyAmount.quantity - offer.price,
		});

		c.executionCtx.waitUntil(profile.applyChanges());
		c.executionCtx.waitUntil(athenaProfile.applyChanges());

		return c.json(FortniteProfile.combineResponses([profile, athenaProfile]));
	},
);
