import { drizzle } from 'drizzle-orm/sqlite-proxy';
import { starbase } from './driver';

/**
 * Gets the database client
 * @param c - The context
 * @returns The database client
 */
export const getDB = (cacheIdentifier: string) => {
	return drizzle(
		...starbase("db")
	);
};

export type DB = ReturnType<typeof getDB>;
