import { app } from '@core/app';
import { profileTypesEnum } from '@core/db/schemas/profile';
import { odysseus } from '@core/error';
import { acidMiddleware } from '@middleware/auth/accountIdMiddleware';
import { FortniteProfile } from '@utils/mcp/base-profile';
import { validator } from 'hono/validator';
import { z } from 'zod';

export const VALID_COSMETIC_SLOTS = [
	'Character',
	'Backpack',
	'Pickaxe',
	'Glider',
	'SkyDiveContrail',
	'MusicPack',
	'LoadingScreen',
	'Dance',
	'ItemWrap',
];

const equipBattleRoyaleCustomizationSchema = z.object({
	indexWithinSlot: z.number(), // -1 = fill all slots for multi-slot items, 0+ = specific slot index
	itemToSlot: z.string().or(z.literal('')),
	slotName: z.string().refine((v) => VALID_COSMETIC_SLOTS.includes(v), { message: 'Invalid slot name' }),
	variantUpdates: z
		.array(
			z.object({
				channel: z.string(),
				active: z.string(),
			})
		)
		.optional(),
});

app.post(
	'/fortnite/api/game/v2/profile/:accountId/client/EquipBattleRoyaleCustomization',
	validator('json', (value, c) => {
		const result = equipBattleRoyaleCustomizationSchema.safeParse(value);
		return result.success
			? result.data
			: c.sendError(odysseus.mcp.invalidPayload.withMessage(result.error.errors.map((e) => e.message).join(', ')));
	}),
	acidMiddleware,
	async (c) => {
		const requestedProfileId = c.req.query('profileId');

		const { indexWithinSlot, itemToSlot, slotName, variantUpdates } = c.req.valid('json');

		if (!FortniteProfile.isExactProfileType(requestedProfileId, profileTypesEnum.athena)) {
			return c.sendError(odysseus.mcp.invalidPayload.withMessage('Invalid profile ID, must be athena'));
		}

		const fp = new FortniteProfile(c, c.var.accountId, requestedProfileId);
		const profile = await fp.get();

		// Only validate item if we're actually equipping something (not unequipping)
		if (itemToSlot && itemToSlot !== '') {
			const item = await profile.getItemBy('id', itemToSlot);
			if (!item) {
				return c.sendError(odysseus.mcp.invalidPayload.withMessage('Item not found'));
			}

			if (!item.templateId.startsWith(slotName)) {
				return c.sendError(
					odysseus.mcp.invalidPayload.withMessage(
						`Cannot slot item of type ${item.templateId.split(':')[0]} in slot of category ${slotName}`
					)
				);
			}
		}

		// Required slots can't be empty
		if ((slotName === 'Pickaxe' || slotName === 'Glider') && !itemToSlot) {
			return c.sendError(odysseus.mcp.invalidPayload.withMessage(`${slotName} cannot be empty`));
		}

		if (await profile.isMultiSlotItem(slotName)) {
			// Allow -1 for "fill all slots" functionality
			const maxIndex = slotName === 'ItemWrap' ? 6 : 5; // ItemWrap has 7 slots (0-6), Dance has 6 slots (0-5)
			if (indexWithinSlot < -1 || indexWithinSlot > maxIndex) {
				return c.sendError(
					odysseus.mcp.invalidPayload.withMessage(`Invalid index within slot: ${indexWithinSlot}. Valid range: -1 to ${maxIndex}`)
				);
			}

			const emptyArray = new Array(slotName === 'ItemWrap' ? 7 : 6).fill('');

			const attributeName = FortniteProfile.getFavoriteAttributeKey(slotName);

			const currentAttribute = await profile.getAttribute(attributeName);
			const value = currentAttribute ? currentAttribute.valueJSON : emptyArray;

			const updatedValue = FortniteProfile.updateMultiSlotValue(slotName, value, itemToSlot, indexWithinSlot);

			await profile.updateAttribute(attributeName, updatedValue);

			profile.trackChange({
				changeType: 'statModified',
				name: attributeName,
				value: updatedValue,
			});
		} else {
			await profile.updateAttribute(FortniteProfile.getFavoriteAttributeKey(slotName), itemToSlot);

			profile.trackChange({
				changeType: 'statModified',
				name: FortniteProfile.getFavoriteAttributeKey(slotName),
				value: itemToSlot,
			});
		}

		// TODO: Handle variant updates

		const response = profile.createResponse();
		return c.json(response);
	}
);
