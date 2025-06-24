import { CloudflareKVDrizzleCache } from "@utils/drizzle-cache";
import { drizzle } from "drizzle-orm/postgres-js";
import { Context } from "hono";

export const getDB = (c: Context<{ Bindings: Env }>) => {
    // Get the KV namespace from the Cloudflare environment
    const kvCache = new CloudflareKVDrizzleCache(c.env.kv);

    return drizzle(c.env.DB.connectionString, {
        cache: kvCache
    });
}