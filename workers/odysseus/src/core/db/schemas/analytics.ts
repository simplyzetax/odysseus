import { index, sqliteTable, integer, text } from 'drizzle-orm/sqlite-core';


export const ANALYTICS = sqliteTable(
	'analytics',
	{
		id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
		value: text('value', { mode: 'json' }).notNull(),
	},
	(analytics) => {
		return {
			idIndex: index('analytics_id_idx').on(analytics.id),
		};
	},
);

export type Analytics = typeof ANALYTICS.$inferSelect;
export type NewAnalytics = typeof ANALYTICS.$inferInsert;
