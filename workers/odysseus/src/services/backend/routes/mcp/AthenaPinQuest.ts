import { app } from '@core/app';
import { acidMiddleware } from '@middleware/auth/accountIdMiddleware';
import { FortniteProfile } from '@utils/mcp/base-profile';
import { mcpValidationMiddleware } from '@middleware/game/mcpValidationMiddleware';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { odysseus } from '@core/error';

const athenaPinQuestSchema = z.object({
    pinnedQuest: z.string(),
});

app.post(
    '/fortnite/api/game/v2/profile/:accountId/client/AthenaPinQuest',
    zValidator('json', athenaPinQuestSchema),
    acidMiddleware,
    mcpValidationMiddleware,
    async (c) => {
        const { pinnedQuest } = c.req.valid('json');

        const profile = await FortniteProfile.from(c.var.accountId, c.var.profileType);
        if (!profile) {
            return odysseus.mcp.profileNotFound.toResponse();
        }

        profile.changes.track({
            changeType: 'statModified',
            name: 'pinned_quest',
            value: pinnedQuest,
        });

        await profile.changes.commit(c);

        return c.json(profile.createResponse());
    },
);
