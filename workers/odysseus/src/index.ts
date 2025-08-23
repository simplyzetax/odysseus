import { app } from './core/app';

// Automatically import all route files from all services
import.meta.glob('./services/*/routes/**/*.ts', { eager: true });

export { XMPPServer } from '@services/xmpp/server';
export { DatabaseDurableObject } from '@core/db/durable-object';

export default {
	fetch: app.fetch,
} satisfies ExportedHandler<Env>;
