import { odysseus } from '@core/error';
import { GRANT_TYPES, JWT } from '@utils/auth/jwt';
import type { Context } from 'hono';
import { createMiddleware } from 'hono/factory';

export const clientTokenVerify = createMiddleware(async (c: Context<{ Bindings: Env }>, next) => {
	const Authorization = c.req.header('Authorization');
	if (!Authorization?.toLowerCase().startsWith('bearer ')) {
		return odysseus.authentication.invalidHeader.withMessage('Missing or invalid Authorization header client token').toResponse();
	}

	const token = Authorization.split(' ')[1];
	if (!token) {
		return odysseus.authentication.invalidHeader.withMessage('Missing token in Authorization header client token').toResponse();
	}

	const verifiedToken = await JWT.verifyToken(token);
	if (!verifiedToken || verifiedToken.am !== GRANT_TYPES.client_credentials) {
		console.log(
			'Invalid or expired client token client token. Debug: Is client credentails',
			verifiedToken?.am === GRANT_TYPES.client_credentials,
			'but it is',
			verifiedToken?.am,
		);
		return odysseus.authentication.invalidToken.withMessage('Invalid or expired client token client token').toResponse();
	}

	await next();
});
