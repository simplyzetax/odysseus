import { getDB } from "@core/db/client";
import { Account, ACCOUNTS } from "@core/db/schemas/account";
import { odysseus } from "@core/error";
import { GRANT_TYPES, JWT } from "@utils/auth/jwt";
import { eq } from "drizzle-orm";
import { Context } from "hono";
import { createMiddleware } from "hono/factory";

export const accountMiddleware = createMiddleware(async (c: Context<{ Bindings: Env, Variables: { account: Account } }>, next) => {

    const Authorization = c.req.header("Authorization");
    if (!Authorization || !Authorization.startsWith("Bearer ")) {
        return c.sendError(odysseus.authentication.invalidHeader.withMessage("Missing or invalid Authorization header"));
    }

    const token = Authorization.split(" ")[1];
    if (!token) {
        return c.sendError(odysseus.authentication.invalidHeader.withMessage("Missing token in Authorization header"));
    }

    const verifiedToken = await JWT.verifyToken(token);
    if (!verifiedToken || !verifiedToken.sub || verifiedToken.am !== GRANT_TYPES.client_credentials) {
        return c.sendError(odysseus.authentication.invalidToken.withMessage("Invalid or expired token"));
    }

    const db = getDB(c);

    const [account] = await db.select().from(ACCOUNTS).where(eq(ACCOUNTS.id, verifiedToken.sub));
    if (!account) {
        return c.sendError(odysseus.authentication.authenticationFailed.withMessage(`Account with ID ${verifiedToken.sub} not found`));
    }

    c.set("account", account);

    await next();
});