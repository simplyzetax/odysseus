import { pgTable, uuid, pgEnum, integer } from 'drizzle-orm/pg-core';
import { createSelectSchema } from 'drizzle-arktype';
import { ACCOUNTS } from './account';

export const profileTypes = pgEnum('profile_type_enum', ['athena', 'common_core', 'common_public', 'creative', 'profile0']);

export const PROFILES = pgTable('profiles', {
	id: uuid('id').primaryKey().defaultRandom(),
	type: profileTypes('type').notNull().default('common_core'),
	accountId: uuid('account_id')
		.notNull()
		.references(() => ACCOUNTS.id),
	rvn: integer('rvn').notNull().default(0),
});

export type Profile = typeof PROFILES.$inferSelect;
export type NewProfile = typeof PROFILES.$inferInsert;

export const profileSelectSchema = createSelectSchema(PROFILES);

const profileTypeValues = ['athena', 'common_core', 'common_public', 'creative', 'profile0'] as const;
export const profileTypesEnum = Object.fromEntries(profileTypeValues.map((value) => [value, value])) as {
	[K in (typeof profileTypeValues)[number]]: K;
};
