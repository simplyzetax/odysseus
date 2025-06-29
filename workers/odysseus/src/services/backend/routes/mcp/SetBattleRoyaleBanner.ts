import { app } from '@core/app';
import { acidMiddleware } from '@middleware/auth/accountIdMiddleware';
import { type } from 'arktype';
import { odysseus } from '@core/error';
import { FortniteProfile } from '@utils/mcp/base-profile';
import { arktypeValidator } from '@hono/arktype-validator';

const setBattleRoyaleBannerSchema = type({
	homebaseBannerIconId: 'string',
	homebaseBannerColorId: 'string',
});

app.post(
	'/fortnite/api/game/v2/profile/:accountId/client/SetBattleRoyaleBanner',
	arktypeValidator('json', setBattleRoyaleBannerSchema),
	acidMiddleware,
	async (c) => {
		const requestedProfileId = c.req.query('profileId');
		if (!requestedProfileId) {
			return c.sendError(odysseus.mcp.invalidPayload.withMessage('Missing profile ID'));
		}

		if (!FortniteProfile.isValidProfileType(requestedProfileId)) {
			return c.sendError(odysseus.mcp.invalidPayload.withMessage('Invalid profile ID'));
		}

		const { homebaseBannerIconId, homebaseBannerColorId } = c.req.valid('json');

		const profile = await FortniteProfile.construct(c.var.accountId, requestedProfileId, c.var.cacheIdentifier);

		const item = await profile.getItemBy('id', homebaseBannerIconId);
		if (!item) {
			return c.sendError(odysseus.mcp.invalidPayload.withMessage('Item not found in profile'));
		}

		profile.trackChange({
			changeType: 'statModified',
			name: 'banner_icon',
			value: homebaseBannerIconId,
		});

		profile.trackChange({
			changeType: 'statModified',
			name: 'banner_color',
			value: homebaseBannerColorId,
		});

		c.executionCtx.waitUntil(profile.updateAttribute('banner_icon', homebaseBannerIconId));
		c.executionCtx.waitUntil(profile.updateAttribute('banner_color', homebaseBannerColorId));

		return c.json(profile.createResponse());
	},
);
