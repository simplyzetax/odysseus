import { verifyKey } from "@utils/discord/general";
import type { MiddlewareHandler } from "hono";

export const discordVerificationMiddleware: MiddlewareHandler = async (c, next) => {
    // Only accept POST requests
    if (c.req.method !== 'POST') {
        return c.text('Method not allowed', 405);
    }

    // Get the signature and timestamp from the request headers
    const signature = c.req.header('X-Signature-Ed25519');
    const timestamp = c.req.header('X-Signature-Timestamp');

    if (!signature || !timestamp) {
        return c.text('Unauthorized', 401);
    }

    // Get the request body as text
    const body = await c.req.text();
    // Store in variables for access later
    (c as any).rawBody = body;

    // Verify the request is coming from Discord
    const isValid = verifyKey(
        body,
        signature,
        timestamp,
        c.env.DISCORD_PUBLIC_KEY
    );

    if (!isValid) {
        return c.text('Unauthorized', 401);
    }

    (c as any).timestamp = Date.now();

    await next();
}; 