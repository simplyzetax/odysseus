import { app } from '@core/app';
import { acidMiddleware } from '@middleware/auth/accountIdMiddleware';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { FortniteProfile } from '@utils/mcp/base-profile';
import { mcpValidationMiddleware } from '@middleware/game/mcpValidationMiddleware';

const setPartyAssistQuestSchema = z.object({
	questToPinAsPartyAssist: z.string(),
});

app.post(
	'/fortnite/api/game/v2/profile/:accountId/client/SetPartyAssistQuest',
	zValidator('json', setPartyAssistQuestSchema),
	acidMiddleware,
	mcpValidationMiddleware,
	async (c) => {
		const { questToPinAsPartyAssist } = c.req.valid('json');

		const profile = await FortniteProfile.construct(c.var.accountId, c.var.profileType, c.var.databaseIdentifier);

		profile.trackChange({
			changeType: 'statModified',
			name: 'mtx_party_assist_quest',
			value: questToPinAsPartyAssist,
		});

		c.executionCtx.waitUntil(profile.updateAttribute('mtx_party_assist_quest', questToPinAsPartyAssist));

		return c.json(profile.createResponse());
	},
);
