import { app } from '@core/app';
import { acidMiddleware } from '@middleware/auth/accountIdMiddleware';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { FortniteProfile } from '@utils/mcp/base-profile';
import { mcpValidationMiddleware } from '@middleware/game/mcpValidationMiddleware';
import { odysseus } from '@core/error';

const setSeasonPassAutoClaimSchema = z.object({
    bEnabled: z.boolean(),
    seasonIds: z.array(z.string()),
});

app.post(
    '/fortnite/api/game/v2/profile/:accountId/client/SetSeasonPassAutoClaim',
    zValidator('json', setSeasonPassAutoClaimSchema),
    acidMiddleware,
    mcpValidationMiddleware,
    async (c) => {
        const { bEnabled, seasonIds } = c.req.valid('json');

        const profile = await FortniteProfile.from(c.var.accountId, c.var.profileType);
        if (!profile) {
            return odysseus.mcp.profileNotFound.toResponse();
        }

        const seasonIdsAttribute = await profile.attributes.get('auto_spend_season_currency_ids');
        if (!seasonIdsAttribute) {
            profile.changes.track({
                changeType: 'statModified',
                name: 'auto_spend_season_currency_ids',
                value: [],
            });
        }

        profile.changes.track({
            changeType: 'statModified',
            name: 'auto_spend_season_currency_ids',
            value: seasonIds,
        });

        await profile.changes.commit(c);

        return c.json(profile.createResponse());
    },
);
