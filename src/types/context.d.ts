import { Context } from "hono";
import { Flags, Misc } from "../middleware/core/remMiddleware";
import { ApiError } from "@core/error";
import { parseUserAgent } from "@utils/misc/user-agent";

declare module "hono" {
    interface Context {
        sendError: (error: ApiError) => Response;
        sendIni: (ini: string) => Response;
        sendStatus: (statusCode: number) => Response;
        id: string;
        flags: Flags;
        misc: Misc;
    }
}