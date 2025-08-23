import { index, sqliteTable, integer, text } from 'drizzle-orm/sqlite-core';
import { nanoid } from 'nanoid';

export const ANALYTICS = sqliteTable(
	'analytics',
	{
		id: text('id').primaryKey().$defaultFn(() => nanoid()),
		value: text('value').notNull(),
	},
	(analytics) => {
		return {
			idIndex: index('analytics_id_idx').on(analytics.id),
		};
	},
);

export type Analytics = typeof ANALYTICS.$inferSelect;
export type NewAnalytics = typeof ANALYTICS.$inferInsert;
