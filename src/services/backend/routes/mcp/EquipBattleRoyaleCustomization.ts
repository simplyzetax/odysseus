import { app } from '@core/app';
import { profileTypesEnum } from '@core/db/schemas/profile';
import { odysseus } from '@core/error';
import { acidMiddleware } from '@middleware/auth/accountIdMiddleware';
import { FortniteProfile } from '@utils/mcp/base-profile';
import { arktypeValidator } from '@hono/arktype-validator';
import { type } from 'arktype';

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
] as const;

// Define which slots are required and cannot be empty
export const REQUIRED_SLOTS = ['Pickaxe', 'Glider'] as const;

// Define slot configurations for multi-slot items
export const SLOT_CONFIGS = {
	ItemWrap: { maxSlots: 7, maxIndex: 6 },
	Dance: { maxSlots: 6, maxIndex: 5 },
} as const;

const equipBattleRoyaleCustomizationSchema = type({
	indexWithinSlot: 'number', // -1 = fill all slots for multi-slot items, 0+ = specific slot index
	itemToSlot: 'string',
	slotName: type(['===', ...VALID_COSMETIC_SLOTS]),
	'variantUpdates?': type({
		channel: 'string',
		active: 'string',
	}).array(),
});

app.post(
	'/fortnite/api/game/v2/profile/:accountId/client/EquipBattleRoyaleCustomization',
	arktypeValidator('json', equipBattleRoyaleCustomizationSchema),
	acidMiddleware,
	async (c) => {
		const requestedProfileId = c.req.query('profileId');

		const { indexWithinSlot, itemToSlot, slotName, variantUpdates } = c.req.valid('json');

		if (!FortniteProfile.isExactProfileType(requestedProfileId, profileTypesEnum.athena)) {
			return c.sendError(odysseus.mcp.invalidPayload.withMessage('Invalid profile ID, must be athena'));
		}

		const fp = new FortniteProfile(c, c.var.accountId, requestedProfileId);
		const profile = await fp.get();

		// Normalize itemToSlot - trim whitespace and treat empty strings as null
		const normalizedItemToSlot = itemToSlot?.trim() || '';

		// Only validate item if we're actually equipping something (not unequipping)
		if (normalizedItemToSlot) {
			const item = await profile.getItemBy('id', normalizedItemToSlot);
			if (!item) {
				return c.sendError(odysseus.mcp.invalidPayload.withMessage('Item not found'));
			}

			// More robust template ID validation - check if the item type matches the slot category
			const itemType = item.templateId.split(':')[0];
			const expectedPrefix = slotName.toLowerCase();

			if (!itemType.toLowerCase().startsWith(expectedPrefix)) {
				return c.sendError(odysseus.mcp.invalidPayload.withMessage(`Cannot slot item of type ${itemType} in slot of category ${slotName}`));
			}
		}

		// Required slots can't be empty
		if (REQUIRED_SLOTS.includes(slotName as (typeof REQUIRED_SLOTS)[number]) && !normalizedItemToSlot) {
			return c.sendError(odysseus.mcp.invalidPayload.withMessage(`${slotName} cannot be empty`));
		}

		if (await profile.isMultiSlotItem(slotName)) {
			// Get slot configuration
			const slotConfig = SLOT_CONFIGS[slotName as keyof typeof SLOT_CONFIGS];
			if (!slotConfig) {
				return c.sendError(odysseus.mcp.invalidPayload.withMessage(`Invalid multi-slot item type: ${slotName}`));
			}

			// Validate index range
			if (indexWithinSlot < -1 || indexWithinSlot > slotConfig.maxIndex) {
				return c.sendError(
					odysseus.mcp.invalidPayload.withMessage(
						`Invalid index within slot: ${indexWithinSlot}. Valid range: -1 to ${slotConfig.maxIndex}`,
					),
				);
			}

			const emptyArray = new Array(slotConfig.maxSlots).fill('');
			const attributeName = FortniteProfile.getFavoriteAttributeKey(slotName);
			const currentAttribute = (await profile.getAttribute(attributeName)) || profile.createAttribute(attributeName, emptyArray);
			const updatedValue = FortniteProfile.updateMultiSlotValue(
				slotName,
				currentAttribute.valueJSON,
				normalizedItemToSlot,
				indexWithinSlot,
			);

			await profile.updateAttribute(attributeName, updatedValue);
			profile.trackChange({
				changeType: 'statModified',
				name: attributeName,
				value: updatedValue,
			});
		} else {
			await profile.updateAttribute(FortniteProfile.getFavoriteAttributeKey(slotName), normalizedItemToSlot);

			profile.trackChange({
				changeType: 'statModified',
				name: FortniteProfile.getFavoriteAttributeKey(slotName),
				value: normalizedItemToSlot,
			});
		}

		// Handle variant updates if provided
		if (variantUpdates && variantUpdates.length > 0 && normalizedItemToSlot) {
			for (const variantUpdate of variantUpdates) {
				const variantAttributeName = `${normalizedItemToSlot}_variants_${variantUpdate.channel}`;
				await profile.updateAttribute(variantAttributeName, variantUpdate.active);

				profile.trackChange({
					changeType: 'statModified',
					name: variantAttributeName,
					value: variantUpdate.active,
				});
			}
		}

		const response = profile.createResponse();
		return c.json(response);
	},
);
