import { app } from '@core/app';
import { profileTypesEnum } from '@core/db/schemas/profile';
import { odysseus } from '@core/error';
import { acidMiddleware } from '@middleware/auth/accountIdMiddleware';
import { FortniteProfile } from '@utils/mcp/base-profile';
import { arktypeValidator } from '@hono/arktype-validator';
import { type } from 'arktype';
import { mcpValidationMiddleware } from '@middleware/game/mcpValidationMiddleware';

export const VALID_COSMETIC_SLOTS = [
	'AthenaCharacter',
	'AthenaBackpack',
	'AthenaPickaxe',
	'AthenaGlider',
	'AthenaSkyDiveContrail',
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
	slotName: 'string',
	'variantUpdates?': type({
		channel: 'string',
		active: 'string',
	}).array(),
});

app.post(
	'/fortnite/api/game/v2/profile/:accountId/client/EquipBattleRoyaleCustomization',
	arktypeValidator('json', equipBattleRoyaleCustomizationSchema),
	acidMiddleware,
	mcpValidationMiddleware,
	async (c) => {
		const { indexWithinSlot, itemToSlot, slotName, variantUpdates } = c.req.valid('json');

		const profile = await FortniteProfile.fromAccountId(c.var.accountId, c.var.profileType, c.var.cacheIdentifier);

		// Normalize itemToSlot - trim whitespace and treat empty strings as null
		const normalizedItemToSlot = itemToSlot?.trim() || '';

		console.log('normalizedItemToSlot', normalizedItemToSlot);

		// Only validate item if we're actually equipping something (not unequipping)
		if (normalizedItemToSlot) {
			const item = await profile.getItemBy('id', normalizedItemToSlot);
			if (!item) {
				return odysseus.mcp.invalidPayload.withMessage('Item not found').toResponse();
			}

			// More robust template ID validation - check if the item type matches the slot category
			const itemType = item.templateId.split(':')[0];

			// Handle Athena prefix mapping - some slots have Athena prefix, others don't
			const normalizedSlotName = slotName.toLowerCase();
			const normalizedItemType = itemType.toLowerCase();

			// Check if the item type matches the slot either directly or with Athena prefix
			const isValidSlot =
				normalizedItemType.startsWith(normalizedSlotName) ||
				normalizedItemType.startsWith(`athena${normalizedSlotName}`) ||
				(normalizedSlotName.startsWith('athena') && normalizedItemType.startsWith(normalizedSlotName));

			if (!isValidSlot) {
				return odysseus.mcp.invalidPayload.withMessage(`Cannot slot item of type ${itemType} in slot of category ${slotName}`).toResponse();
			}
		}

		// Required slots can't be empty
		if (REQUIRED_SLOTS.includes(slotName as (typeof REQUIRED_SLOTS)[number]) && !normalizedItemToSlot) {
			return odysseus.mcp.invalidPayload.withMessage(`${slotName} cannot be empty`).toResponse();
		}

		if (profile.isMultiSlotItem(slotName)) {
			// Get slot configuration
			const slotConfig = SLOT_CONFIGS[slotName as keyof typeof SLOT_CONFIGS];
			if (!slotConfig) {
				return odysseus.mcp.invalidPayload.withMessage(`Invalid multi-slot item type: ${slotName}`).toResponse();
			}

			// Validate index range
			if (indexWithinSlot < -1 || indexWithinSlot > slotConfig.maxIndex) {
				return odysseus.mcp.invalidPayload
					.withMessage(`Invalid index within slot: ${indexWithinSlot}. Valid range: -1 to ${slotConfig.maxIndex}`)
					.toResponse();
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

			profile.trackChange({
				changeType: 'statModified',
				name: attributeName,
				value: updatedValue,
			});
		} else {
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

				profile.trackChange({
					changeType: 'statModified',
					name: variantAttributeName,
					value: variantUpdate.active,
				});
			}
		}

		c.executionCtx.waitUntil(profile.applyChanges());

		const response = profile.createResponse();
		return c.json(response);
	},
);
