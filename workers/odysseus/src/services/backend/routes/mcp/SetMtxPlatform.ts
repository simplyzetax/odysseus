import { app } from '@core/app';
import { odysseus } from '@core/error';
import { acidMiddleware } from '@middleware/auth/accountIdMiddleware';
import { ratelimitMiddleware } from '@middleware/core/rateLimitMiddleware';
import { FortniteProfile } from '@utils/mcp/base-profile';

app.post(
	'/fortnite/api/game/v2/profile/:accountId/client/SetMtxPlatform',
	acidMiddleware,
	ratelimitMiddleware({
		capacity: 10,
		initialTokens: 3,
		refillRate: 0.5,
	}),
	async (c) => {
		const requestedProfileId = c.req.query('profileId');
		if (!requestedProfileId) return c.sendError(odysseus.mcp.invalidPayload.withMessage('profileId is required'));

		//TODO: not sure if it's actually common_core, but we'll see when i test it
		if (!FortniteProfile.isExactProfileType(requestedProfileId, 'common_core')) {
			return c.sendError(odysseus.mcp.invalidPayload.withMessage('Invalid profile ID, must be common_core'));
		}

		const fp = await FortniteProfile.construct(c.var.accountId, requestedProfileId, c.var.cacheIdentifier);
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
	},
);
