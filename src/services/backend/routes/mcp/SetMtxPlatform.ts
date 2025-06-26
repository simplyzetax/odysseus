import { app } from '@core/app';
import { odysseus } from '@core/error';
import { acidMiddleware } from '@middleware/auth/accountIdMiddleware';
import { FortniteProfile } from '@utils/mcp/base-profile';

app.post('/fortnite/api/game/v2/profile/:accountId/client/SetMtxPlatform', acidMiddleware, async (c) => {
	const requestedProfileId = c.req.query('profileId');
	if (!requestedProfileId) return c.sendError(odysseus.mcp.invalidPayload.withMessage('profileId is required'));

	//TODO: not sure if it's actually common_core, but we'll see when i test it
	if (!FortniteProfile.isExactProfileType(requestedProfileId, 'common_core')) {
		return c.sendError(odysseus.mcp.invalidPayload.withMessage('Invalid profile ID, must be common_core'));
	}

	const fp = new FortniteProfile(c, c.var.accountId, requestedProfileId);
	const profile = await fp.get();
	const profileObject = await profile.buildProfileObject();

	//TODO: Properly implement this
	//await profile.updateAttribute('mtx_platform', 'epic');

	profile.trackChange({
		changeType: 'fullProfileUpdate',
		profile: profileObject,
	});

	const response = profile.createResponse();
	return c.json(response);
});
