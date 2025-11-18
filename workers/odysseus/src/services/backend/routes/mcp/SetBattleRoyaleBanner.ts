import { app } from '@core/app';
import { acidMiddleware } from '@middleware/auth/accountIdMiddleware';
import { odysseus } from '@core/error';
import { FortniteProfile } from '@utils/mcp/base-profile';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { mcpValidationMiddleware } from '@middleware/game/mcpValidationMiddleware';

const setBattleRoyaleBannerSchema = z.object({
    homebaseBannerIconId: z.string(),
    homebaseBannerColorId: z.string(),
});

app.post(
    '/fortnite/api/game/v2/profile/:accountId/client/SetBattleRoyaleBanner',
    zValidator('json', setBattleRoyaleBannerSchema),
    acidMiddleware,
    mcpValidationMiddleware,
    async (c) => {
        const { homebaseBannerIconId, homebaseBannerColorId } = c.req.valid('json');

        const profile = await FortniteProfile.from(c.var.accountId, c.var.profileType);
        if (!profile) {
            return odysseus.mcp.profileNotFound.toResponse();
        }

        const item = await profile.items.find('id', homebaseBannerIconId, false);
        if (!item) {
            return odysseus.mcp.invalidPayload.withMessage('Item not found in profile').toResponse();
        }

        profile.changes.track({
            changeType: 'statModified',
            name: 'banner_icon',
            value: homebaseBannerIconId,
        });

        profile.changes.track({
            changeType: 'statModified',
            name: 'banner_color',
            value: homebaseBannerColorId,
        });

        await profile.changes.commit(c);

        return c.json(profile.createResponse());
    },
);
