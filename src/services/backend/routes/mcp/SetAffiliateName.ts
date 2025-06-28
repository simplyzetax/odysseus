import { app } from '@core/app';
import { getDB } from '@core/db/client';
import { ACCOUNTS } from '@core/db/schemas/account';
import { odysseus } from '@core/error';
import { acidMiddleware } from '@middleware/auth/accountIdMiddleware';
import { FortniteProfile } from '@utils/mcp/base-profile';
import { eq } from 'drizzle-orm';
import { validator } from 'hono/validator';
import z from 'zod';

const setAffiliateNameSchema = z.object({
	affiliateName: z.string(),
});

app.post(
	'/fortnite/api/game/v2/profile/:accountId/client/SetAffiliateName',
	validator('json', (value, c) => {
		const result = setAffiliateNameSchema.safeParse(value);
		return result.success ? result.data : c.sendError(odysseus.mcp.invalidPayload.withMessage(JSON.stringify(result.error.errors)));
	}),
	acidMiddleware,
	async (c) => {
		const requestedProfileId = c.req.query('profileId');
		if (!FortniteProfile.isValidProfileType(requestedProfileId)) {
			return c.sendError(odysseus.mcp.invalidPayload.withMessage('Invalid profile ID'));
		}

		const { affiliateName } = c.req.valid('json');

		const db = getDB(c);

		const [sacAccount] = await db.select().from(ACCOUNTS).where(eq(ACCOUNTS.displayName, affiliateName));
		if (!sacAccount) {
			return c.sendError(odysseus.basic.notFound.withMessage('Affiliate name not found'));
		}

		const now = new Date().toISOString();

		const fp = new FortniteProfile(c, c.var.accountId, requestedProfileId);
		const profile = await fp.get();

		profile.trackChange({
			changeType: 'statModified',
			name: 'mtx_affiliate_set_time',
			value: now,
		});

		profile.trackChange({
			changeType: 'statModified',
			name: 'mtx_affiliate',
			value: affiliateName,
		});

		c.executionCtx.waitUntil(profile.updateAttribute('mtx_affiliate_set_time', now));
		c.executionCtx.waitUntil(profile.updateAttribute('mtx_affiliate', affiliateName));

		return c.json(profile.createResponse());
	}
);
