import { app } from '@core/app';
import { odysseus } from '@core/error';
import { acidMiddleware } from '@middleware/auth/accountIdMiddleware';
import { FortniteProfile } from '@utils/mcp/base-profile';
import { validator } from 'hono/validator';
import z from 'zod';

const markItemSeenSchema = z.object({
	itemIds: z.array(z.string()).min(1),
});

app.post(
	'/fortnite/api/game/v2/profile/:accountId/client/MarkItemSeen',
	validator('json', (value, c) => {
		const result = markItemSeenSchema.safeParse(value);
		return result.success
			? result.data
			: c.sendError(odysseus.mcp.invalidPayload.withMessage(result.error.errors.map((e) => e.message).join(', ')));
	}),
	acidMiddleware,
	async (c) => {
		const requestedProfileId = c.req.query('profileId');
		if (!requestedProfileId) return c.sendError(odysseus.mcp.invalidPayload.withMessage('profileId is required'));

		if (!FortniteProfile.isValidProfileType(requestedProfileId)) {
			return c.sendError(odysseus.mcp.invalidPayload.withMessage('Invalid profile ID'));
		}

		const fp = new FortniteProfile(c, c.var.accountId, requestedProfileId);
		const profile = await fp.get();

		const { itemIds } = c.req.valid('json');

		c.executionCtx.waitUntil(profile.updateSeenStatus(itemIds));

		for (const itemId of itemIds) {
			profile.trackChange({
				changeType: 'itemAttrChanged',
				itemId: itemId,
				attributeName: 'item_seen',
				attributeValue: true,
			});
		}

		const response = profile.createResponse();
		return c.json(response);
	}
);
