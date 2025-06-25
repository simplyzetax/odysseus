import { DurableObject } from "cloudflare:workers";
import { drizzle, type DrizzleSqliteDODatabase } from 'drizzle-orm/durable-sqlite';
import { migrate } from 'drizzle-orm/durable-sqlite/migrator';
import { eq, and, lt, gt, like } from 'drizzle-orm';
import migrations from '../../../../drizzle/migrations/drizzle-do/migrations';
import { cacheEntries, tableKeys, type NewCacheEntry, type NewTableKey } from '../../../core/db/schemas/cache/cache';

export interface CacheEntry {
    key: string;
    data: string;
    tables: string[];
    expiresAt: number;
    createdAt: number;
}

export interface TableKey {
    tableName: string;
    cacheKey: string;
    createdAt: number;
}

export class CacheDurableObject extends DurableObject {
    private db: DrizzleSqliteDODatabase;
    private readonly CLEANUP_INTERVAL = 5 * 60 * 1000; // 5 minutes

    constructor(ctx: DurableObjectState, env: Env) {
        super(ctx, env);
        this.db = drizzle(ctx.storage, { logger: false });
        
        // Add timeout to prevent constructor from hanging indefinitely
        this.ctx.blockConcurrencyWhile(async () => {
            try {
                await Promise.race([
                    Promise.all([
                        this.runMigrations(),
                        this.scheduleCleanupAlarm()
                    ]),
                    new Promise((_, reject) => 
                        setTimeout(() => reject(new Error('Durable Object initialization timeout after 10 seconds')), 10000)
                    )
                ]);
            } catch (error) {
                console.error("Error during Durable Object initialization:", error);
                // Don't rethrow - allow the object to continue with degraded functionality
            }
        });
        console.log("Cache Durable Object initialized with Drizzle ORM");
    }

    private async runMigrations(): Promise<void> {
        try {
            await Promise.race([
                migrate(this.db, migrations),
                new Promise((_, reject) => 
                    setTimeout(() => reject(new Error('Migration timeout')), 5000)
                )
            ]);
        } catch (error) {
            console.error("Error running migrations:", error);
            // Don't rethrow - let the Durable Object continue with potentially existing tables
        }
    }

    // RPC Methods for cache operations
    async getCacheEntry(key: string): Promise<any[] | null> {
        try {
            const now = Date.now();
            
            const results = await this.db
                .select({ data: cacheEntries.data })
                .from(cacheEntries)
                .where(and(
                    eq(cacheEntries.key, key),
                    gt(cacheEntries.expiresAt, now)
                ));

            if (results.length > 0) {
                console.log(`🎯 Cache HIT for key: ${key}`);
                return JSON.parse(results[0].data);
            } else {
                console.log(`❌ Cache MISS for key: ${key}`);
                return null;
            }
        } catch (error) {
            console.error('Cache get error:', error);
            return null;
        }
    }

    async putCacheEntry(key: string, data: string, tables: string[], ttl: number): Promise<void> {
        try {
            const now = Date.now();
            const expiresAt = now + (ttl * 1000);

            await this.db.transaction(async (tx) => {
                // Store the cache entry
                const newCacheEntry: NewCacheEntry = {
                    key,
                    data,
                    tables: JSON.stringify(tables),
                    expiresAt,
                    createdAt: now
                };

                await tx.insert(cacheEntries)
                    .values(newCacheEntry)
                    .onConflictDoUpdate({
                        target: cacheEntries.key,
                        set: {
                            data: newCacheEntry.data,
                            tables: newCacheEntry.tables,
                            expiresAt: newCacheEntry.expiresAt,
                            createdAt: newCacheEntry.createdAt
                        }
                    });

                // Remove existing table key mappings for this cache key
                await tx.delete(tableKeys).where(eq(tableKeys.cacheKey, key));

                // Track table associations
                if (tables.length > 0) {
                    const tableKeyEntries: NewTableKey[] = tables.map(table => ({
                        tableName: table,
                        cacheKey: key,
                        createdAt: now
                    }));

                    await tx.insert(tableKeys).values(tableKeyEntries);
                }
            });

            console.log(`💾 Cache PUT - Key: ${key}, Tables: [${tables.join(', ')}], TTL: ${ttl}s`);
        } catch (error) {
            console.error('Cache put error:', error);
            throw error;
        }
    }

    async invalidateByTables(tableNames: string[]): Promise<number> {
        try {
            let deletedCount = 0;
            const keysToDelete = new Set<string>();

            await this.db.transaction(async (tx) => {
                for (const tableName of tableNames) {
                    // Get all cache keys for this table
                    const results = await tx
                        .select({ cacheKey: tableKeys.cacheKey })
                        .from(tableKeys)
                        .where(eq(tableKeys.tableName, tableName));

                    for (const row of results) {
                        keysToDelete.add(row.cacheKey);
                    }
                }

                // Delete cache entries
                for (const cacheKey of keysToDelete) {
                    await tx.delete(cacheEntries).where(eq(cacheEntries.key, cacheKey));
                    deletedCount++;
                }

                // Remove table associations for the affected tables
                for (const tableName of tableNames) {
                    await tx.delete(tableKeys).where(eq(tableKeys.tableName, tableName));
                }
            });

            console.log(`🗑️  Cache INVALIDATION - Tables: [${tableNames.join(', ')}], Keys deleted: ${deletedCount}`);
            return deletedCount;
        } catch (error) {
            console.error('Cache invalidation error:', error);
            throw error;
        }
    }

