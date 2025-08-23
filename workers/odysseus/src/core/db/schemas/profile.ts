import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core';
import { ACCOUNTS } from './account';
import { nanoid } from 'nanoid';

export const PROFILES = sqliteTable('profiles', {
	id: text('id').primaryKey().$defaultFn(() => nanoid()),
	type: text('type').notNull().default('common_core'),
	accountId: text('account_id')
		.notNull()
		.references(() => ACCOUNTS.id),
	rvn: integer('rvn').notNull().default(0),
});

export type Profile = typeof PROFILES.$inferSelect;
export type NewProfile = typeof PROFILES.$inferInsert;

export const profileTypesEnum = {
	athena: 'athena',
	common_core: 'common_core',
	common_public: 'common_public',
	creative: 'creative',
	profile0: 'profile0',
} as const;