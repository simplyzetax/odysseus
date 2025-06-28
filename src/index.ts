import { app } from './core/app';

// Automatically import all route files from all services
import.meta.glob('./services/*/routes/**/*.ts', { eager: true });

// Export Durable Objects
export { CacheDurableObject } from '@utils/cache/durableobjects/cacheDurableObject';
export { XMPPServer } from '@services/xmpp/server';

export default {
	fetch: app.fetch,
} satisfies ExportedHandler<Env>;
