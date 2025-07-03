import { getDB } from '@core/db/client';
import type { Account } from '@core/db/schemas/account';
import { ACCOUNTS } from '@core/db/schemas/account';
import { odysseus } from '@core/error';
import { GRANT_TYPES, JWT } from '@utils/auth/jwt';
import { eq } from 'drizzle-orm';
import type { Context } from 'hono';
import { createMiddleware } from 'hono/factory';

export const accountMiddleware = createMiddleware(
	async (c: Context<{ Variables: { cacheIdentifier: string; account: Account } }>, next) => {
		const Authorization = c.req.header('Authorization');
		if (!Authorization?.toLowerCase().startsWith('bearer ')) {
			return odysseus.authentication.invalidHeader.withMessage('Missing or invalid Authorization header').toResponse();
		}

		const token = Authorization.split(' ')[1];
		if (!token) {
			return odysseus.authentication.invalidHeader.withMessage('Missing token in Authorization header').toResponse();
		}

		const verifiedToken = await JWT.verifyToken(token);
		if (!verifiedToken?.sub) {
			return odysseus.authentication.invalidToken.withMessage('Invalid or expired token').toResponse();
		}

		const db = getDB(c.var.cacheIdentifier);

		const [account] = await db.select().from(ACCOUNTS).where(eq(ACCOUNTS.id, verifiedToken.sub));
		if (!account) {
			return odysseus.authentication.authenticationFailed.withMessage(`Account with ID ${verifiedToken.sub} not found`).toResponse();
		}

		c.set('account', account);

		await next();
	},
);
