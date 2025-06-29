import { app } from '@core/app';
import { acidMiddleware } from '@middleware/auth/accountIdMiddleware';
import { type } from 'arktype';
import { odysseus } from '@core/error';
import { FortniteProfile } from '@utils/mcp/base-profile';
import { arktypeValidator } from '@hono/arktype-validator';

const athenaPinQuestSchema = type({
	pinnedQuest: 'string',
});

app.post(
	'/fortnite/api/game/v2/profile/:accountId/client/AthenaPinQuest',
	arktypeValidator('json', athenaPinQuestSchema),
	acidMiddleware,
	async (c) => {
		const requestedProfileId = c.req.query('profileId');
		if (!requestedProfileId) {
			return c.sendError(odysseus.mcp.invalidPayload.withMessage('Missing profile ID'));
		}

		if (!FortniteProfile.isValidProfileType(requestedProfileId)) {
			return c.sendError(odysseus.mcp.invalidPayload.withMessage('Invalid profile ID'));
		}

		const { pinnedQuest } = c.req.valid('json');

		const profile = await FortniteProfile.construct(c.var.accountId, requestedProfileId, c.var.cacheIdentifier);

		profile.trackChange({
			changeType: 'statModified',
			name: 'pinned_quest',
			value: pinnedQuest,
		});

		c.executionCtx.waitUntil(profile.updateAttribute('pinned_quest', pinnedQuest));

		return c.json(profile.createResponse());
	},
);
