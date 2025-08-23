import { odysseus } from '@core/error';
import { Bindings } from '@otypes/bindings';
import { JWT } from '@utils/auth/jwt';
import type { Context } from 'hono';
import { createMiddleware } from 'hono/factory';

export const acidMiddleware = createMiddleware(
	async (c: Context<{ Bindings: Bindings; Variables: { accountId: string; token: string, databaseIdentifier: string } }>, next) => {
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

		c.set('accountId', verifiedToken.sub);
		c.set('token', token);

		await next();
	},
);
