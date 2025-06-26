import { app } from "@core/app";
import { odysseus } from "@core/error";
import { devAuthMiddleware } from "@middleware/auth/devAuthMiddleware";
import { getSignedCookie, setSignedCookie } from "hono/cookie";
import { validator } from "hono/validator";
import { nanoid } from "nanoid";
import { z } from "zod";

app.delete("/cache", async (c) => {
    const queryColoParam = c.req.query('colo');
    let colo: string;
    let cacheIdentifier: string | undefined;

    if (queryColoParam) {
        colo = queryColoParam;
    } else {
        cacheIdentifier = (await getSignedCookie(c, c.env.JWT_SECRET, "cacheIdentifier")) || undefined;
        if (!cacheIdentifier) {
            return c.sendError(odysseus.basic.badRequest.withMessage("Missing cache identifier or colo parameter"));
        }
        colo = cacheIdentifier.split("-")[0];
    }

    const cacheId = c.env.CACHE_DO.idFromName(colo);
    const cacheInstance = c.env.CACHE_DO.get(cacheId);

    if (queryColoParam) {
        // Clear all cache for the colo
        await cacheInstance.emptyCache();
    } else {
        // Clear cache for specific identifier
        await cacheInstance.emptyCacheForIdentifier(cacheIdentifier!);
    }

    return c.json({
        message: queryColoParam ? "All cache cleared for colo" : "Cache cleared for identifier",
        colo,
        ...(cacheIdentifier && { cacheIdentifier })
    });

});

const coloSchema = z.object({
    colo: z.string(),
});

app.put("/cache/colo", devAuthMiddleware, validator('json', (value, c) => {
    const result = coloSchema.safeParse(value);
    if (!result.success) {
        return c.sendError(odysseus.authentication.oauth.invalidBody);
    }
    return result.data;
}), async (c) => {

    const { colo } = c.req.valid('json');

    const cacheIdentifier = `${colo}-${nanoid()}`;

    await setSignedCookie(c, "cacheIdentifier", cacheIdentifier, c.env.JWT_SECRET);

    return c.json({
        message: "Cache identifier set",
        colo,
        cacheIdentifier
    });
})

app.get("/cache/stats", devAuthMiddleware, async (c) => {
    const queryColoParam = c.req.query('colo');
    let colo: string;

    if (queryColoParam) {
        colo = queryColoParam;
    } else {
        const cacheIdentifier = await getSignedCookie(c, c.env.JWT_SECRET, "cacheIdentifier");
        if (!cacheIdentifier) {
            return c.sendError(odysseus.basic.badRequest.withMessage("Missing cache identifier or colo parameter"));
        }
        colo = cacheIdentifier.split("-")[0];
    }

    const cacheId = c.env.CACHE_DO.idFromName(colo);
    const cacheInstance = c.env.CACHE_DO.get(cacheId);

    const cacheStats = await cacheInstance.getCacheStats();

    return c.json({
        message: "Cache stats",
        colo,
        cacheStats
    });
});

app.get("/cache/entries", devAuthMiddleware, async (c) => {
    const queryColoParam = c.req.query('colo');
    let colo: string;

    if (queryColoParam) {
        colo = queryColoParam;
    } else {
        const cacheIdentifier = await getSignedCookie(c, c.env.JWT_SECRET, "cacheIdentifier");
        if (!cacheIdentifier) {
            return c.sendError(odysseus.basic.badRequest.withMessage("Missing cache identifier or colo parameter"));
        }
        colo = cacheIdentifier.split("-")[0];
    }

    const cacheId = c.env.CACHE_DO.idFromName(colo);
    const cacheInstance = c.env.CACHE_DO.get(cacheId);

    const cacheEntries = await cacheInstance.getCacheEntries(100);

    return c.json({
        message: "Cache entries",
        colo,
        cacheEntries
    });
});

app.delete("/cache/all", devAuthMiddleware, async (c) => {

    const colos = ['DFW', 'LAX', 'CDG', 'LHR', 'NRT', 'SYD', 'GRU', 'BOM', 'JFK', 'IAD', 'SJC', 'FRA', 'AMS', 'MAD', 'MIA'];

    const results = [];

    for (const colo of colos) {
        try {
            const cacheId = c.env.CACHE_DO.idFromName(colo);
            const cacheInstance = c.env.CACHE_DO.get(cacheId);
            
            const deletedCount = await cacheInstance.emptyCache();
            
            results.push({
                colo,
                success: true,
                deletedCount
            });
        } catch (error) {
            results.push({
                colo,
                success: false,
                error: error instanceof Error ? error.message : 'Unknown error'
            });
        }
    }

    const successCount = results.filter(r => r.success).length;
    const totalDeleted = results.filter(r => r.success).reduce((sum, r) => sum + (r.deletedCount || 0), 0);

    return c.json({
        message: `Cache cleared for ${successCount}/${colos.length} colos`,
        totalDeleted,
        results
    });
});