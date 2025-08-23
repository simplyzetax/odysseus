import { drizzle } from 'drizzle-orm/sqlite-proxy';
import { starbase } from './driver';

/**
 * Gets the database client
 * @param c - The context
 * @returns The database client
 */
export const getDB = (databaseIdentifier: string) => {
	return drizzle(
		...starbase(databaseIdentifier)
	);
};

export type DB = ReturnType<typeof getDB>;
