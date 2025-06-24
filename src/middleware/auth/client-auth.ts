import { odysseus } from "@core/error";
import { GRANT_TYPES, JWT } from "@utils/jwt";
import { createMiddleware } from "hono/factory";

/**
 * Middleware that adds MCP (Model Context Protocol) correction data to JSON responses
 * Adds profile revision information based on the request's revision number
 */
export const clientTokenMiddleware = createMiddleware(async (c: HonoContext, next) => {

    const Authorization = c.req.header("Authorization");
    if (!Authorization || !Authorization.startsWith("Bearer ")) {
        return c.sendError(odysseus.authentication.invalidHeader.withMessage("Missing or invalid Authorization header"));
    }

    const token = Authorization.split(" ")[1];
    if (!token) {
        return c.sendError(odysseus.authentication.invalidHeader.withMessage("Missing token in Authorization header"));
    }

    const verifiedToken = await JWT.verifyToken(token);
    if (!verifiedToken || verifiedToken.am !== GRANT_TYPES.client_credentials) {
        return c.sendError(odysseus.authentication.invalidToken.withMessage("Invalid or expired client token"));
    }

    await next();
});