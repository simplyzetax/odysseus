import { app } from './core/app';

// Automatically import all route files from all services
import.meta.glob('./services/*/routes/**/*.ts', { eager: true });

// Export Durable Object
export { CacheDurableObject } from '@utils/cache/durableobjects/cacheDurableObject';

export default {
	fetch: app.fetch,
} satisfies ExportedHandler<Env>;