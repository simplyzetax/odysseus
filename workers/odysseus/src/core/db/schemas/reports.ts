import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core';
import { ACCOUNTS } from './account';
import { nanoid } from 'nanoid';

export const REPORTS = sqliteTable('hotfixes', {
	id: text('id').primaryKey().$defaultFn(() => nanoid()),
	reason: text('reason').notNull(),
	details: text('details').notNull(),
	playlistName: text('playlist_name').notNull(),
	accountId: text('account_id').references(() => ACCOUNTS.id),
});

export type Report = typeof REPORTS.$inferSelect;
export type NewReport = typeof REPORTS.$inferInsert;
