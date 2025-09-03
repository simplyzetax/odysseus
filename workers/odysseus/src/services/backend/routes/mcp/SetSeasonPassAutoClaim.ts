import { app } from '@core/app';
import { acidMiddleware } from '@middleware/auth/accountIdMiddleware';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { FortniteProfile } from '@utils/mcp/base-profile';
import { mcpValidationMiddleware } from '@middleware/game/mcpValidationMiddleware';

const setSeasonPassAutoClaimSchema = z.object({
	bEnabled: z.boolean(),
	seasonIds: z.array(z.string()),
});

app.post(
	'/fortnite/api/game/v2/profile/:accountId/client/SetSeasonPassAutoClaim',
	zValidator('json', setSeasonPassAutoClaimSchema),
	acidMiddleware,
	mcpValidationMiddleware,
	async (c) => {
		const { bEnabled, seasonIds } = c.req.valid('json');

		const profile = await FortniteProfile.construct(c.var.accountId, c.var.profileType, c.var.databaseIdentifier);

		const seasonIdsAttribute =
			(await profile.getAttribute('auto_spend_season_currency_ids')) || profile.createAttribute('auto_spend_season_currency_ids', []);

		if (!Array.isArray(seasonIdsAttribute.valueJSON)) {
			seasonIdsAttribute.valueJSON = [];
		}

		if (bEnabled) {
			const newSeasonIds = seasonIds.filter((id: string) => !seasonIdsAttribute.valueJSON.includes(id));
			seasonIdsAttribute.valueJSON.push(...newSeasonIds);
		} else {
			seasonIdsAttribute.valueJSON = seasonIdsAttribute.valueJSON.filter((id: string) => !seasonIds.includes(id));
		}

		profile.trackChange({
			changeType: 'statModified',
			name: 'auto_spend_season_currency_ids',
			value: seasonIdsAttribute?.valueJSON,
		});

		c.executionCtx.waitUntil(profile.updateAttribute('auto_spend_season_currency_ids', seasonIdsAttribute.valueJSON));

		return c.json(profile.createResponse());
	},
);
