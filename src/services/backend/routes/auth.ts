import { app } from "@core/app";
import { getDB } from "@core/db/client";
import { Account, ACCOUNTS } from "@core/db/schemas/account";
import { odysseus } from "@core/error";
import { acidMiddleware } from "@middleware/auth/accountIdMiddleware";
import { ratelimitMiddleware } from "@middleware/core/rateLimitMiddleware";
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

            /*const DecodedExchangeCode = await JWT.verifyToken(body.exchange_code);
            if (!DecodedExchangeCode || !DecodedExchangeCode.sub || !DecodedExchangeCode.iai) {
                return c.sendError(odysseus.authentication.invalidToken.withMessage("Invalid exchange code"));
            }*/

            const db = getDB(c as any);

            [account] = await db.select().from(ACCOUNTS).where(eq(ACCOUNTS.id, "b28cc89d-6af0-497d-87e0-58c895be4f73"));
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


app.get("/account/api/oauth/verify", acidMiddleware, async (c) => {
    // Token is already verified by acidMiddleware, get the decoded token
    const decodedToken = await JWT.verifyToken(c.var.token);
    if (!decodedToken || !decodedToken.sub) {
        return c.sendError(odysseus.authentication.invalidToken.withMessage("Invalid or expired token"));
    }

    const [account] = await getDB(c).select({
        displayName: ACCOUNTS.displayName,
    }).from(ACCOUNTS).where(eq(ACCOUNTS.id, decodedToken.sub));

    if (!account) {
        return c.sendError(odysseus.authentication.authenticationFailed.withMessage(`Account with ID ${decodedToken.sub} not found`));
    }

    // Calculate expiration time properly
    const creationDate = new Date(decodedToken.creation_date as string);
    const hoursExpire = decodedToken.hours_expire as number;
    const expiresAt = JWT.DateAddHours(creationDate, hoursExpire);
    const expiresIn = Math.max(0, Math.round((expiresAt.getTime() - Date.now()) / 1000));

    return c.json({
        token: c.var.token,
        session_id: decodedToken.jti,
        token_type: "bearer",
        client_id: decodedToken.clid,
        internal_client: true,
        client_service: "fortnite",
        account_id: c.var.accountId,
        expires_in: expiresIn,
        expires_at: expiresAt.toISOString(),
        auth_method: decodedToken.am,
        display_name: account.displayName,
        app: "fortnite",
        in_app_id: c.var.accountId,
        device_id: decodedToken.dvid
    });
});

app.delete("/account/api/oauth/sessions/kill", (c) => {
    return c.sendStatus(204);
});

app.delete("/account/api/oauth/sessions/kill/:token", (c) => {
    const token = c.req.param("token");
    if (!token) {
        return c.sendError(odysseus.authentication.invalidHeader.withMessage("Missing token parameter"));
    }
    // I would invalidate the token in your database or cache but we are not
    // storing tokens in the db atm, so we just return 204
    return c.sendStatus(204);
});

app.post("/auth/v1/oauth/token", async (c) => {
    return c.json({
        access_token: nanoid(32),
        token_type: "bearer",
        expires_at: "9999-12-31T23:59:59.999Z",
        features: [
            "AntiCheat",
            "Connect",
            "Ecom"
        ],
        organization_id: "org-fn",
        product_id: "prod-fn",
        sandbox_id: "fn",
        deployment_id: "fn",
        expires_in: 3599
    });
})

