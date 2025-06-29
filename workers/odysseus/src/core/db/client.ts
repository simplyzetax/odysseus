import { drizzle } from 'drizzle-orm/postgres-js';
import { CloudflareDurableObjectRPCDrizzleCache } from '@utils/cache/drizzleCache';
import type { Bindings } from '@otypes/bindings';
import { env } from 'cloudflare:workers';

/**
 * Gets the database client
 * @param c - The context
 * @returns The database client
 */
export const getDB = (cacheIdentifier: string) => {
	const durableObjectCache = new CloudflareDurableObjectRPCDrizzleCache(cacheIdentifier);

	return drizzle(env.DB.connectionString, {
		cache: durableObjectCache,
		logger: {
			logQuery: (query, params) => {
				console.log(query, params);
			},
		},
	});
};

export const getDBSimple = (env: Bindings) => {
	return drizzle(env.DB.connectionString);
};

export type DB = ReturnType<typeof getDB>;
