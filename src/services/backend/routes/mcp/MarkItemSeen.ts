import { app } from "@core/app";
import { odysseus } from "@core/error";
import { acidMiddleware } from "@middleware/auth/accountIdMiddleware";
import { FortniteProfile } from "@utils/mcp/base-profile";
import { validator } from "hono/validator";
import z from "zod";

const markItemSeenSchema = z.object({
    itemIds: z.array(z.string())
});

// Route handler
app.post("/fortnite/api/game/v2/profile/:unsafeAccountId/client/MarkItemSeen",
    validator('json', (value, c) => {
        const result = markItemSeenSchema.safeParse(value);
        return result.success
            ? result.data
            : c.sendError(odysseus.mcp.invalidPayload.withMessage(
                result.error.errors.map(e => e.message).join(", ")
            ));
    }),
    acidMiddleware,
    async (c) => {
        const requestedProfileId = c.req.query("profileId");
        if (!requestedProfileId) return c.sendError(odysseus.mcp.invalidPayload.withMessage("profileId is required"));

        if(!FortniteProfile.isValidProfileType(requestedProfileId)) {
            return c.sendError(odysseus.mcp.invalidPayload.withMessage("Invalid profile ID"));
        }

        //TODO: we can optimise this and other routes further by providing the uniqueProfileId in a signed cookie
        // we can set in QueryProfile and then use it here
        const fp = new FortniteProfile(c, c.var.accountId, requestedProfileId);
        const profile = await fp.get();

        const itemIds = c.req.valid("json").itemIds;
        await profile.markItemAsSeen(itemIds);

        for(const itemId of itemIds) {
            profile.trackChange({
                changeType: "itemAttrChanged",
                itemId: itemId,
                attributeName: "item_seen",
                attributeValue: true
            });
        }

        const response = profile.createResponse();
        return c.json(response);
    });