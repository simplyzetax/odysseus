import { profileTypes } from '@core/db/schemas/profile';
import { odysseus } from '@core/error';
import { Bindings } from '@otypes/bindings';
import { FortniteProfile } from '@utils/mcp/base-profile';
import { Context } from 'hono';
import { createMiddleware } from 'hono/factory';
import z from 'zod';

export const mcpValidationMiddleware = createMiddleware(
    async (
        c: Context<{
            Bindings: Bindings;
            Variables: { token: string; profileType: z.infer<typeof profileTypes> };
        }>,
        next
    ) => {
        const requestedProfileId = c.req.query("profileId");
        if (!requestedProfileId) {
            return odysseus.mcp.invalidPayload.withMessage("Missing profile ID").toResponse();
        }

        if (!FortniteProfile.isValidProfileType(requestedProfileId)) {
            return odysseus.mcp.invalidPayload.withMessage("Invalid profile ID").toResponse();
        }

        c.set("profileType", requestedProfileId);

        return await next();
    }
);

