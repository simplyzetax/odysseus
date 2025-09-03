import { app } from '@core/app';
import { acidMiddleware } from '@middleware/auth/accountIdMiddleware';
import { FortniteProfile } from '@utils/mcp/base-profile';
import { mcpValidationMiddleware } from '@middleware/game/mcpValidationMiddleware';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';

const athenaPinQuestSchema = z.object({
	pinnedQuest: z.string(),
});

app.post(
	'/fortnite/api/game/v2/profile/:accountId/client/AthenaPinQuest',
	zValidator('json', athenaPinQuestSchema),
	acidMiddleware,
	mcpValidationMiddleware,
	async (c) => {
		const { pinnedQuest } = c.req.valid('json');

		const profile = await FortniteProfile.construct(c.var.accountId, c.var.profileType, c.var.databaseIdentifier);

		profile.trackChange({
			changeType: 'statModified',
			name: 'pinned_quest',
			value: pinnedQuest,
		});

		c.executionCtx.waitUntil(profile.updateAttribute('pinned_quest', pinnedQuest));

		return c.json(profile.createResponse());
	},
);
