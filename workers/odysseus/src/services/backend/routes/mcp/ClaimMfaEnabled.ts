import { app } from '@core/app';
import { acidMiddleware } from '@middleware/auth/accountIdMiddleware';
import { ratelimitMiddleware } from '@middleware/core/rateLimitMiddleware';
import { FortniteProfile } from '@utils/mcp/base-profile';
import { mcpValidationMiddleware } from '@middleware/game/mcpValidationMiddleware';
import { odysseus } from '@core/error';

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
		const profile = await FortniteProfile.construct(c.var.accountId, c.var.profileType, c.var.databaseIdentifier);
		if (!profile) {
			return odysseus.mcp.profileNotFound.toResponse();
		}

		const claimed = await profile.getAttribute('mfa_reward_claimed');
		if (claimed !== undefined) {
			return odysseus.mcp.operationForbidden.withMessage('MFA reward already claimed').toResponse();
		}

		const templateId = 'AthenaDance:EID_BoogieDown';

		await profile.updateAttribute('mfa_reward_claimed', true);
		const newItem = await profile.addItem(templateId);

		profile.trackChange({
			changeType: 'itemAdded',
			itemId: newItem.id,
			item: FortniteProfile.formatItemForMCP(newItem),
		});

		return c.json(profile.createResponse());
	},
);
