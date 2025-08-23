import { sql } from 'drizzle-orm';
import { sqliteTable, text, integer, uniqueIndex, index } from 'drizzle-orm/sqlite-core';
import { ACCOUNTS } from './account';


export const FRIENDS = sqliteTable(
	'friends',
	{
		id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
		accountId: text('account_id')
			.references(() => ACCOUNTS.id)
			.notNull(),
		targetId: text('target_id')
			.references(() => ACCOUNTS.id)
			.notNull(),
		status: text('status').default('PENDING').notNull(),
		createdAt: integer('created_at', { mode: 'timestamp' }).default(new Date()),
		updatedAt: integer('updated_at', { mode: 'timestamp' }).default(new Date()),
		favorite: integer('favorite', { mode: 'boolean' }).default(false).notNull(),
		note: text(),
		alias: text(),
	},
	(friends) => {
		return {
			accountIdIndex: index('friends_account_id_idx').on(friends.accountId),
			targetIdIndex: index('friends_target_id_idx').on(friends.targetId),
			uniqueFriendship: uniqueIndex('friends_unique_idx').on(friends.accountId, friends.targetId),
		};
	},
);

// Mutual friend status views can be created with a SQL view

export type Friend = typeof FRIENDS.$inferSelect;
export type NewFriend = typeof FRIENDS.$inferInsert;
