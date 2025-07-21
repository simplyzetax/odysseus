import { app } from '@core/app';
import { odysseus } from '@core/error';
import { acidMiddleware } from '@middleware/auth/accountIdMiddleware';
import { ratelimitMiddleware } from '@middleware/core/rateLimitMiddleware';
import { mcpValidationMiddleware } from '@middleware/game/mcpValidationMiddleware';
import { FortniteProfile } from '@utils/mcp/base-profile';

app.post(
	'/fortnite/api/game/v2/profile/:accountId/client/SetMtxPlatform',
	acidMiddleware,
	ratelimitMiddleware({
		capacity: 10,
		initialTokens: 3,
		refillRate: 0.5,
	}),
	mcpValidationMiddleware,
	async (c) => {
		const profile = await FortniteProfile.construct(c.var.accountId, c.var.profileId, c.var.cacheIdentifier);
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
