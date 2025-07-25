import { pgTable, text, uuid } from 'drizzle-orm/pg-core';
import { ACCOUNTS } from './account';

export const REPORTS = pgTable('hotfixes', {
	id: uuid('id').primaryKey().defaultRandom(),
	reason: text('reason').notNull(),
	details: text('details').notNull(),
	playlistName: text('playlist_name').notNull(),
	accountId: uuid('account_id').references(() => ACCOUNTS.id),
});

export type Report = typeof REPORTS.$inferSelect;
export type NewReport = typeof REPORTS.$inferInsert;
