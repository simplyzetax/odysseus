import 'dmno/injector-standalone/edge-auto';
import { app } from './core/app';

import "./services/backend/routes/health";

export default {
	fetch: app.fetch,
} satisfies ExportedHandler<Env>;
