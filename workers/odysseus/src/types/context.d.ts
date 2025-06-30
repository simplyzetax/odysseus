import type { Flags, Misc } from '@middleware/core/remMiddleware';

declare module 'hono' {
	interface Context {
		sendOctet: (ini: string) => Response;
		sendStatus: (statusCode: number) => Response;
		id: string;
		flags: Flags;
		misc: Misc;
		unsafeVariables: {
			rawBody: any;
			timestamp: number;
		};
	}
}
