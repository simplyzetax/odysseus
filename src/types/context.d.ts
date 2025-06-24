import { Context } from "hono";
import { Flags } from "../middleware/rem";

declare module "hono" {
    interface Context {
        sendError: (error: ApiError) => Response;
        sendIni: (ini: string) => Response;
        sendStatus: (statusCode: number) => Response;
        id: string;
        flags: Flags;
    }
}

type HonoContext = Context<{ Bindings: Env }>