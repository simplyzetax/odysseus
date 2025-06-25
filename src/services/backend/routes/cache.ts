import { app } from "@core/app";
import { odysseus } from "@core/error";
import { CacheDurableObject } from "@utils/cache/durableobjects/cacheDurableObject";
import { getSignedCookie } from "hono/cookie";

app.delete("/cache", async (c) => {

    const cacheIdentifier = await getSignedCookie(c, c.env.JWT_SECRET, "cacheIdentifier");
    if (!cacheIdentifier) {
        return c.sendError(odysseus.basic.badRequest.withMessage("Missing cache identifier"));
    }

    const colo = cacheIdentifier.split("-")[0];

    const cacheId = c.env.CACHE_DO.idFromName(colo);
    const cacheInstance = c.env.CACHE_DO.get(cacheId);

    await cacheInstance.emptyCacheForIdentifier(cacheIdentifier);

    return c.json({
        message: "Cache cleared",
        colo,
        cacheIdentifier
    });

});