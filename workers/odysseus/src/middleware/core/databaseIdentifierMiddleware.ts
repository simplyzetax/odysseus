import { createMiddleware } from 'hono/factory';

export const databaseIdentifierMiddleware = createMiddleware(async (c, next) => {
	const subdomain = new URL(c.req.raw.url).hostname.split('.')[0] ?? 'default';
	c.set('databaseIdentifier', "default");
	await next();
});
