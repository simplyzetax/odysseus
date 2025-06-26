import { odysseus } from "@core/error";
import type { Context } from "hono";
import { createMiddleware } from "hono/factory";

export const devAuthMiddleware = createMiddleware(async (c: Context<{ Bindings: Env }>, next) => {

    const Authorization = c.req.header("Authorization");
    if (!Authorization?.startsWith("Bearer ")) {
        return c.sendError(odysseus.authentication.invalidHeader.withMessage("Missing or invalid Authorization header"));
    }

    const token = Authorization.split(" ")[1];
    if (!token) {
        return c.sendError(odysseus.authentication.invalidHeader.withMessage("Missing token in Authorization header"));
    }

    if(token !== c.env.DEV_AUTH_TOKEN) {
        return c.sendError(odysseus.authentication.invalidToken.withMessage("Invalid or expired dev token"));
    }

    await next();
});