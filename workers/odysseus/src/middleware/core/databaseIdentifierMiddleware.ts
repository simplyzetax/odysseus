import { createMiddleware } from 'hono/factory';

/**
 * Middleware that adds MCP (Model Context Protocol) correction data to JSON responses
 * Adds profile revision information based on the request's revision number
 */
export const databaseIdentifierMiddleware = createMiddleware(async (c, next) => {
	const subdomain = new URL(c.req.raw.url).hostname.split('.')[0] ?? 'default';
	c.set('databaseIdentifier', "default");
	await next();
});
