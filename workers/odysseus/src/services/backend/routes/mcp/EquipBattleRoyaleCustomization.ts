import { app } from '@core/app';
import { odysseus } from '@core/error';
import { acidMiddleware } from '@middleware/auth/accountIdMiddleware';
import { FortniteProfile } from '@utils/mcp/base-profile';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { mcpValidationMiddleware } from '@middleware/game/mcpValidationMiddleware';

const SLOT_CONFIGS = {
    ItemWrap: { maxIndex: 6 },
    Dance: { maxIndex: 5 },
} as const;

const equipBattleRoyaleCustomizationSchema = zValidator(
    "json",
    z.object({
        indexWithinSlot: z.number(),
        itemToSlot: z.string(),
        slotName: z.string(),
        variantUpdates: z
            .array(
                z.object({
                    channel: z.string(),
                    active: z.string(),
                })
            )
            .optional(),
    })
);

const isValidSlotForItem = (itemType: string, slotName: string): boolean => {
    const normalizedSlot = slotName.toLowerCase();
    const normalizedType = itemType.toLowerCase();
    return (
        normalizedType.startsWith(normalizedSlot) ||
        normalizedType.startsWith(`athena${normalizedSlot}`) ||
        (normalizedSlot.startsWith("athena") && normalizedType.startsWith(normalizedSlot))
    );
};

app.post(
    '/fortnite/api/game/v2/profile/:accountId/client/EquipBattleRoyaleCustomization',
    equipBattleRoyaleCustomizationSchema,
    acidMiddleware,
    mcpValidationMiddleware,
    async (c) => {
        const { indexWithinSlot, itemToSlot, slotName, variantUpdates } = c.req.valid("json");

        const profile = await FortniteProfile.from(c.var.accountId, c.var.profileType);
        if (!profile) {
            return odysseus.mcp.profileNotFound.toResponse();
        }

        const normalizedItemToSlot = itemToSlot?.trim() || "";

        if (normalizedItemToSlot && normalizedItemToSlot !== "AthenaCharacter:cid_random") {
            const item = await profile.items.find("id", normalizedItemToSlot, false);
            if (!item) {
                return odysseus.mcp.itemNotFound.toResponse();
            }

            const [itemType] = item.templateId.split(":");
            if (!isValidSlotForItem(itemType, slotName)) {
                return odysseus.mcp.invalidPayload
                    .withMessage(`Cannot slot item of type ${itemType} in slot of category ${slotName}`)
                    .toResponse();
            }
        }

        const isMultiSlot = await profile.items.isMultiSlotItem(slotName);
        const attributeName = profile.attributes.getFavoriteAttributeKey(slotName);

        if (isMultiSlot) {
            const slotConfig = SLOT_CONFIGS[slotName as keyof typeof SLOT_CONFIGS];
            if (!slotConfig) {
                return odysseus.mcp.invalidPayload.withMessage(`Invalid multi-slot item type: ${slotName}`).toResponse();
            }

            if (indexWithinSlot < -1 || indexWithinSlot > slotConfig.maxIndex) {
                return odysseus.mcp.invalidPayload
                    .withMessage(
                        `Invalid index within slot: ${indexWithinSlot}. Valid range: -1 to ${slotConfig.maxIndex}`
                    )
                    .toResponse();
            }

            const currentAttribute = await profile.attributes.get(attributeName);
            const updatedValue = profile.attributes.updateMultiSlotValue(
                slotName,
                currentAttribute?.valueJSON ?? [],
                normalizedItemToSlot,
                indexWithinSlot
            );

            profile.changes.track({
                changeType: "statModified",
                name: attributeName,
                value: updatedValue,
            });
        } else {
            profile.changes.track({
                changeType: "statModified",
                name: attributeName,
                value: normalizedItemToSlot,
            });
        }

        if (variantUpdates?.length && normalizedItemToSlot) {
            for (const variantUpdate of variantUpdates.filter(Boolean)) {
                const variantAttributeName = `${normalizedItemToSlot}_variants_${variantUpdate.channel}`;
                profile.changes.track({
                    changeType: "statModified",
                    name: variantAttributeName,
                    value: variantUpdate.active,
                });
            }
        }

        c.executionCtx.waitUntil(profile.changes.commit(c));

        return profile.createResponse();
    },
);
