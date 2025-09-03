import { odysseus } from '@core/error';
import { Bindings } from '@otypes/bindings';
import { ProfileType } from '@otypes/fortnite/profiles';
import { MCPVariables } from '@otypes/variables';
import { FortniteProfile } from '@utils/mcp/base-profile';
import { Context } from 'hono';
import { createMiddleware } from 'hono/factory';

/**
 * Middleware that parses and validates the revision number from the request
 * and adds profile revision information to the response so we don't have to handle
 * it manually in the routes.
 */
export const mcpValidationMiddleware = createMiddleware(
	async (c: Context<{ Bindings: Bindings; Variables: { accountId: string; token: string, databaseIdentifier: string, profileType: ProfileType } }>, next) => {
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
