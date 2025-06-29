import { index, jsonb, pgTable, uuid } from 'drizzle-orm/pg-core';

export const ANALYTICS = pgTable(
	'analytics',
	{
		id: uuid('id').primaryKey().defaultRandom(),
		value: jsonb('value').notNull(),
	},
	(analytics) => {
		return {
			idIndex: index('analytics_id_idx').on(analytics.id),
		};
	},
);

export type Analytics = typeof ANALYTICS.$inferSelect;
export type NewAnalytics = typeof ANALYTICS.$inferInsert;
