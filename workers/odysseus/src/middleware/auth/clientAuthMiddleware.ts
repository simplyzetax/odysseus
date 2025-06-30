import { odysseus } from '@core/error';
import { GRANT_TYPES, JWT } from '@utils/auth/jwt';
import type { Context } from 'hono';
import { createMiddleware } from 'hono/factory';

export const clientTokenVerify = createMiddleware(async (c: Context<{ Bindings: Env }>, next) => {
	const Authorization = c.req.header('Authorization');
	if (!Authorization?.startsWith('Bearer ')) {
		return odysseus.authentication.invalidHeader.withMessage('Missing or invalid Authorization header').toResponse();
	}

	const token = Authorization.split(' ')[1];
	if (!token) {
		return odysseus.authentication.invalidHeader.withMessage('Missing token in Authorization header').toResponse();
	}

	const verifiedToken = await JWT.verifyToken(token);
	if (!verifiedToken || verifiedToken.am !== GRANT_TYPES.client_credentials) {
		return odysseus.authentication.invalidToken.withMessage('Invalid or expired client token').toResponse();
	}

	await next();
});
