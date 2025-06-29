import { pgTable, uuid, boolean, text, jsonb } from 'drizzle-orm/pg-core';
import { type } from 'arktype';
import { createSelectSchema } from 'drizzle-arktype';

export const privacySettingsSchema = type({
	optOutOfPublicLeaderboards: 'boolean',
});

export const friendsSettingsSchema = type({
	mutualPrivacy: '"ALL" | "NONE" | "FRIENDS"',
	acceptInvites: '"private" | "public"',
});

export const accountSettingsSchema = type({
	privacy: privacySettingsSchema,
	friends: friendsSettingsSchema,
});

export type AccountSettings = typeof accountSettingsSchema.infer;

const defaultSettings: AccountSettings = {
	privacy: {
		optOutOfPublicLeaderboards: false,
	},
	friends: {
		mutualPrivacy: 'ALL',
		acceptInvites: 'private',
	},
};

export const ACCOUNTS = pgTable('accounts', {
	id: uuid('id').primaryKey().defaultRandom(),
	email: text('email').notNull().unique().notNull(),
	displayName: text('username').notNull().unique().notNull(),
	passwordHash: text('password_hash').notNull().notNull(),
	banned: boolean('banned').default(false).notNull(),
	discordId: text('discord_id').notNull().unique().notNull(),
	creator: boolean('creator').default(false).notNull(),
	settings: jsonb('settings').$type<AccountSettings>().default(defaultSettings).notNull(),
});

export type Account = typeof ACCOUNTS.$inferSelect;
export type NewAccount = typeof ACCOUNTS.$inferInsert;
export const accountSchema = createSelectSchema(ACCOUNTS);
