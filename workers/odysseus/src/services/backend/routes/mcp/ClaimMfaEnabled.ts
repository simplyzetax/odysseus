import { app } from '@core/app';
import { acidMiddleware } from '@middleware/auth/accountIdMiddleware';
import { ratelimitMiddleware } from '@middleware/core/rateLimitMiddleware';
import { FortniteProfile } from '@utils/mcp/base-profile';
import { mcpValidationMiddleware } from '@middleware/game/mcpValidationMiddleware';
import { odysseus } from '@core/error';
import { ATTRIBUTE_KEYS } from '@utils/mcp/constants';

app.post(
	'/fortnite/api/game/v2/profile/:accountId/client/ClaimMfaEnabled',
	acidMiddleware,
	ratelimitMiddleware({
		capacity: 10,
		initialTokens: 10,
		refillRate: 0.5,
	}),
	mcpValidationMiddleware,
	async (c) => {
		const profile = await FortniteProfile.fromAccountId(c.var.accountId, c.var.profileType, c.var.cacheIdentifier);
		if (!profile) {
			return odysseus.mcp.profileNotFound.toResponse();
		}

		const claimed = await profile.getAttribute(ATTRIBUTE_KEYS.MFA_REWARD_CLAIMED);
		if (claimed !== undefined) {
			return odysseus.mcp.operationForbidden.withMessage('MFA reward already claimed').toResponse();
		}

		const templateId = 'AthenaDance:EID_BoogieDown';

		profile.trackChange({
			changeType: 'statModified',
			name: ATTRIBUTE_KEYS.MFA_REWARD_CLAIMED,
			value: true,
		});

		profile.trackChange({
			changeType: 'itemAdded',
			itemId: 'temp-mfa-item', // Placeholder ID - applyChanges will update this
			item: {
				templateId,
				attributes: {
					quantity: 1,
				},
			},
		});

		await profile.applyChanges();

		return c.json(profile.createResponse());
	},
);
