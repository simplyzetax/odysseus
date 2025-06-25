import { odysseus } from "@core/error";
import { Context } from "hono";
import { getCookie, getSignedCookie, setCookie, setSignedCookie } from "hono/cookie";
import { createMiddleware } from "hono/factory";
import { nanoid } from "nanoid";

/**
 * Middleware that adds MCP (Model Context Protocol) correction data to JSON responses
 * Adds profile revision information based on the request's revision number
 */
export const persistentDoMiddleware = createMiddleware(async (c: Context<{ Bindings: Env, Variables: { cacheIdentifier: string } }>, next) => {

    let cacheIdentifier = await getSignedCookie(c, c.env.JWT_SECRET, "cacheIdentifier");
    if (!cacheIdentifier) {
        const colo = String(c.req.raw.cf?.colo);
        if (!colo) {
            return c.sendError(odysseus.basic.badRequest.withMessage("Missing Cloudflare colo"));
        }

        cacheIdentifier = `${colo}-${nanoid()}`;
        await setSignedCookie(c, "cacheIdentifier", cacheIdentifier, c.env.JWT_SECRET);
    }

    c.set("cacheIdentifier", cacheIdentifier);

    await next();
});