import { app } from '@core/app';
import { acidMiddleware } from '@middleware/auth/accountIdMiddleware';
import { type } from 'arktype';
import { odysseus } from '@core/error';
import { FortniteProfile } from '@utils/mcp/base-profile';
import { arktypeValidator } from '@hono/arktype-validator';
import { mcpValidationMiddleware } from '@middleware/game/mcpValidationMiddleware';
import { ATTRIBUTE_KEYS } from '@utils/mcp/constants';

const setSeasonPassAutoClaimSchema = type({
	bEnabled: 'boolean',
	seasonIds: 'string[]',
});

app.post(
	'/fortnite/api/game/v2/profile/:accountId/client/SetSeasonPassAutoClaim',
	arktypeValidator('json', setSeasonPassAutoClaimSchema),
	acidMiddleware,
	mcpValidationMiddleware,
	async (c) => {
		const { bEnabled, seasonIds } = c.req.valid('json');

		const profile = await FortniteProfile.fromAccountId(c.var.accountId, c.var.profileType, c.var.cacheIdentifier);

		const seasonIdsAttribute =
			(await profile.getAttribute(ATTRIBUTE_KEYS.AUTO_SPEND_SEASON_CURRENCY_IDS)) ||
			profile.createAttribute(ATTRIBUTE_KEYS.AUTO_SPEND_SEASON_CURRENCY_IDS, []);

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
			name: ATTRIBUTE_KEYS.AUTO_SPEND_SEASON_CURRENCY_IDS,
			value: seasonIdsAttribute?.valueJSON,
		});

		await profile.updateAttribute(ATTRIBUTE_KEYS.AUTO_SPEND_SEASON_CURRENCY_IDS, seasonIdsAttribute.valueJSON);

		return c.json(profile.createResponse());
	},
);
