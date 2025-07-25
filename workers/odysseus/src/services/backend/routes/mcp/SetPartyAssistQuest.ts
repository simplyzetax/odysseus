import { app } from '@core/app';
import { acidMiddleware } from '@middleware/auth/accountIdMiddleware';
import { type } from 'arktype';
import { odysseus } from '@core/error';
import { FortniteProfile } from '@utils/mcp/base-profile';
import { arktypeValidator } from '@hono/arktype-validator';
import { mcpValidationMiddleware } from '@middleware/game/mcpValidationMiddleware';
import { ATTRIBUTE_KEYS } from '@utils/mcp/constants';

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

		const profile = await FortniteProfile.fromAccountId(c.var.accountId, c.var.profileType, c.var.cacheIdentifier);

		profile.trackChange({
			changeType: 'statModified',
			name: ATTRIBUTE_KEYS.MTX_PARTY_ASSIST_QUEST,
			value: questToPinAsPartyAssist,
		});

		await profile.applyChanges();

		return c.json(profile.createResponse());
	},
);
