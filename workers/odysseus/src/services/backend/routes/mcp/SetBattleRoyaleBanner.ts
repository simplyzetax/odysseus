import { app } from '@core/app';
import { acidMiddleware } from '@middleware/auth/accountIdMiddleware';
import { type } from 'arktype';
import { odysseus } from '@core/error';
import { FortniteProfile } from '@utils/mcp/base-profile';
import { arktypeValidator } from '@hono/arktype-validator';
import { mcpValidationMiddleware } from '@middleware/game/mcpValidationMiddleware';
import { ATTRIBUTE_KEYS } from '@utils/mcp/constants';

const setBattleRoyaleBannerSchema = type({
	homebaseBannerIconId: 'string',
	homebaseBannerColorId: 'string',
});

app.post(
	'/fortnite/api/game/v2/profile/:accountId/client/SetBattleRoyaleBanner',
	arktypeValidator('json', setBattleRoyaleBannerSchema),
	acidMiddleware,
	mcpValidationMiddleware,
	async (c) => {
		const { homebaseBannerIconId, homebaseBannerColorId } = c.req.valid('json');

		const profile = await FortniteProfile.fromAccountId(c.var.accountId, c.var.profileType, c.var.cacheIdentifier);

		const item = await profile.getItemBy('id', homebaseBannerIconId);
		if (!item) {
			return odysseus.mcp.invalidPayload.withMessage('Item not found in profile').toResponse();
		}

		profile.trackChange({
			changeType: 'statModified',
			name: ATTRIBUTE_KEYS.BANNER_ICON,
			value: homebaseBannerIconId,
		});

		profile.trackChange({
			changeType: 'statModified',
			name: ATTRIBUTE_KEYS.BANNER_COLOR,
			value: homebaseBannerColorId,
		});

		await profile.applyChanges();

		return c.json(profile.createResponse());
	},
);
