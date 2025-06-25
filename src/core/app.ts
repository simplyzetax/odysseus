import { persistentDoMiddleware } from "@middleware/core/cacheIdentifierMiddleware";
import { responseEnhancementsMiddleware } from "@middleware/core/remMiddleware";
import { mcpCorrectionMiddleware } from "@middleware/game/mcp-correction";
import type { CacheDurableObject } from "@utils/cache/durableobjects/cacheDurableObject";
import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";

import { logger } from "hono/logger";
import { odysseus } from "./error";

interface Bindings extends Omit<Env, 'CACHE_DO'> {
    CACHE_DO: DurableObjectNamespace<CacheDurableObject>;
}

const app = new Hono<{ Bindings: Bindings }>();

app.use(logger())
app.use(persistentDoMiddleware);
app.use(responseEnhancementsMiddleware);
app.use('/fortnite/api/game/v2/profile/*', mcpCorrectionMiddleware)

app.onError((err, c) => {
    if (err instanceof HTTPException) {
        return err.getResponse()
    } else if (err instanceof Error) {
        return c.sendError(odysseus.internal.serverError.withMessage(err.message))
    }
    return c.sendError(odysseus.internal.serverError.withMessage('An unknown error occurred'))
})

app.notFound((c) => c.sendError(odysseus.basic.notFound));


export { app };