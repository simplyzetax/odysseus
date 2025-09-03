import { app } from '@core/app';
import { FortniteProfile } from '@utils/mcp/base-profile';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { odysseus } from '@core/error';
import { acidMiddleware } from '@middleware/auth/accountIdMiddleware';
import { mcpValidationMiddleware } from '@middleware/game/mcpValidationMiddleware';

const specialCosmetics = [
	'AthenaCharacter:cid_random',
	'AthenaBackpack:bid_random',
	'AthenaPickaxe:pickaxe_random',
	'AthenaGlider:glider_random',
	'AthenaSkyDiveContrail:trails_random',
	'AthenaItemWrap:wrap_random',
	'AthenaMusicPack:musicpack_random',
	'AthenaLoadingScreen:lsid_random',
] as const;

const setCosmeticLockerSlotSchema = z.object({
	category: z.string(),
	lockerItem: z.string(),
	slotIndex: z.number(),
	itemToSlot: z.string(),
});

app.post(
	'/fortnite/api/game/v2/profile/:accountId/client/SetCosmeticLockerSlot',
	// @ts-expect-error - Hono types are not working
	zValidator('json', setCosmeticLockerSlotSchema),
	acidMiddleware,
	mcpValidationMiddleware,
	async (c) => {
		const profile = await FortniteProfile.construct(c.var.accountId, c.var.profileType, c.var.databaseIdentifier);

		const { category, lockerItem, slotIndex, itemToSlot } = c.req.valid('json');

		const item = profile.getItemBy('id', itemToSlot);

		if (!specialCosmetics.includes(itemToSlot as (typeof specialCosmetics)[number]) && !item) {
			return odysseus.mcp.invalidPayload.withMessage('Item not found').toResponse();
		} else if (!itemToSlot.startsWith('Athena')) {
			return odysseus.mcp.invalidPayload.withMessage('Item is not applicable to this category').toResponse();
		}

		const slot = itemToSlot.split(':')[0];
		if (!slot) {
			return odysseus.mcp.invalidPayload.withMessage('Invalid item format').toResponse();
		}

		switch (category) {
			case 'Dance': {
			}
			case 'ItemWrap': {
			}
			default: {
				const lockerDatabaseItem = await profile.getItemBy('id', lockerItem);
				if (!lockerDatabaseItem) {
					return odysseus.mcp.invalidPayload.withMessage('Locker item not found').toResponse();
				}

				if ((category == 'Pickaxe' || category == 'Glider') && itemToSlot.length <= 0) {
					return odysseus.mcp.invalidPayload.withMessage('Category does not allow empty itemToSlot').toResponse();
				}

				const lockerAttributes = lockerDatabaseItem.jsonAttributes;
				lockerAttributes.locker_slots_data.slots[category].items = itemToSlot;

				await profile.updateItem(lockerItem, lockerAttributes);

				profile.trackChange({
					changeType: 'itemAttrChanged',
					itemId: lockerItem,
					attributeName: 'locker_slots_data',
					attributeValue: lockerAttributes,
				});
			}
		}

		return profile.createResponse();
	},
);