app.post("/epic/oauth/v2/token", ratelimitMiddleware({
    capacity: 10,
    refillRate: 2,
    initialTokens: 10,
}), validator('form', (value, c) => {
    const refreshTokenSchema = z.object({
        refresh_token: z.string().min(1, "Refresh token is required"),
        scope: z.string().optional()
    });

    const result = refreshTokenSchema.safeParse(value);
    if (!result.success) {
        return c.sendError(odysseus.authentication.invalidRequest.withMessage("Refresh token is required"));
    }
    return result.data;
}), async (c) => {
    const body = c.req.valid('form');

    // Parse Authorization header
    const Authorization = c.req.header("Authorization");
    if (!Authorization) {
        return c.sendError(odysseus.authentication.invalidHeader.withMessage("Authorization header may be invalid or not present, please verify that you are sending the correct headers"));
    }

    if (!Authorization.toLowerCase().startsWith('basic')) {
        return c.sendError(odysseus.authentication.invalidHeader.withMessage("Authorization header may be invalid or not present, please verify that you are sending the correct headers"));
    }

    let clientId: string;
    try {
        const [id, secret] = atob(Authorization.slice(6)).split(':');
        if (!id || !secret) {
            throw new Error("Invalid client credentials");
        }
        clientId = id;
    } catch {
        return c.sendError(odysseus.authentication.invalidHeader.withMessage("Authorization header may be invalid or not present, please verify that you are sending the correct headers"));
    }

    // Validate client ID
    if (!isValidClientId(clientId)) {
        return c.sendError(odysseus.authentication.invalidHeader.withMessage("Authorization header may be invalid or not present, please verify that you are sending the correct headers"));
    }

    // Process refresh token
    let refreshToken = body.refresh_token;

    // Remove "eg1~" prefix if present
    const cleanRefreshToken = refreshToken.startsWith("eg1~") ? refreshToken.slice(4) : refreshToken;

    try {
        // Verify the refresh token
        const decodedRefreshToken = await JWT.verifyToken(cleanRefreshToken);
        if (!decodedRefreshToken || !decodedRefreshToken.sub || decodedRefreshToken.t !== "r") {
            throw new Error("Invalid refresh token");
        }

        // Check if token is expired (JWT library should handle this, but double-check)
        const creationDate = new Date(decodedRefreshToken.creation_date as string);
        const hoursExpire = decodedRefreshToken.hours_expire as number;
        const expiresAt = JWT.DateAddHours(creationDate, hoursExpire);

        if (expiresAt.getTime() <= Date.now()) {
            throw new Error("Expired refresh token");
        }

        // Get account information
        const db = getDB(c);
        const [account] = await db.select().from(ACCOUNTS).where(eq(ACCOUNTS.id, decodedRefreshToken.sub));

        if (!account) {
            throw new Error("Account not found");
        }

        if (account.banned) {
            throw new Error("Account is banned");
        }

        // Generate new tokens
        const deviceId = (decodedRefreshToken.dvid as string) || nanoid(8);
        const expiresInAccess = 2; // 2 hours for Epic OAuth v2
        const expiresInRefresh = 8; // 8 hours for refresh token

        const [newAccessToken, newRefreshToken] = await Promise.all([
            JWT.createAccessToken(account as Account, clientId, "refresh_token", deviceId, expiresInAccess),
            JWT.createRefreshToken(account as Account, clientId, "refresh_token", expiresInRefresh, deviceId)
        ]);

        const now = new Date();
        const accessExpiresAt = JWT.DateAddHours(now, expiresInAccess);
        const refreshExpiresAt = JWT.DateAddHours(now, expiresInRefresh);

        return c.json({
            scope: body.scope || "basic_profile friends_list openid presence",
            token_type: "bearer",
            access_token: newAccessToken,
            refresh_token: newRefreshToken,
            id_token: newAccessToken, // Using access token as ID token for simplicity
            expires_in: expiresInAccess * 3600,
            expires_at: accessExpiresAt.toISOString(),
            refresh_expires_in: expiresInRefresh * 3600,
            refresh_expires_at: refreshExpiresAt.toISOString(),
            account_id: account.id,
            client_id: clientId,
            application_id: clientId,
            selected_account_id: account.id,
            merged_accounts: []
        });

    } catch (error) {
        // Handle invalid/expired refresh token
        console.error('Refresh token error:', error);
        return c.sendError(odysseus.authentication.oauth.invalidRefresh.withMessage(`Sorry the refresh token '${refreshToken}' is invalid`));
    }
});