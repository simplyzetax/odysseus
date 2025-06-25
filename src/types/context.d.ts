import type { ApiError } from "@core/error";
import type { Flags, Misc } from "../middleware/core/remMiddleware";

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