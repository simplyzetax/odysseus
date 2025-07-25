import { app } from '@core/app';
import { odysseus } from '@core/error';
import { arktypeValidator } from '@hono/arktype-validator';
import { acidMiddleware } from '@middleware/auth/accountIdMiddleware';
import { ratelimitMiddleware } from '@middleware/core/rateLimitMiddleware';
import { mcpValidationMiddleware } from '@middleware/game/mcpValidationMiddleware';
import { FortniteProfile } from '@utils/mcp/base-profile';
import { type } from 'arktype';

const setMtxPlatformSchema = type({
	newPlatform: 'string',
});

app.post(
	'/fortnite/api/game/v2/profile/:accountId/client/SetMtxPlatform',
	arktypeValidator('json', setMtxPlatformSchema),
	acidMiddleware,
	ratelimitMiddleware({
		capacity: 10,
		initialTokens: 3,
		refillRate: 0.5,
	}),
	mcpValidationMiddleware,
	async (c) => {
		const profile = await FortniteProfile.construct(c.var.accountId, c.var.profileType, c.var.cacheIdentifier);
		if (!profile) {
			return odysseus.mcp.profileNotFound.toResponse();
		}

		profile.trackChange({
			changeType: 'statModified',
			name: 'current_mtx_platform',
			value: c.req.valid('json').newPlatform || 'EpicPC',
		});

		const response = profile.createResponse();
		return c.json(response);
	},
);
