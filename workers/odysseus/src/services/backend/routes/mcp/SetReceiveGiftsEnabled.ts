import { app } from '@core/app';
import { acidMiddleware } from '@middleware/auth/accountIdMiddleware';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { odysseus } from '@core/error';
import { FortniteProfile } from '@utils/mcp/base-profile';
import { mcpValidationMiddleware } from '@middleware/game/mcpValidationMiddleware';

const setReceiveGiftsEnabledSchema = z.object({
    bReceiveGifts: z.boolean(),
});

app.post(
    '/fortnite/api/game/v2/profile/:accountId/client/SetReceiveGiftsEnabled',
    zValidator('json', setReceiveGiftsEnabledSchema),
    acidMiddleware,
    mcpValidationMiddleware,
    async (c) => {
        const { bReceiveGifts } = c.req.valid('json');

        const profile = await FortniteProfile.from(c.var.accountId, c.var.profileType);
        if (!profile) {
            return odysseus.mcp.profileNotFound.toResponse();
        }

        profile.changes.track({
            changeType: 'statModified',
            name: 'allowed_to_receive_gifts',
            value: bReceiveGifts,
        });

        await profile.changes.commit(c);

        return c.json(profile.createResponse());
    },
);
