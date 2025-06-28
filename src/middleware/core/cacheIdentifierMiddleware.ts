import { odysseus } from '@core/error';
import type { Context } from 'hono';
import { getSignedCookie, setSignedCookie } from 'hono/cookie';
import { createMiddleware } from 'hono/factory';
import { nanoid } from 'nanoid';

/**
 * Middleware that adds MCP (Model Context Protocol) correction data to JSON responses
 * Adds profile revision information based on the request's revision number
 */
export const cacheIdentifierMiddleware = createMiddleware(
	async (c: Context<{ Bindings: Env; Variables: { cacheIdentifier: string } }>, next) => {
		let cacheIdentifier = await getSignedCookie(c, c.env.JWT_SECRET, 'cacheIdentifier');
		if (!cacheIdentifier) {
			const colo = String(c.req.raw.cf?.colo);
			if (!colo) {
				return c.sendError(odysseus.basic.badRequest.withMessage('Missing Cloudflare colo'));
			}

			cacheIdentifier = `${colo}-${nanoid()}`;
			await setSignedCookie(c, 'cacheIdentifier', cacheIdentifier, c.env.JWT_SECRET);
		}

		c.set('cacheIdentifier', cacheIdentifier);

		/*if (!getCookie(c, 'cacheAssociatedWithAccountId')) {
			const Authorization = c.req.header('Authorization');
			if (Authorization?.startsWith('Bearer ')) {
				const token = Authorization.split(' ')[1];
				if (token) {
					try {
						const verifiedToken = await JWT.verifyToken(token);
						if (verifiedToken?.sub) {
							const accountId = verifiedToken.sub;
							setCookie(c, 'cacheAssociatedWithAccountId', accountId);

							// Associate the cache identifier with the account id
							c.executionCtx.waitUntil(c.env.KV.put(accountId, cacheIdentifier));
						}
					} catch {
						// JWT verification failed, continue without association
					}
				}
			}
		}*/

		await next();
	}
);
