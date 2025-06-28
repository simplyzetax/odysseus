import { app } from '@core/app';
import { odysseus } from '@core/error';
import { acidMiddleware } from '@middleware/auth/accountIdMiddleware';
import { ratelimitMiddleware } from '@middleware/core/rateLimitMiddleware';
import { FortniteProfile } from '@utils/mcp/base-profile';

app.post(
	'/fortnite/api/game/v2/profile/:accountId/client/QueryProfile',
	acidMiddleware,
	ratelimitMiddleware({
		capacity: 10,
		initialTokens: 10,
		refillRate: 0.5,
	}),
	async (c) => {
		const requestedProfileId = c.req.query('profileId');
		if (!requestedProfileId) {
			return c.sendError(odysseus.mcp.invalidPayload.withMessage('Missing profile ID'));
		}

		if (!FortniteProfile.isValidProfileType(requestedProfileId)) {
			return c.sendError(odysseus.mcp.invalidPayload.withMessage('Invalid profile ID'));
		}

		const fp = new FortniteProfile(c, c.var.accountId, requestedProfileId);
		const profile = await fp.get();
		const profileObject = await profile.buildProfileObject();

		profile.trackChange({
			changeType: 'fullProfileUpdate',
			profile: profileObject,
		});

		return c.json(profile.createResponse());
	},
);
