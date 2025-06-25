import { odysseus } from "@core/error";
import { Context } from "hono";
import { getCookie, setCookie } from "hono/cookie";
import { createMiddleware } from "hono/factory";

/**
 * Middleware that adds MCP (Model Context Protocol) correction data to JSON responses
 * Adds profile revision information based on the request's revision number
 */
export const persistentDoMiddleware = createMiddleware(async (c: Context<{ Bindings: Env, Variables: { cacheRegion: string } }>, next) => {

    let doName = getCookie(c, "cacheRegion");
    if (!doName) {
        const colo = String(c.req.raw.cf?.colo);
        if (!colo) {
            return c.sendError(odysseus.basic.badRequest.withMessage("Missing Cloudflare colo"));
        }

        doName = colo;
        setCookie(c, "cacheRegion", doName);
    }

    c.set("cacheRegion", doName);

    await next();
});