import { drizzle } from "drizzle-orm/postgres-js";
import { Context } from "hono";
import { CloudflareDurableObjectRPCDrizzleCache } from "../../utils/cache/drizzleCache";
import { odysseus } from "@core/error";

export const getDB = (c: Context<{ Bindings: Env, Variables: { cacheIdentifier: string } }> | Context<any, any, any>) => {

    const colo = String(c.req.raw.cf?.colo);
    if (!colo) {
        odysseus.internal.serverError.withMessage("No colo information available in request context").throwHttpException();
    }

    // Get the Durable Object namespace from the Cloudflare environment
    const durableObjectCache = new CloudflareDurableObjectRPCDrizzleCache(c.env.CACHE_DO, colo, c.var.cacheIdentifier);

    return drizzle(c.env.DB.connectionString, {
        cache: durableObjectCache
    });
}