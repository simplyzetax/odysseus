import { sql } from "drizzle-orm";
import { boolean, index, integer, pgTable, text, uuid } from "drizzle-orm/pg-core";
import { ACCOUNTS } from "./account";

export const HOTFIXES = pgTable('hotfixes', {
    id: uuid('id').primaryKey().default(sql`uuid_generate_v4()`),
    filename: text('file').notNull(),
    section: text('section').notNull(),
    key: text('key').notNull(),
    value: text('value').notNull(),
    enabled: boolean('enabled').notNull().default(true),
    scope: text('scope').notNull().default('user'),
    accountId: uuid('account_id').references(() => ACCOUNTS.id),
}, (hotfixes) => {
    return {
        nameIndex: index('filename_idx').on(hotfixes.filename),
    }
});

export type SelectHotfix = typeof HOTFIXES.$inferSelect;
export type NewHotfix = typeof HOTFIXES.$inferInsert;