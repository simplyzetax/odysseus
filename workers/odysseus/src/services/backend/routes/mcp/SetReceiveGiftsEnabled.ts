import { app } from '@core/app';
import { acidMiddleware } from '@middleware/auth/accountIdMiddleware';
import { type } from 'arktype';
import { odysseus } from '@core/error';
import { FortniteProfile } from '@utils/mcp/base-profile';
import { arktypeValidator } from '@hono/arktype-validator';
import { mcpValidationMiddleware } from '@middleware/game/mcpValidationMiddleware';

const setReceiveGiftsEnabledSchema = type({
	bReceiveGifts: 'boolean',
});

app.post(
	'/fortnite/api/game/v2/profile/:accountId/client/SetReceiveGiftsEnabled',
	arktypeValidator('json', setReceiveGiftsEnabledSchema),
	acidMiddleware,
	mcpValidationMiddleware,
	async (c) => {
		const { bReceiveGifts } = c.req.valid('json');

		const profile = await FortniteProfile.construct(c.var.accountId, c.var.profileId, c.var.cacheIdentifier);

		profile.trackChange({
			changeType: 'statModified',
			name: 'allowed_to_receive_gifts',
			value: bReceiveGifts,
		});

		c.executionCtx.waitUntil(profile.updateAttribute('allowed_to_receive_gifts', bReceiveGifts));

		return c.json(profile.createResponse());
	},
);
