import { odysseus } from '@core/error';
import { ProfileType } from '@otypes/fortnite/profiles';
import { FortniteProfile } from '@utils/mcp/base-profile';
import type { Context } from 'hono';
import { createMiddleware } from 'hono/factory';

export const mcpValidationMiddleware = createMiddleware(
	async (c: Context<{ Bindings: Env } & { Variables: { profileType: ProfileType } }>, next) => {
		const requestedProfileId = c.req.query('profileId');
		if (!requestedProfileId) {
			return odysseus.mcp.invalidPayload.withMessage('Missing profile ID').toResponse();
		}

		if (!FortniteProfile.isValidProfileType(requestedProfileId)) {
			return odysseus.mcp.invalidPayload.withMessage('Invalid profile ID').toResponse();
		}

		c.set('profileType', requestedProfileId);

		return await next();
	},
);
