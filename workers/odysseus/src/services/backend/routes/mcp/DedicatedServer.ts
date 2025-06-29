import { app } from '@core/app';
import { odysseus } from '@core/error';
import { FortniteProfile } from '@utils/mcp/base-profile';

//TODO: Add auth to this that a gameserver could use
app.post('/fortnite/api/game/v2/profile/:accountId/dedicated_server/:operation', async (c) => {
	const accountId = c.req.param('accountId');
	const requestedProfileId = c.req.query('profileId');

	if (!FortniteProfile.isValidProfileType(requestedProfileId)) {
		return c.sendError(odysseus.mcp.invalidPayload.withMessage('Invalid profile ID'));
	}

	const fp = new FortniteProfile(accountId, requestedProfileId, c.var.cacheIdentifier);
	const profile = await fp.get();

	const profileObject = profile.buildProfileObject();

	profile.trackChange({
		changeType: 'fullProfileUpdate',
		profile: profileObject,
	});

	return c.json(profile.createResponse());
});
