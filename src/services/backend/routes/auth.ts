import { app } from "@core/app";
import { odysseus } from "@core/error";
import { ClientId, CLIENTS } from "@utils/auth/clients";
import { GRANT_TYPES, JWT } from "@utils/auth/jwt";
import { validator } from "hono/validator";
import z from "zod/v4";

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

app.post("/account/api/oauth/token", validator('form', (value, c) => {
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

    if (!CLIENTS[clientId as ClientId]) {
        return c.sendError(odysseus.authentication.invalidHeader.withMessage("Unknown client ID"));
    }

    if (CLIENTS[clientId as ClientId].secret !== clientSecret) {
        return c.sendError(odysseus.authentication.invalidHeader.withMessage("Invalid client secret"));
    }

    const am = body.grant_type;

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
        default: {
            return c.sendError(odysseus.authentication.oauth.grantNotImplemented.withMessage("Unsupported grant type"));
        }
    }

});