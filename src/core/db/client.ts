import { odysseus } from "@core/error";
import { drizzle } from "drizzle-orm/postgres-js";
import type { Context } from "hono";
import { CloudflareDurableObjectRPCDrizzleCache } from "../../utils/cache/drizzleCache";
import { env } from "cloudflare:workers";

export const getDB = (c: Context<{ Bindings: Env, Variables: { cacheIdentifier: string } }> | Context<any, any, any>) => {

    const colo = String(c.req.raw.cf?.colo);
    if (!colo) {
        odysseus.internal.serverError.withMessage("No colo information available in request context").throwHttpException();
    }

    // Get the Durable Object namespace from the Cloudflare environment
    const durableObjectCache = new CloudflareDurableObjectRPCDrizzleCache(c.env.CACHE_DO, colo, c.var.cacheIdentifier);

    //TODO: Replace with hyperdrive in prod
    return drizzle(env.DB.connectionString, {
        cache: durableObjectCache,
        logger: {
            logQuery: (query, params) => {
                console.log(query, params);
            }
        }
    });
}