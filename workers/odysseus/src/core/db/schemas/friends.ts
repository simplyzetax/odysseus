import { sql } from 'drizzle-orm';
import { pgTable, uuid, text, boolean, uniqueIndex, index, timestamp, pgEnum } from 'drizzle-orm/pg-core';
import { ACCOUNTS } from './account';

// Friend status codes - Drizzle enum
export const friendStatusEnum = pgEnum('friend_status', ['PENDING', 'ACCEPTED', 'BLOCKED', 'REJECTED']);

// The friends table stores friendship relationships between accounts
export const FRIENDS = pgTable(
	'friends',
	{
		id: uuid().primaryKey().defaultRandom(),
		accountId: uuid()
			.references(() => ACCOUNTS.id)
			.notNull(),
		targetId: uuid()
			.references(() => ACCOUNTS.id)
			.notNull(),
		status: friendStatusEnum().default('PENDING').notNull(),
		createdAt: timestamp().default(sql`now()`),
		updatedAt: timestamp().default(sql`now()`),
		favorite: boolean().default(false).notNull(),
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
