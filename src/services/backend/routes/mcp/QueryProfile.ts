import { app } from "@core/app";
import { odysseus } from "@core/error";
import { acidMiddleware } from "@middleware/auth/acid";
import { FortniteProfile } from "@utils/mcp/base-profile";

app.post("/fortnite/api/game/v2/profile/:accountId/client/QueryProfile", acidMiddleware, async (c) => {
    const profileId = c.req.query("profileId");
    if (!profileId) {
        return c.sendError(odysseus.mcp.invalidPayload.withMessage("Missing profile ID"));
    }

    //@ts-ignore
    const fp = new FortniteProfile(c, accountId, profileId);
    const profile = await fp.get();
    const profileObject = await profile.buildProfileObject();

    profile.trackChange({
        "changeType": "fullProfileUpdate",
        "profile": profileObject
    });

    return c.json(profile.createResponse());
});