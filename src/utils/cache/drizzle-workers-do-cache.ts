import { Cache } from "drizzle-orm/cache/core";
import { is, Table, getTableName } from "drizzle-orm";
import { CacheConfig } from "drizzle-orm/cache/core/types";
import { CacheDurableObject } from "./cache-durable-object";

export class CloudflareDurableObjectRPCDrizzleCache extends Cache {
    private globalTtl: number = 1000;
    private durableObject: DurableObjectStub;

    constructor(durableObjectNamespace: DurableObjectNamespace, cacheName = "drizzle-cache") {
        super();
        // Use a consistent ID for the cache instance
        const durableObjectId = durableObjectNamespace.idFromName(cacheName);
        this.durableObject = durableObjectNamespace.get(durableObjectId);
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
            // Use RPC call instead of fetch
            const result = await (this.durableObject as any).getCacheEntry(key);
            return result || undefined;
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
            const ttl = config?.ex ?? this.globalTtl;

            // Use RPC call instead of fetch
            await (this.durableObject as any).putCacheEntry(
                key,
                JSON.stringify(response),
                tables,
                ttl
            );

            console.log(`💾 Cache PUT - Key: ${key}, Tables: [${tables.join(', ')}], TTL: ${ttl}s`);
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

            const affectedTableNames: string[] = [];

            // Process table names
            for (const table of tablesArray) {
                const tableName = is(table, Table)
                    ? getTableName(table)
                    : (table as string);
                affectedTableNames.push(tableName);
            }

            console.log(`🗑️  Cache INVALIDATION - Tables: [${affectedTableNames.join(', ')}], Tags: [${tagsArray.join(', ')}]`);

            // Use RPC calls for invalidation
            if (tagsArray.length > 0) {
                await (this.durableObject as any).invalidateByTags(tagsArray);
            }

            if (affectedTableNames.length > 0) {
                const deletedCount = await (this.durableObject as any).invalidateByTables(affectedTableNames);
                console.log(`✅ Cache invalidation completed - Deleted ${deletedCount} cache entries`);
            }
        } catch (error) {
            console.error('Cache invalidation error:', error);
        }
    }

    // Additional utility methods
    async getCacheStats(): Promise<{ totalEntries: number; expiredEntries: number }> {
        try {
            return await (this.durableObject as any).getCacheStats();
        } catch (error) {
            console.error('Cache stats error:', error);
            return { totalEntries: 0, expiredEntries: 0 };
        }
    }

    async cleanup(): Promise<void> {
        try {
            await (this.durableObject as any).cleanupExpiredEntries();
        } catch (error) {
            console.error('Cache cleanup error:', error);
        }
    }
}
