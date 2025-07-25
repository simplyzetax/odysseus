import { app } from '@core/app';
import { acidMiddleware } from '@middleware/auth/accountIdMiddleware';
import { type } from 'arktype';
import { FortniteProfile } from '@utils/mcp/base-profile';
import { arktypeValidator } from '@hono/arktype-validator';
import { mcpValidationMiddleware } from '@middleware/game/mcpValidationMiddleware';
import { ATTRIBUTE_KEYS } from '@utils/mcp/constants';

const athenaPinQuestSchema = type({
	pinnedQuest: 'string',
});

app.post(
	'/fortnite/api/game/v2/profile/:accountId/client/AthenaPinQuest',
	arktypeValidator('json', athenaPinQuestSchema),
	acidMiddleware,
	mcpValidationMiddleware,
	async (c) => {
		const { pinnedQuest } = c.req.valid('json');

		const profile = await FortniteProfile.fromAccountId(c.var.accountId, c.var.profileType, c.var.cacheIdentifier);

		profile.trackChange({
			changeType: 'statModified',
			name: ATTRIBUTE_KEYS.PINNED_QUEST,
			value: pinnedQuest,
		});

		c.executionCtx.waitUntil(profile.applyChanges());

		return c.json(profile.createResponse());
	},
);
