import { app } from '@core/app';
import { acidMiddleware } from '@middleware/auth/accountIdMiddleware';
import { type } from 'arktype';
import { odysseus } from '@core/error';
import { FortniteProfile } from '@utils/mcp/base-profile';
import { arktypeValidator } from '@hono/arktype-validator';
import { mcpValidationMiddleware } from '@middleware/game/mcpValidationMiddleware';
import { ATTRIBUTE_KEYS } from '@utils/mcp/constants';

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

		const profile = await FortniteProfile.fromAccountId(c.var.accountId, c.var.profileType, c.var.cacheIdentifier);

		profile.trackChange({
			changeType: 'statModified',
			name: ATTRIBUTE_KEYS.ALLOWED_TO_RECEIVE_GIFTS,
			value: bReceiveGifts,
		});

		await profile.applyChanges();

		return c.json(profile.createResponse());
	},
);
