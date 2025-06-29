import { app } from '@core/app';
import { odysseus } from '@core/error';
import { devAuthMiddleware } from '@middleware/auth/devAuthMiddleware';
import { getSignedCookie, setSignedCookie } from 'hono/cookie';
import { arktypeValidator } from '@hono/arktype-validator';
import { nanoid } from 'nanoid';
import { type } from 'arktype';

app.delete('/cache', async (c) => {
	const queryColoParam = c.req.query('colo');
	let colo: string;
	let cacheIdentifier: string | undefined;

	if (queryColoParam) {
		colo = queryColoParam;
	} else {
		cacheIdentifier = (await getSignedCookie(c, c.env.JWT_SECRET, 'cacheIdentifier')) || undefined;
		if (!cacheIdentifier) {
			return c.sendError(odysseus.basic.badRequest.withMessage('Missing cache identifier or colo parameter'));
		}
		colo = cacheIdentifier.split('-')[0];
	}

	const cacheId = c.env.CACHE_DO.idFromName(colo);
	const cacheInstance = c.env.CACHE_DO.get(cacheId);

	if (queryColoParam) {
		// Clear all cache for the colo
		await cacheInstance.emptyCache();
	} else {
		// Clear cache for specific identifier
		await cacheInstance.emptyCacheForIdentifier(cacheIdentifier!);
	}

	return c.json({
		message: queryColoParam ? 'All cache cleared for colo' : 'Cache cleared for identifier',
		colo,
		...(cacheIdentifier && { cacheIdentifier }),
	});
});

const coloSchema = type({
	colo: 'string',
});

app.put('/cache/colo', devAuthMiddleware, arktypeValidator('json', coloSchema), async (c) => {
	const { colo } = c.req.valid('json');

	const cacheIdentifier = `${colo}-${nanoid()}`;

	await setSignedCookie(c, 'cacheIdentifier', cacheIdentifier, c.env.JWT_SECRET);

	return c.json({
		message: 'Cache identifier set',
		colo,
		cacheIdentifier,
	});
});

app.get('/cache/stats', devAuthMiddleware, async (c) => {
	const queryColoParam = c.req.query('colo');
	let colo: string;

	if (queryColoParam) {
		colo = queryColoParam;
	} else {
		const cacheIdentifier = await getSignedCookie(c, c.env.JWT_SECRET, 'cacheIdentifier');
		if (!cacheIdentifier) {
			return c.sendError(odysseus.basic.badRequest.withMessage('Missing cache identifier or colo parameter'));
		}
		colo = cacheIdentifier.split('-')[0];
	}

	const cacheId = c.env.CACHE_DO.idFromName(colo);
	const cacheInstance = c.env.CACHE_DO.get(cacheId);

	const cacheStats = await cacheInstance.getCacheStats();

	return c.json({
		message: 'Cache stats',
		colo,
		cacheStats,
	});
});

app.get('/cache/entries', devAuthMiddleware, async (c) => {
	const queryColoParam = c.req.query('colo');
	let colo: string;

	if (queryColoParam) {
		colo = queryColoParam;
	} else {
		const cacheIdentifier = await getSignedCookie(c, c.env.JWT_SECRET, 'cacheIdentifier');
		if (!cacheIdentifier) {
			return c.sendError(odysseus.basic.badRequest.withMessage('Missing cache identifier or colo parameter'));
		}
		colo = cacheIdentifier.split('-')[0];
	}

	const cacheId = c.env.CACHE_DO.idFromName(colo);
	const cacheInstance = c.env.CACHE_DO.get(cacheId);

	const cacheEntries = await cacheInstance.getCacheEntries(100);

	return c.json({
		message: 'Cache entries',
		colo,
		cacheEntries,
	});
});
