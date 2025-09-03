import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core';
import { z } from 'zod';

export const privacySettingsSchema = z.object({
	optOutOfPublicLeaderboards: z.boolean(),
});

export const friendsSettingsSchema = z.object({
	mutualPrivacy: z.enum(['ALL', 'NONE', 'FRIENDS']),
	acceptInvites: z.enum(['private', 'public']),
});

export const accountSettingsSchema = z.object({
	privacy: privacySettingsSchema,
	friends: friendsSettingsSchema,
});

export type AccountSettings = z.infer<typeof accountSettingsSchema>;

const defaultSettings: AccountSettings = {
	privacy: {
		optOutOfPublicLeaderboards: false,
	},
	friends: {
		mutualPrivacy: 'ALL',
		acceptInvites: 'private',
	},
};

export const ACCOUNTS = sqliteTable('accounts', {
	id: text('id')
		.primaryKey()
		.$defaultFn(() => crypto.randomUUID()),
	email: text('email').notNull().unique().notNull(),
	displayName: text('username').notNull().unique().notNull(),
	passwordHash: text('password_hash').notNull().notNull(),
	banned: integer('banned', { mode: 'boolean' }).default(false),
	discordId: text('discord_id').notNull().unique().notNull(),
	creator: integer('creator', { mode: 'boolean' }).default(false),
	settings: text('settings', { mode: 'json' }).default(defaultSettings).$type<AccountSettings>().notNull(),
});

export type Account = typeof ACCOUNTS.$inferSelect;
export type NewAccount = typeof ACCOUNTS.$inferInsert;
