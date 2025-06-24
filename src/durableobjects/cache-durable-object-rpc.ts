import { DurableObject } from "cloudflare:workers";

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
    private sql: SqlStorage;
    private readonly CLEANUP_INTERVAL = 5 * 60 * 1000; // 5 minutes

    constructor(ctx: DurableObjectState, env: Env) {
        super(ctx, env);
        this.sql = ctx.storage.sql;
        this.ctx.blockConcurrencyWhile(async () => {
            await this.initializeTables();
            await this.scheduleCleanupAlarm();
        });
        console.log("Cache Durable Object initialized");
    }

    private async initializeTables(): Promise<void> {
        try {
            // Create cache entries table
            await this.sql.exec(`
                CREATE TABLE IF NOT EXISTS cache_entries (
                    key TEXT PRIMARY KEY,
                    data TEXT NOT NULL,
                    tables TEXT NOT NULL,
                    expires_at INTEGER NOT NULL,
                    created_at INTEGER NOT NULL
                )
            `);

            // Create table keys tracking table
            await this.sql.exec(`
                CREATE TABLE IF NOT EXISTS table_keys (
                    table_name TEXT NOT NULL,
                    cache_key TEXT NOT NULL,
                    created_at INTEGER NOT NULL,
                    PRIMARY KEY (table_name, cache_key)
                )
            `);

            // Create indexes for better performance
            await this.sql.exec(`
                CREATE INDEX IF NOT EXISTS idx_cache_expires_at ON cache_entries(expires_at)
            `);

            await this.sql.exec(`
                CREATE INDEX IF NOT EXISTS idx_table_keys_table_name ON table_keys(table_name)
            `);

            await this.sql.exec(`
                CREATE INDEX IF NOT EXISTS idx_table_keys_cache_key ON table_keys(cache_key)
            `);
        } catch (error) {
            console.error("Error initializing cache tables:", error);
        }
    }

    // RPC Methods for cache operations
    async getCacheEntry(key: string): Promise<any[] | null> {
        try {
            const result = await this.sql.exec(
                `SELECT data FROM cache_entries WHERE key = ? AND expires_at > ?`,
                key,
                Date.now()
            );

            const rows = result.toArray();
            if (rows.length > 0) {
                const row = rows[0] as { data: string };
                console.log(`🎯 Cache HIT for key: ${key}`);
                return JSON.parse(row.data);
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

            // Use Cloudflare's transaction API
            await this.ctx.storage.transaction(async () => {
                // Store the cache entry
                await this.sql.exec(
                    `INSERT OR REPLACE INTO cache_entries (key, data, tables, expires_at, created_at) VALUES (?, ?, ?, ?, ?)`,
                    key,
                    data,
                    JSON.stringify(tables),
                    expiresAt,
                    now
                );

                // Remove existing table key mappings for this cache key
                await this.sql.exec(
                    "DELETE FROM table_keys WHERE cache_key = ?",
                    key
                );

                // Track table associations
                for (const table of tables) {
                    await this.sql.exec(
                        `INSERT INTO table_keys (table_name, cache_key, created_at) VALUES (?, ?, ?)`,
                        table,
                        key,
                        now
                    );
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

            // Use Cloudflare's transaction API
            await this.ctx.storage.transaction(async () => {
                for (const tableName of tableNames) {
                    // Get all cache keys for this table
                    const result = await this.sql.exec(
                        `SELECT cache_key FROM table_keys WHERE table_name = ?`,
                        tableName
                    );

                    const rows = result.toArray();
                    for (const row of rows) {
                        const cacheKey = (row as { cache_key: string }).cache_key;
                        keysToDelete.add(cacheKey);
                    }
                }

                // Delete cache entries
                for (const cacheKey of keysToDelete) {
                    await this.sql.exec(`DELETE FROM cache_entries WHERE key = ?`, cacheKey);
                    deletedCount++;
                }

                // Remove table associations for the affected tables
                for (const tableName of tableNames) {
                    await this.sql.exec(`DELETE FROM table_keys WHERE table_name = ?`, tableName);
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
            // Use Cloudflare's transaction API
            await this.ctx.storage.transaction(async () => {
                for (const tag of tags) {
                    await this.sql.exec(`DELETE FROM cache_entries WHERE key = ?`, tag);
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
            const expiredResult = await this.sql.exec(
                "SELECT key FROM cache_entries WHERE expires_at <= ?",
                now
            );

            const expiredRows = expiredResult.toArray();
            if (expiredRows.length === 0) return 0;

            // Use Cloudflare's transaction API
            await this.ctx.storage.transaction(async () => {
                // Delete expired cache entries
                await this.sql.exec(
                    "DELETE FROM cache_entries WHERE expires_at <= ?",
                    now
                );

                // Clean up associated table keys
                for (const row of expiredRows) {
                    const key = (row as { key: string }).key;
                    await this.sql.exec(
                        "DELETE FROM table_keys WHERE cache_key = ?",
                        key
                    );
                }
            });

            console.log(`🧹 Cleaned up ${expiredRows.length} expired cache entries`);
            return expiredRows.length;
        } catch (error) {
            console.error("Error cleaning up expired entries:", error);
            return 0;
        }
    }

    async getCacheStats(): Promise<{ totalEntries: number; expiredEntries: number }> {
        try {
            const now = Date.now();

            const totalResult = await this.sql.exec("SELECT COUNT(*) as count FROM cache_entries");
            const expiredResult = await this.sql.exec("SELECT COUNT(*) as count FROM cache_entries WHERE expires_at <= ?", now);

            const totalRows = totalResult.toArray();
            const expiredRows = expiredResult.toArray();

            const totalEntries = totalRows.length > 0 ? (totalRows[0] as { count: number }).count : 0;
            const expiredEntries = expiredRows.length > 0 ? (expiredRows[0] as { count: number }).count : 0;

            return { totalEntries, expiredEntries };
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

    // Keep the fetch method for backward compatibility if needed
    async fetch(request: Request): Promise<Response> {
        const url = new URL(request.url);
        const path = url.pathname;

        try {
            switch (request.method) {
                case "GET":
                    if (path === "/get") {
                        const key = url.searchParams.get("key");
                        if (!key) {
                            return new Response("Missing key parameter", { status: 400 });
                        }

                        const data = await this.getCacheEntry(key);
                        return new Response(JSON.stringify({ data }), {
                            headers: { "Content-Type": "application/json" }
                        });
                    }
                    if (path === "/stats") {
                        const stats = await this.getCacheStats();
                        return new Response(JSON.stringify(stats), {
                            headers: { "Content-Type": "application/json" }
                        });
                    }
                    break;

                case "POST":
                    if (path === "/put") {
                        const body = await request.json() as {
                            key: string;
                            data: string;
                            tables: string[];
                            ttl: number;
                        };
                        await this.putCacheEntry(body.key, body.data, body.tables, body.ttl);
                        return new Response("OK");
                    }
                    if (path === "/invalidate") {
                        const body = await request.json() as {
                            tags?: string[];
                            tables?: string[];
                        };

                        if (body.tags && body.tags.length > 0) {
                            await this.invalidateByTags(body.tags);
                        }
                        if (body.tables && body.tables.length > 0) {
                            await this.invalidateByTables(body.tables);
                        }

                        return new Response("OK");
                    }
                    if (path === "/cleanup") {
                        const deletedCount = await this.forceCleanup();
                        return new Response(JSON.stringify({ deletedCount }), {
                            headers: { "Content-Type": "application/json" }
                        });
                    }
                    break;
            }

            return new Response("Not Found", { status: 404 });
        } catch (error) {
            console.error("Cache Durable Object error:", error);
            return new Response("Internal Server Error", { status: 500 });
        }
    }
}
