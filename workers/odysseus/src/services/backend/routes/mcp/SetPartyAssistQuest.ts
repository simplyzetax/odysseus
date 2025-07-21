import { app } from '@core/app';
import { acidMiddleware } from '@middleware/auth/accountIdMiddleware';
import { type } from 'arktype';
import { odysseus } from '@core/error';
import { FortniteProfile } from '@utils/mcp/base-profile';
import { arktypeValidator } from '@hono/arktype-validator';
import { mcpValidationMiddleware } from '@middleware/game/mcpValidationMiddleware';

const setPartyAssistQuestSchema = type({
	questToPinAsPartyAssist: 'string',
});

app.post(
	'/fortnite/api/game/v2/profile/:accountId/client/SetPartyAssistQuest',
	arktypeValidator('json', setPartyAssistQuestSchema),
	acidMiddleware,
	mcpValidationMiddleware,
	async (c) => {
		const { questToPinAsPartyAssist } = c.req.valid('json');

		const profile = await FortniteProfile.construct(c.var.accountId, c.var.profileId, c.var.cacheIdentifier);

		profile.trackChange({
			changeType: 'statModified',
			name: 'mtx_party_assist_quest',
			value: questToPinAsPartyAssist,
		});

		c.executionCtx.waitUntil(profile.updateAttribute('mtx_party_assist_quest', questToPinAsPartyAssist));

		return c.json(profile.createResponse());
	},
);
