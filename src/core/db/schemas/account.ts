import { pgTable, uuid, varchar, timestamp, boolean, text } from 'drizzle-orm/pg-core';

export const ACCOUNTS = pgTable('accounts', {
    id: uuid('id').primaryKey().defaultRandom(),
    email: text('email').notNull().unique(),
    displayName: text('username').notNull().unique(),
    passwordHash: text('password_hash').notNull(),
    banned: boolean('banned').default(false),
});

export type Account = typeof ACCOUNTS.$inferSelect;
export type NewAccount = typeof ACCOUNTS.$inferInsert;