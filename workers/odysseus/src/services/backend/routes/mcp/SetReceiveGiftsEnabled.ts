import { app } from '@core/app';
import { acidMiddleware } from '@middleware/auth/accountIdMiddleware';
import { type } from 'arktype';
import { odysseus } from '@core/error';
import { FortniteProfile } from '@utils/mcp/base-profile';
import { arktypeValidator } from '@hono/arktype-validator';

const setReceiveGiftsEnabledSchema = type({
	bReceiveGifts: 'boolean',
});

app.post(
	'/fortnite/api/game/v2/profile/:accountId/client/SetReceiveGiftsEnabled',
	arktypeValidator('json', setReceiveGiftsEnabledSchema),
	acidMiddleware,
	async (c) => {
		const requestedProfileId = c.req.query('profileId');
		if (!requestedProfileId) {
			return odysseus.mcp.invalidPayload.withMessage('Missing profile ID').toResponse();
		}

		if (!FortniteProfile.isValidProfileType(requestedProfileId)) {
			return odysseus.mcp.invalidPayload.withMessage('Invalid profile ID').toResponse();
		}

		const { bReceiveGifts } = c.req.valid('json');

		const profile = await FortniteProfile.construct(c.var.accountId, requestedProfileId, c.var.cacheIdentifier);

		profile.trackChange({
			changeType: 'statModified',
			name: 'allowed_to_receive_gifts',
			value: bReceiveGifts,
		});

		c.executionCtx.waitUntil(profile.updateAttribute('allowed_to_receive_gifts', bReceiveGifts));

		return c.json(profile.createResponse());
	},
);
