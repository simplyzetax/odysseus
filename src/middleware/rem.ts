import { StatusCode } from "hono/utils/http-status";
import { nanoid } from "nanoid";
import { ApiError } from "../core/error";
import { createMiddleware } from "hono/factory";
import { HonoContext } from "../types/context";

export type Flags = {
    skipMcpCorrection: boolean;
}

const defaultFlags: Flags = {
    skipMcpCorrection: false,
};

export const responseEnhancementsMiddleware = createMiddleware(async (c: HonoContext, next) => {
    c.sendError = (error: ApiError): Response => {
        const requestPath = new URL(c.req.url).pathname;
        error.response.originatingService = requestPath;
        c.status(error.statusCode as StatusCode);
        return c.json(error.response);
    };

    c.sendIni = (ini: string): Response => {
        return new Response(ini, {
            status: 200,
            headers: {
                'Content-Type': 'application/octet-stream',
            }
        });
    };

    c.sendStatus = (statusCode: number): Response => {
        c.status(statusCode as StatusCode);
        return c.body(null);
    };

    c.id = nanoid();

    await next();
});