import { sql } from 'drizzle-orm';
import { index, sqliteTable, text, integer, uniqueIndex } from 'drizzle-orm/sqlite-core';
import { ACCOUNTS } from './account';


export const HOTFIXES = sqliteTable(
	'hotfixes',
	{
		id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
		filename: text('file').notNull(),
		section: text('section').notNull(),
		key: text('key').notNull(),
		value: text('value').notNull(),
		enabled: integer('enabled', { mode: 'boolean' }).notNull().default(true),
		scope: text('scope').notNull().default('user'),
		accountId: text('account_id').references(() => ACCOUNTS.id),
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
