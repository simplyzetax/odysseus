import { DurableObject } from 'cloudflare:workers';
import { drizzle, type DrizzleSqliteDODatabase } from 'drizzle-orm/durable-sqlite';
import { eq, and, lt, gt, like } from 'drizzle-orm';
import { cacheEntries, CacheEntry, tableKeys, type NewCacheEntry, type NewTableKey } from '@core/db/schemas/cache/cache';

/**
 * A Durable Object that stores the cache in a SQLite database
 */
export class CacheDurableObject extends DurableObject {
	private db: DrizzleSqliteDODatabase;
	private initialized = false;

	constructor(ctx: DurableObjectState, env: Env) {
		super(ctx, env);
		this.db = drizzle(ctx.storage, { logger: false });

		this.ctx.blockConcurrencyWhile(async () => {
			await this.ensureTables();
		});
	}

	/**
	 * Ensures the tables are created in the database
	 */
	private async ensureTables(): Promise<void> {
		if (this.initialized) return;

		try {
			// Create tables with raw SQL - much simpler than migrations
			this.db.run(`
                CREATE TABLE IF NOT EXISTS cache_entries (
                    key TEXT PRIMARY KEY NOT NULL,
                    data TEXT NOT NULL,
                    tables TEXT NOT NULL,
                    expires_at INTEGER NOT NULL,
                    created_at INTEGER NOT NULL
                )
            `);

			this.db.run(`
                CREATE TABLE IF NOT EXISTS table_keys (
                    table_name TEXT NOT NULL,
                    cache_key TEXT NOT NULL,
                    created_at INTEGER NOT NULL,
                    PRIMARY KEY(table_name, cache_key)
                )
            `);

			// Create indexes
			this.db.run('CREATE INDEX IF NOT EXISTS idx_cache_expires_at ON cache_entries (expires_at)');
			this.db.run('CREATE INDEX IF NOT EXISTS idx_table_keys_table_name ON table_keys (table_name)');

			this.initialized = true;
		} catch (error) {
			console.error('❌ Failed to create cache tables:', error);
			throw error;
		}
	}

	/**
	 * Gets a cache entry from the database
	 * @param key - The key of the cache entry
	 * @returns The cache entry
	 */
	async getCacheEntry(key: string): Promise<unknown | undefined> {
		try {
			const now = Date.now();

			const [result] = await this.db
				.select({ data: cacheEntries.data })
				.from(cacheEntries)
				.where(and(eq(cacheEntries.key, key), gt(cacheEntries.expiresAt, now)));

			if (result) {
				//console.log(`🎯 Cache HIT: ${key}`);
				return JSON.parse(result.data) as unknown;
			} else {
				//console.log(`❌ Cache MISS: ${key}`);
				return undefined;
			}
		} catch (error) {
			console.error(`💥 Cache GET error for ${key}:`, error);
			return null;
		}
	}

	/**
	 * Puts a cache entry into the database
	 * @param key - The key of the cache entry
	 * @param data - The data of the cache entry
	 * @param tables - The tables of the cache entry
	 * @param ttl - The time to live of the cache entry in seconds
	 */
	async putCacheEntry(key: string, data: string, tables: string[], ttl: number): Promise<void> {
		try {
			const now = Date.now();
			const expiresAt = now + ttl * 1000;

			await this.db.transaction(async (tx) => {
				// Insert/update cache entry
				const newCacheEntry: NewCacheEntry = {
					key,
					data,
					tables: JSON.stringify(tables),
					expiresAt,
					createdAt: now,
				};

				await tx
					.insert(cacheEntries)
					.values(newCacheEntry)
					.onConflictDoUpdate({
						target: cacheEntries.key,
						set: {
							data: newCacheEntry.data,
							tables: newCacheEntry.tables,
							expiresAt: newCacheEntry.expiresAt,
							createdAt: newCacheEntry.createdAt,
						},
					});

				// Remove old table mappings for this key
				await tx.delete(tableKeys).where(eq(tableKeys.cacheKey, key));

				// Add new table mappings
				if (tables.length > 0) {
					const tableKeyEntries: NewTableKey[] = tables.map((table) => ({
						tableName: table,
						cacheKey: key,
						createdAt: now,
					}));

					await tx.insert(tableKeys).values(tableKeyEntries);
				}
			});

			//console.log(`💾 Cache PUT: ${key} (TTL: ${ttl}s, Tables: [${tables.join(', ')}])`);
		} catch (error) {
			console.error(`💥 Cache PUT error for ${key}:`, error);
			throw error;
		}
	}

