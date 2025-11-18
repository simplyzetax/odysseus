import { app } from '@core/app';
import { FortniteProfile } from '@utils/mcp/base-profile';
import { mcpValidationMiddleware } from '@middleware/game/mcpValidationMiddleware';
import { odysseus } from '@core/error';

//TODO: Add auth to this that a gameserver could use
app.post('/fortnite/api/game/v2/profile/:accountId/dedicated_server/:operation', mcpValidationMiddleware, async (c) => {
    const accountId = c.req.param('accountId');

    const profile = await FortniteProfile.from(accountId, c.var.profileType);
    if (!profile) {
        return odysseus.mcp.profileNotFound.toResponse();
    }

    const profileObject = profile.buildProfileObject();

    profile.changes.track({
        changeType: 'fullProfileUpdate',
        profile: profileObject,
    });

    return c.json(profile.createResponse());
});
