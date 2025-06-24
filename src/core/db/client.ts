import { CloudflareKVDrizzleCache } from "@utils/drizzle-cache";
import { drizzle } from "drizzle-orm/postgres-js";

export const db = (c: HonoContext) => {
    // Get the KV namespace from the Cloudflare environment
    const kvCache = new CloudflareKVDrizzleCache(c.env.odysseus);

    return drizzle(c.env.DB.connectionString, {
        cache: kvCache
    });
}