import { Context } from "hono";
import { Flags, Misc } from "../middleware/rem";
import { ApiError } from "@core/error";
import { parseUserAgent } from "@utils/useragent";

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

type HonoContext = Context<{ Bindings: Env }>