    async invalidateByTags(tags: string[]): Promise<void> {
        try {
            await this.db.transaction(async (tx) => {
                for (const tag of tags) {
                    await tx.delete(cacheEntries).where(eq(cacheEntries.key, tag));
                }
            });

            console.log(`🗑️  Cache TAG INVALIDATION - Tags: [${tags.join(', ')}]`);
        } catch (error) {
            console.error('Cache tag invalidation error:', error);
            throw error;
        }
    }

    async cleanupExpiredEntries(): Promise<number> {
        try {
            const now = Date.now();

            // Get expired cache keys
            const expiredResults = await this.db
                .select({ key: cacheEntries.key })
                .from(cacheEntries)
                .where(lt(cacheEntries.expiresAt, now));

            if (expiredResults.length === 0) return 0;

            await this.db.transaction(async (tx) => {
                // Delete expired cache entries
                await tx.delete(cacheEntries).where(lt(cacheEntries.expiresAt, now));

                // Clean up associated table keys
                for (const row of expiredResults) {
                    await tx.delete(tableKeys).where(eq(tableKeys.cacheKey, row.key));
                }
            });

            console.log(`🧹 Cleaned up ${expiredResults.length} expired cache entries`);
            return expiredResults.length;
        } catch (error) {
            console.error("Error cleaning up expired entries:", error);
            return 0;
        }
    }

    async emptyCacheForIdentifier(identifier: string) {
        try {
            let deletedCount = 0;

            await this.db.transaction(async (tx) => {
                // Get all cache keys that start with the identifier
                const results = await tx
                    .select({ key: cacheEntries.key })
                    .from(cacheEntries)
                    .where(like(cacheEntries.key, `${identifier}%`));

                const keysToDelete = results.map(row => row.key);

                // Delete cache entries that start with the identifier
                if (keysToDelete.length > 0) {
                    await tx.delete(cacheEntries).where(like(cacheEntries.key, `${identifier}%`));

                    // Delete associated table keys for the deleted cache entries
                    for (const key of keysToDelete) {
                        await tx.delete(tableKeys).where(eq(tableKeys.cacheKey, key));
                    }

                    deletedCount = keysToDelete.length;
                }
            });

            console.log(`🧹 Emptied cache for identifier "${identifier}" - deleted ${deletedCount} entries`);
            return deletedCount;

        } catch (error) {
            console.error("Error emptying cache:", error);
            return 0;
        }
    }

    async getCacheStats(): Promise<{ totalEntries: number; expiredEntries: number }> {
        try {
            const now = Date.now();

            const totalResults = await this.db
                .select()
                .from(cacheEntries);

            const expiredResults = await this.db
                .select()
                .from(cacheEntries)
                .where(lt(cacheEntries.expiresAt, now));

            return { 
                totalEntries: totalResults.length, 
                expiredEntries: expiredResults.length 
            };
        } catch (error) {
            console.error("Error getting cache stats:", error);
            return { totalEntries: 0, expiredEntries: 0 };
        }
    }

    private async scheduleCleanupAlarm(): Promise<void> {
        try {
            // Check if an alarm is already scheduled
            const existingAlarm = await this.ctx.storage.getAlarm();
            if (existingAlarm) {
                console.log(`⏰ Cleanup alarm already scheduled for ${new Date(existingAlarm).toISOString()}`);
                return;
            }

            // Schedule next cleanup
            const nextCleanup = Date.now() + this.CLEANUP_INTERVAL;
            await this.ctx.storage.setAlarm(nextCleanup);

            console.log(`🔔 Scheduled cleanup alarm for ${new Date(nextCleanup).toISOString()}`);
        } catch (error) {
            console.error("Error scheduling cleanup alarm:", error);
        }
    }

    // Alarm handler - called automatically by Cloudflare Workers
    async alarm(): Promise<void> {
        try {
            console.log("🔔 Cleanup alarm triggered");
            await this.cleanupExpiredEntries();

            // Schedule the next cleanup
            await this.scheduleCleanupAlarm();
        } catch (error) {
            console.error("Error in alarm handler:", error);
            // Still try to reschedule even if cleanup failed
            try {
                await this.scheduleCleanupAlarm();
            } catch (scheduleError) {
                console.error("Error rescheduling alarm:", scheduleError);
            }
        }
    }

    async forceCleanup(): Promise<number> {
        try {
            const deletedCount = await this.cleanupExpiredEntries();
            console.log(`🧹 Manual cleanup completed, deleted ${deletedCount} entries`);
            return deletedCount;
        } catch (error) {
            console.error("Error in manual cleanup:", error);
            throw error;
        }
    }
}
