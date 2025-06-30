import { odysseus } from '@core/error';
import type { Context } from 'hono';
import { createMiddleware } from 'hono/factory';

export const devAuthMiddleware = createMiddleware(async (c: Context<{ Bindings: Env }>, next) => {
	const Authorization = c.req.header('Authorization');
	if (!Authorization?.startsWith('Bearer ')) {
		return odysseus.authentication.invalidHeader.withMessage('Missing or invalid Authorization header').toResponse();
	}

	const token = Authorization.split(' ')[1];
	if (!token) {
		return odysseus.authentication.invalidHeader.withMessage('Missing token in Authorization header').toResponse();
	}

	if (token !== c.env.DEV_AUTH_TOKEN) {
		return odysseus.authentication.invalidToken.withMessage('Invalid or expired dev token').toResponse();
	}

	await next();
});
