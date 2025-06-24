/// <reference types="../.dmno/.typegen/global.d.ts" />

import { app } from './core/app';

// Automatically import all route files from all services
import.meta.glob('./services/*/routes/**/*.ts', { eager: true });

export default {
	fetch: app.fetch,
} satisfies ExportedHandler<Env>;