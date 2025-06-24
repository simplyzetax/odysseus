# Cloudflare KV Cache Integration with Drizzle ORM

This document explains how to use the integrated Cloudflare KV cache with Drizzle ORM in your Cloudflare Workers project.

## Overview

The `CloudflareKVCache` class extends Drizzle ORM's `Cache` abstract class to provide persistent caching using Cloudflare's KV storage. This implementation offers:

- **Persistent Storage**: Cache survives worker restarts
- **Automatic Invalidation**: Cache is invalidated when related tables are mutated
- **TTL Support**: Configurable time-to-live for cache entries
- **Table-based Invalidation**: Intelligent cache invalidation based on affected tables
- **Error Resilience**: Graceful handling of KV errors without breaking queries

## Configuration

### 1. KV Namespace Setup

Your `wrangler.jsonc` already includes the KV namespace binding:

```jsonc
"kv_namespaces": [
  {
    "binding": "odysseus",
    "id": "148ab769ecc34b5f96ac6a9f38a946be"
  }
]
```

### 2. Database Client

The cache is automatically integrated in your database client (`src/core/db/client.ts`):

```typescript
import { CloudflareKVCache } from "@utils/drizzle-cache";
import { drizzle } from "drizzle-orm/postgres-js";

export const db = (c: HonoContext) => {
    const kvCache = new CloudflareKVCache(c.env.odysseus);
    return drizzle(c.env.DB.connectionString, { 
        cache: kvCache 
    });
};
```

## Usage

### Automatic Caching

With the `strategy()` method returning `"all"`, all SELECT queries are automatically cached:

```typescript
// This query will be cached automatically
const users = await db(c).select().from(usersTable);

// Second call will read from cache
const cachedUsers = await db(c).select().from(usersTable);
```

### Explicit Caching

You can also use explicit caching with custom options:

```typescript
// Cache with custom TTL (30 seconds)
const users = await db(c)
  .select()
  .from(usersTable)
  .$withCache({ config: { ex: 30 } });

// Cache with custom tag for easy invalidation
const posts = await db(c)
  .select()
  .from(postsTable)
  .$withCache({ tag: "all_posts" });
```

### Cache Invalidation

#### Automatic Invalidation

Cache is automatically invalidated when you perform mutations:

```typescript
// This will automatically invalidate all cached queries that used the usersTable
await db(c).insert(usersTable).values({ 
  name: "John Doe", 
  email: "john@example.com" 
});

// This will also invalidate related cache
await db(c).update(usersTable)
  .set({ name: "Jane Doe" })
  .where(eq(usersTable.id, 1));
```

#### Manual Invalidation

You can manually invalidate cache entries:

```typescript
// Invalidate by table
await db(c).$cache.invalidate({ tables: [usersTable] });

// Invalidate by tag
await db(c).$cache.invalidate({ tags: "all_posts" });

// Invalidate multiple tables and tags
await db(c).$cache.invalidate({ 
  tables: [usersTable, postsTable],
  tags: ["user_data", "post_data"]
});
```

## Advanced Features

### Cache Statistics

Monitor your cache usage:

```typescript
const cache = new CloudflareKVCache(c.env.odysseus);
const stats = await cache.getStats();
console.log(`Total keys: ${stats.totalKeys}, Table mappings: ${stats.tableKeys}`);
```

### Clear All Cache

Useful for development or maintenance:

```typescript
const cache = new CloudflareKVCache(c.env.odysseus);
await cache.clearAll();
```

### Custom TTL Configuration

Configure different TTL values:

```typescript
// Cache for 5 minutes
const users = await db(c)
  .select()
  .from(usersTable)
  .$withCache({ config: { ex: 300 } });

// Cache until specific Unix timestamp
const posts = await db(c)
  .select()
  .from(postsTable)
  .$withCache({ config: { exat: 1735689600 } }); // Jan 1, 2025
```

## Best Practices

### 1. Cache Strategy

- Use automatic caching (`strategy: "all"`) for read-heavy applications
- Use explicit caching for more control over what gets cached
- Consider disabling caching for frequently changing data

### 2. TTL Configuration

- Set appropriate TTL values based on your data freshness requirements
- Use shorter TTL for frequently updated data
- Use longer TTL for relatively static data

### 3. Error Handling

The cache implementation is designed to be resilient:

```typescript
// Cache errors won't break your queries
try {
  const users = await db(c).select().from(usersTable);
  // This will work even if KV is temporarily unavailable
} catch (error) {
  // Only database errors will be thrown, not cache errors
}
```

### 4. Monitoring

Regularly monitor cache performance:

```typescript
// Add this to your health check or monitoring endpoint
app.get("/cache-stats", async (c) => {
  const cache = new CloudflareKVCache(c.env.odysseus);
  const stats = await cache.getStats();
  return c.json(stats);
});
```

## Configuration Options

### CacheConfig Interface

```typescript
interface CacheConfig {
  ex?: number;        // expire time, in seconds
  px?: number;        // expire time, in milliseconds
  exat?: number;      // Unix time (sec) at which the key will expire
  pxat?: number;      // Unix time (ms) at which the key will expire
  keepTtl?: boolean;  // retain existing TTL when updating a key
}
```

### Cache Methods

- `get(key, tables, isTag, isAutoInvalidate)`: Retrieve cached data
- `put(hashedQuery, response, tables, isTag, config)`: Store data in cache
- `onMutate(params)`: Handle cache invalidation on mutations
- `clearAll()`: Clear all cache entries
- `getStats()`: Get cache statistics

## Limitations

1. **KV Limitations**: Subject to Cloudflare KV's rate limits and size restrictions
2. **Eventual Consistency**: KV storage is eventually consistent across edge locations
3. **No Transactions**: Cache operations are not transactional with database operations
4. **Memory Usage**: In-memory table tracking resets on worker restart (handled gracefully)

## Troubleshooting

### Cache Not Working

1. Check KV namespace binding in `wrangler.jsonc`
2. Verify the binding name matches in your environment
3. Check Cloudflare dashboard for KV namespace existence

### Performance Issues

1. Monitor cache hit rates using `getStats()`
2. Adjust TTL values based on your use case
3. Consider using explicit caching for better control

### Cache Invalidation Issues

1. Ensure mutation operations go through the same database client
2. Check that table names are correctly identified
3. Use manual invalidation as a fallback
