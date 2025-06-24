import { Cache } from "drizzle-orm/cache/core";
import { is, Table, getTableName } from "drizzle-orm";
import { CacheConfig } from "drizzle-orm/cache/core/types";

export class CloudflareKVDrizzleCache extends Cache {
    private globalTtl: number = 1000;
    private readonly tableKeysPrefix = "drizzle_table_keys:";

    constructor(private kv: KVNamespace) {
        super();
    }

    private getTableKeysStorageKey(tableName: string): string {
        return `${this.tableKeysPrefix}${tableName}`;
    }

    private async getTableKeys(tableName: string): Promise<string[]> {
        try {
            const stored = await this.kv.get(this.getTableKeysStorageKey(tableName));
            return stored ? JSON.parse(stored) : [];
        } catch (error) {
            console.error(`Error getting table keys for ${tableName}:`, error);
            return [];
        }
    }

    private async addTableKey(tableName: string, key: string): Promise<void> {
        try {
            const existingKeys = await this.getTableKeys(tableName);
            if (!existingKeys.includes(key)) {
                existingKeys.push(key);
                await this.kv.put(
                    this.getTableKeysStorageKey(tableName),
                    JSON.stringify(existingKeys),
                    { expirationTtl: 86400 } // 24 hours TTL for tracking data
                );
            }
        } catch (error) {
            console.error(`Error adding table key for ${tableName}:`, error);
        }
    }

    private async removeTableKeys(tableName: string, keysToRemove: Set<string>): Promise<void> {
        try {
            const existingKeys = await this.getTableKeys(tableName);
            const filteredKeys = existingKeys.filter(k => !keysToRemove.has(k));

            if (filteredKeys.length === 0) {
                await this.kv.delete(this.getTableKeysStorageKey(tableName));
            } else {
                await this.kv.put(
                    this.getTableKeysStorageKey(tableName),
                    JSON.stringify(filteredKeys),
                    { expirationTtl: 86400 }
                );
            }
        } catch (error) {
            console.error(`Error removing table keys for ${tableName}:`, error);
        }
    }

    // For the strategy, we have two options:
    // - 'explicit': The cache is used only when .$withCache() is added to a query.
    // - 'all': All queries are cached globally.
    // The default behavior is 'explicit'.
    strategy(): "explicit" | "all" {
        return "all";
    }

    // This function accepts query and parameters that cached into key param,
    // allowing you to retrieve response values for this query from the cache.
    override async get(key: string): Promise<any[] | undefined> {
        try {
            const res = await this.kv.get(key);
            if (res) {
                console.log(`🎯 Cache HIT for key: ${key}`);
                return JSON.parse(res);
            } else {
                console.log(`❌ Cache MISS for key: ${key}`);
                return undefined;
            }
        } catch (error) {
            console.error('Cache get error:', error);
            return undefined;
        }
    }

    // This function accepts several options to define how cached data will be stored:
    // - 'key': A hashed query and parameters.
    // - 'response': An array of values returned by Drizzle from the database.
    // - 'tables': An array of tables involved in the select queries. This information is needed for cache invalidation.
    //
    // For example, if a query uses the "users" and "posts" tables, you can store this information. Later, when the app executes
    // any mutation statements on these tables, you can remove the corresponding key from the cache.
    // If you're okay with eventual consistency for your queries, you can skip this option.
    override async put(
        key: string,
        response: any,
        tables: string[],
        isTag: boolean,
        config?: CacheConfig,
    ): Promise<void> {
        try {
            const ttl = config ? config.ex : this.globalTtl;
            await this.kv.put(key, JSON.stringify(response), { expirationTtl: ttl });

            console.log(`💾 Cache PUT - Key: ${key}, Tables: [${tables.join(', ')}], TTL: ${ttl}s`);

            // Track which tables this key belongs to for invalidation
            for (const table of tables) {
                await this.addTableKey(table, key);
            }
        } catch (error) {
            console.error('Cache put error:', error);
        }
    }

    // This function is called when insert, update, or delete statements are executed.
    // You can either skip this step or invalidate queries that used the affected tables.
    //
    // The function receives an object with two keys:
    // - 'tags': Used for queries labeled with a specific tag, allowing you to invalidate by that tag.
    // - 'tables': The actual tables affected by the insert, update, or delete statements,
    //   helping you track which tables have changed since the last cache update.
    override async onMutate(params: {
        tags: string | string[];
        tables: string | string[] | Table<any> | Table<any>[];
    }): Promise<void> {
        try {
            const tagsArray = params.tags
                ? Array.isArray(params.tags)
                    ? params.tags
                    : [params.tags]
                : [];
            const tablesArray = params.tables
                ? Array.isArray(params.tables)
                    ? params.tables
                    : [params.tables]
                : [];

            const keysToDelete = new Set<string>();
            const affectedTableNames: string[] = [];

            // Collect all keys that need to be deleted based on affected tables
            for (const table of tablesArray) {
                const tableName = is(table, Table)
                    ? getTableName(table)
                    : (table as string);
                affectedTableNames.push(tableName);
                const keys = await this.getTableKeys(tableName);
                for (const key of keys) {
                    keysToDelete.add(key);
                }
            }

            console.log(`🗑️  Cache INVALIDATION - Tables: [${affectedTableNames.join(', ')}], Keys to delete: ${keysToDelete.size}, Tags: [${tagsArray.join(', ')}]`);

            // Delete tagged queries
            for (const tag of tagsArray) {
                await this.kv.delete(tag);
            }

            // Delete cache entries and update tracking
            for (const key of keysToDelete) {
                await this.kv.delete(key);
            }

            // Remove deleted keys from tracking for each affected table
            for (const table of tablesArray) {
                const tableName = is(table, Table)
                    ? getTableName(table)
                    : (table as string);
                await this.removeTableKeys(tableName, keysToDelete);
            }

            if (keysToDelete.size > 0 || tagsArray.length > 0) {
                console.log(`✅ Cache invalidation completed - Deleted ${keysToDelete.size} cache entries`);
            }
        } catch (error) {
            console.error('Cache invalidation error:', error);
        }
    }
}
