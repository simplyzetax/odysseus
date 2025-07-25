import { drizzle } from 'drizzle-orm/postgres-js';
import { CloudflareDurableObjectRPCDrizzleCache } from '@utils/cache/drizzleCache';
import type { Bindings } from '@otypes/bindings';
import { env } from 'cloudflare:workers';
import { DatabaseError } from './error';
import { isDev } from '@core/env';

/**
 * Gets the database client
 * @param c - The context
 * @returns The database client
 */
export const getDB = (cacheIdentifier: string) => {
	const durableObjectCache = new CloudflareDurableObjectRPCDrizzleCache(cacheIdentifier);

	const db = drizzle(isDev ? env.DATABASE_URL : env.DB.connectionString, {
		cache: durableObjectCache,
	});

	return new Proxy(db, {
		get(target, prop, receiver) {
			const original = Reflect.get(target, prop, receiver);
			if (typeof original !== 'function') {
				return original;
			}
			return (...args: any[]) => {
				const result = original.apply(target, args);
				if (result && typeof result.catch === 'function') {
					return result.catch((err: Error) => {
						throw new DatabaseError(err.message);
					});
				}
				return result;
			};
		},
	});
};

export const getDBSimple = (env: Bindings) => {
	return drizzle(env.DB.connectionString);
};

export type DB = ReturnType<typeof getDB>;
