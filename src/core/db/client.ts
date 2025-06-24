import { CloudflareKVDrizzleCache } from "@utils/caches/drizzle-workers-kv-cache";
import { drizzle } from "drizzle-orm/postgres-js";
import { Context } from "hono";
import { CloudflareDurableObjectRPCDrizzleCache } from "../../utils/caches/drizzle-workers-do-cache";
import { odysseus } from "@core/error";

export const getDB = (c: Context<{ Bindings: Env }>) => {

    const colo = String(c.req.raw.cf?.colo);
    if (!colo) {
        odysseus.internal.serverError.withMessage("No colo information available in request context").throwHttpException();
    }

    console.log(`Using colo: ${colo} for Durable Object cache`);

    // Get the Durable Object namespace from the Cloudflare environment
    const durableObjectCache = new CloudflareDurableObjectRPCDrizzleCache(c.env.CACHE_DO, colo);

    return drizzle(c.env.DB.connectionString, {
        cache: durableObjectCache
    });
}

// Legacy function for KV cache (keep for rollback if needed)
export const getDBWithKVCache = (c: Context<{ Bindings: Env }>) => {
    // Get the KV namespace from the Cloudflare environment
    const kvCache = new CloudflareKVDrizzleCache(c.env.kv);

    return drizzle(c.env.DB.connectionString, {
        cache: kvCache
    });
}
