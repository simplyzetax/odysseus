import { app } from "@core/app";
import { odysseus } from "@core/error";
import { CacheDurableObject } from "@utils/cache/do-sql-cache";

app.delete("/cache", async (c) => {

    const colo = String(c.req.raw.cf?.colo);
    if (!colo) {
        return c.sendError(odysseus.basic.badRequest.withMessage("Missing Cloudflare colo"));
    }

    const cacheId = c.env.CACHE_DO.idFromName(colo);
    const cacheInstance = c.env.CACHE_DO.get(cacheId) as DurableObjectStub<CacheDurableObject>;

    await cacheInstance.emptyCache();

    return c.json({
        deleted: true,
        colo,
    });

});