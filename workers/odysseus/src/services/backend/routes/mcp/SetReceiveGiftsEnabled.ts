import { app } from '@core/app';
import { acidMiddleware } from '@middleware/auth/accountIdMiddleware';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { odysseus } from '@core/error';
import { FortniteProfile } from '@utils/mcp/base-profile';
import { mcpValidationMiddleware } from '@middleware/game/mcpValidationMiddleware';

const setReceiveGiftsEnabledSchema = z.object({
	bReceiveGifts: z.boolean(),
});

app.post(
	'/fortnite/api/game/v2/profile/:accountId/client/SetReceiveGiftsEnabled',
	zValidator('json', setReceiveGiftsEnabledSchema),
	acidMiddleware,
	mcpValidationMiddleware,
	async (c) => {
		const { bReceiveGifts } = c.req.valid('json');

		const profile = await FortniteProfile.construct(c.var.accountId, c.var.profileType, c.var.databaseIdentifier);

		profile.trackChange({
			changeType: 'statModified',
			name: 'allowed_to_receive_gifts',
			value: bReceiveGifts,
		});

		c.executionCtx.waitUntil(profile.updateAttribute('allowed_to_receive_gifts', bReceiveGifts));

		return c.json(profile.createResponse());
	},
);
