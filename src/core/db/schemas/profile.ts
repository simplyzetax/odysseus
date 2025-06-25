import { pgTable, uuid, varchar, timestamp, boolean, text, pgEnum, integer } from 'drizzle-orm/pg-core';
import { ACCOUNTS } from './account';
import { createSelectSchema } from 'drizzle-zod';

export const profileTypes = pgEnum('profile_type_enum', ['athena', 'common_core', 'common_public', 'creative', 'profile0']);
export type ProfileType = typeof profileTypes.enumValues.entries;

export const PROFILES = pgTable('profiles', {
    id: uuid('id').primaryKey().defaultRandom(),
    type: profileTypes('type').notNull().default('common_core'),
    accountId: uuid('account_id').notNull().unique().references(() => ACCOUNTS.id),
    rvn: integer('rvn').notNull().default(0),
});

export type Profile = typeof PROFILES.$inferSelect;
export type NewProfile = typeof PROFILES.$inferInsert;

export const profileSelectSchema = createSelectSchema(PROFILES);
export const profileTypesEnum = profileSelectSchema.shape.type.enum;