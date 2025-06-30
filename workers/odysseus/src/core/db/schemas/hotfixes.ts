import { sql } from 'drizzle-orm';
import { boolean, index, pgTable, text, uuid, uniqueIndex } from 'drizzle-orm/pg-core';
import { ACCOUNTS } from './account';

export const HOTFIXES = pgTable(
	'hotfixes',
	{
		id: uuid('id').primaryKey().defaultRandom(),
		filename: text('file').notNull(),
		section: text('section').notNull(),
		key: text('key').notNull(),
		value: text('value').notNull(),
		enabled: boolean('enabled').notNull().default(true),
		scope: text('scope').notNull().default('user'),
		accountId: uuid('account_id').references(() => ACCOUNTS.id),
	},
	(hotfixes) => {
		return {
			nameIndex: index('filename_idx').on(hotfixes.filename),
			unique_hotfix: uniqueIndex('unique_hotfix_idx').on(hotfixes.filename, hotfixes.section, hotfixes.key),
		};
	},
);

export type Hotfix = typeof HOTFIXES.$inferSelect;
export type NewHotfix = typeof HOTFIXES.$inferInsert;
