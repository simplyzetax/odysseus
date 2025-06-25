import { app } from "@core/app";
import { getDB } from "@core/db/client";
import { Account, ACCOUNTS } from "@core/db/schemas/account";
import { odysseus } from "@core/error";
import { ratelimitMiddleware } from "@middleware/core/ratelimit";
import { ClientId, CLIENTS, isValidClientId } from "@utils/auth/clients";
import { GRANT_TYPES, JWT } from "@utils/auth/jwt";
import { eq } from "drizzle-orm";
import { validator } from "hono/validator";
import { nanoid } from "nanoid";
import z from "zod";

const oauthSchema = z.object({
    grant_type: z.enum([GRANT_TYPES.client_credentials, GRANT_TYPES.refresh, GRANT_TYPES.exchange, GRANT_TYPES.password]),
    exchange_code: z.string().optional(),
    refresh_token: z.string().optional(),
    username: z.string().optional(),
    password: z.string().optional(),
}).refine(
    ({ grant_type, exchange_code, refresh_token, username, password }) => {
        switch (grant_type) {
            case GRANT_TYPES.exchange:
                return !!exchange_code;
            case GRANT_TYPES.refresh:
                return !!refresh_token;
            case GRANT_TYPES.password:
                if (!username || !password) return false;
            default:
                return true;
        }
    },
    "Missing required fields for grant type"
);

app.post("/account/api/oauth/token", ratelimitMiddleware({
    capacity: 5,
    refillRate: 1,
    initialTokens: 5,
}), validator('form', (value, c) => {
    const result = oauthSchema.safeParse(value);
    if (!result.success) {
        return c.sendError(odysseus.authentication.oauth.invalidBody);
    }
    return result.data;
}), async (c) => {

    const body = c.req.valid('form');

    const Authorization = c.req.header("Authorization");
    if (!Authorization) {
        return c.sendError(odysseus.authentication.invalidHeader.withMessage("Missing or invalid Authorization header"));
    }

    if (!Authorization.toLowerCase().startsWith('basic')) {
        return c.sendError(odysseus.authentication.invalidHeader.withMessage("Invalid Authorization header format"));
    }

    const [clientId, clientSecret] = atob(Authorization.slice(6)).split(':');
    if (!clientId || !clientSecret) {
        return c.sendError(odysseus.authentication.invalidHeader.withMessage("Invalid client credentials"));
    }

    if (isValidClientId(clientId) === false) {
        return c.sendError(odysseus.authentication.invalidHeader.withMessage("Invalid client ID"));
    }

    if (CLIENTS[clientId as ClientId].secret !== clientSecret) {
        return c.sendError(odysseus.authentication.invalidHeader.withMessage("Invalid client secret"));
    }

    const am = body.grant_type;

    let account: Account | undefined;

    switch (am) {
        case GRANT_TYPES.client_credentials: {
            const token = await JWT.createClientToken(clientId as ClientId, am, 24);
            const decodedClient = await JWT.verifyToken(token);
            if (!decodedClient || decodedClient.clid !== clientId || decodedClient.am !== am) {
                return c.sendError(odysseus.authentication.invalidToken.withMessage("Invalid client token"));
            }

            return c.json({
                access_token: token,
                expires_in: Math.round(((JWT.DateAddHours(new Date(decodedClient.creation_date as string), decodedClient.hours_expire as number).getTime()) - (new Date().getTime())) / 1000),
                expires_at: JWT.DateAddHours(new Date(decodedClient.creation_date as string), decodedClient.hours_expire as number).toISOString(),
                token_type: "bearer",
                client_id: clientId,
                internal_client: true,
                client_service: "fortnite"
            })
        }
        case GRANT_TYPES.exchange: {
            if (!body.exchange_code) {
                return c.sendError(odysseus.authentication.oauth.invalidExchange.withMessage("Missing exchange code"));
            }

            const DecodedExchangeCode = await JWT.verifyToken(body.exchange_code);
            if (!DecodedExchangeCode || !DecodedExchangeCode.sub || !DecodedExchangeCode.iai) {
                return c.sendError(odysseus.authentication.invalidToken.withMessage("Invalid exchange code"));
            }

            const db = getDB(c);

            [account] = await db.select().from(ACCOUNTS).where(eq(ACCOUNTS.id, DecodedExchangeCode.sub));
            break;
        }
        default: {
            return c.sendError(odysseus.authentication.oauth.grantNotImplemented.withMessage("Unsupported grant type"));
        }
    }

    if (!account) {
        return c.sendError(odysseus.authentication.authenticationFailed.withMessage("Account not found for the provided grant type"));
    }

    if (account.banned) {
        return c.sendError(odysseus.account.disabledAccount);
    }

    const deviceId = nanoid(8);
    const expiresInAccess = 8; // hours
    const expiresInRefresh = 24; // hours

    const [accessToken, refreshToken] = await Promise.all([
        JWT.createAccessToken(account, clientId, am, deviceId, expiresInAccess),
        JWT.createRefreshToken(account, clientId, am, expiresInRefresh, deviceId)
    ]);

    const now = new Date();
    const accessExpiresAt = JWT.DateAddHours(now, expiresInAccess);
    const refreshExpiresAt = JWT.DateAddHours(now, expiresInRefresh);

    return c.json({
        access_token: accessToken,
        expires_in: expiresInAccess * 3600, // Convert hours to seconds
        expires_at: accessExpiresAt.toISOString(),
        token_type: "bearer",
        refresh_token: refreshToken,
        refresh_expires: expiresInRefresh * 3600, // Convert hours to seconds
        refresh_expires_at: refreshExpiresAt.toISOString(),
        account_id: account.id,
        client_id: clientId,
        internal_client: true,
        client_service: "fortnite",
        displayName: account.id,
        app: "fortnite",
        in_app_id: account.id,
        device_id: deviceId
    })

});