	/**
	 * Invalidates the cache by table names
	 * @param tableNames - The names of the tables to invalidate
	 * @returns The number of entries deleted
	 */
	async invalidateByTables(tableNames: string[]): Promise<number> {
		try {
			let deletedCount = 0;

			await this.db.transaction(async (tx) => {
				for (const tableName of tableNames) {
					// Get cache keys for this table
					const results = await tx.select({ cacheKey: tableKeys.cacheKey }).from(tableKeys).where(eq(tableKeys.tableName, tableName));

					// Delete cache entries
					for (const row of results) {
						await tx.delete(cacheEntries).where(eq(cacheEntries.key, row.cacheKey));
						deletedCount++;
					}

					// Remove table mappings
					await tx.delete(tableKeys).where(eq(tableKeys.tableName, tableName));
				}
			});

			//console.log(`🗑️ Cache invalidated for tables [${tableNames.join(', ')}]: ${deletedCount} entries deleted`);
			return deletedCount;
		} catch (error) {
			console.error('Cache invalidation error:', error);
			throw error;
		}
	}

	/**
	 * Cleans up expired entries from the database
	 * @returns The number of entries deleted
	 */
	async cleanupExpiredEntries(): Promise<number> {
		try {
			const now = Date.now();

			// Get expired keys
			const expiredResults = await this.db.select({ key: cacheEntries.key }).from(cacheEntries).where(lt(cacheEntries.expiresAt, now));

			if (expiredResults.length === 0) return 0;

			await this.db.transaction(async (tx) => {
				// Delete expired entries
				await tx.delete(cacheEntries).where(lt(cacheEntries.expiresAt, now));

				// Clean up table mappings
				for (const row of expiredResults) {
					await tx.delete(tableKeys).where(eq(tableKeys.cacheKey, row.key));
				}
			});

			//console.log(`🧹 Cleaned up ${expiredResults.length} expired cache entries`);
			return expiredResults.length;
		} catch (error) {
			console.error('Error cleaning up expired entries:', error);
			return 0;
		}
	}

	/**
	 * Empties the cache for a given identifier
	 * @param identifier - The identifier to empty the cache for
	 * @returns The number of entries deleted
	 */
	async emptyCacheForIdentifier(identifier: string): Promise<number> {
		try {
			const results = await this.db
				.select({ key: cacheEntries.key })
				.from(cacheEntries)
				.where(like(cacheEntries.key, `${identifier}%`));

			if (results.length === 0) return 0;

			await this.db.transaction(async (tx) => {
				// Delete cache entries
				await tx.delete(cacheEntries).where(like(cacheEntries.key, `${identifier}%`));

				// Delete table mappings
				for (const row of results) {
					await tx.delete(tableKeys).where(eq(tableKeys.cacheKey, row.key));
				}
			});

			return results.length;
		} catch (error) {
			console.error('Error emptying cache:', error);
			return 0;
		}
	}

	/**
	 * Purges the entire cache
	 * @returns The number of entries deleted
	 */
	async emptyCache(): Promise<number> {
		try {
			const results = await this.db.select().from(cacheEntries);

			await this.db.transaction(async (tx) => {
				// Delete all cache entries
				await tx.delete(cacheEntries);
				// Delete all table mappings
				await tx.delete(tableKeys);
			});

			//console.log(`🧹 Emptied entire cache: ${results.length} entries deleted`);
			return results.length;
		} catch (error) {
			console.error('Error emptying cache:', error);
			return 0;
		}
	}

	/**
	 * Gets the stats of the cache
	 * @returns The stats of the cache
	 */
	async getCacheStats(): Promise<{ totalEntries: number; expiredEntries: number }> {
		try {
			const now = Date.now();

			const totalResults = await this.db.select().from(cacheEntries);
			const expiredResults = await this.db.select().from(cacheEntries).where(lt(cacheEntries.expiresAt, now));

			return {
				totalEntries: totalResults.length,
				expiredEntries: expiredResults.length,
			};
		} catch (error) {
			console.error('Error getting cache stats:', error);
			return { totalEntries: 0, expiredEntries: 0 };
		}
	}

	/**
	 * Gets the cache entries from the database
	 * @param limit - The limit of entries to get
	 * @returns The cache entries
	 */
	async getCacheEntries(limit: number = 50): Promise<CacheEntry[]> {
		const results = await this.db.select().from(cacheEntries).limit(limit);
		return results;
	}

	/**
	 * Simple alarm for cleanup every 5 minutes
	 */
	async alarm(): Promise<void> {
		try {
			await this.cleanupExpiredEntries();

			// Schedule next cleanup
			const nextCleanup = Date.now() + 5 * 60 * 1000;
			await this.ctx.storage.setAlarm(nextCleanup);
		} catch (error) {
			console.error('Error in alarm handler:', error);
		}
	}
}
