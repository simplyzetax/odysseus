import { app } from '@core/app';
import { acidMiddleware } from '@middleware/auth/accountIdMiddleware';
import { ratelimitMiddleware } from '@middleware/core/rateLimitMiddleware';
import { FortniteProfile } from '@utils/mcp/base-profile';
import { mcpValidationMiddleware } from '@middleware/game/mcpValidationMiddleware';
import { odysseus } from '@core/error';

app.post(
    '/fortnite/api/game/v2/profile/:accountId/client/ClaimMfaEnabled',
    acidMiddleware,
    ratelimitMiddleware({
        capacity: 10,
        initialTokens: 10,
        refillRate: 0.5,
    }),
    mcpValidationMiddleware,
    async (c) => {
        const profile = await FortniteProfile.from(c.var.accountId, c.var.profileType);
        if (!profile) {
            return odysseus.mcp.profileNotFound.toResponse();
        }


        const claimed = await profile.attributes.get("mfa_reward_claimed");
        if (claimed) {
            return odysseus.mcp.operationForbidden.withMessage("MFA reward already claimed").toResponse();
        }

        const templateId = "AthenaDance:EID_BoogieDown";

        const newItem = {
            templateId,
            quantity: 1,
            profileId: profile.profile.id,
            id: crypto.randomUUID(),
            favorite: false,
            seen: false,
            jsonAttributes: {
                item_seen: true,
                variants: [],
            },
        };

        profile.changes.track({
            changeType: "itemAdded",
            itemId: newItem.id,
            item: profile.formatter.formatItems(newItem),
        });

        profile.changes.track({
            changeType: "statModified",
            name: "mfa_reward_claimed",
            value: true,
        });

        await profile.changes.commit(c);

        return c.json(profile.createResponse());
    },
);
