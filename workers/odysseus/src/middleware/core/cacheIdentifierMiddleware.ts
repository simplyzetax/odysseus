import { odysseus } from '@core/error';
import { env } from 'cloudflare:workers';
import { getSignedCookie, setSignedCookie } from 'hono/cookie';
import { createMiddleware } from 'hono/factory';
import { nanoid } from 'nanoid';

/**
 * Middleware that adds MCP (Model Context Protocol) correction data to JSON responses
 * Adds profile revision information based on the request's revision number
 */
export const cacheIdentifierMiddleware = createMiddleware(async (c, next) => {
	let cacheIdentifier = await getSignedCookie(c, env.JWT_SECRET, 'cacheIdentifier');
	if (!cacheIdentifier) {
		const colo = String(c.req.raw.cf?.colo);
		if (!colo) {
			return odysseus.basic.badRequest.withMessage('Missing Cloudflare colo').toResponse();
		}

		cacheIdentifier = `${colo}-${nanoid()}`;
		await setSignedCookie(c, 'cacheIdentifier', cacheIdentifier, env.JWT_SECRET);
	}

	c.set('cacheIdentifier', cacheIdentifier);

	await next();
});
