import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { ACCOUNTS } from "./accounts";
import { z } from "zod";
import { sql } from "drizzle-orm";

export const profileTypes = z.union([
    z.literal("athena"),
    z.literal("common_core"),
    z.literal("common_public"),
    z.literal("creative"),
]);

export const PROFILES = sqliteTable("profiles", {
    id: text("id")
        .primaryKey()
        .$defaultFn(() => crypto.randomUUID()),
    accountId: text("account_id")
        .references(() => ACCOUNTS.id)
        .notNull(),
    profileType: text("profile_type").notNull().$type<z.infer<typeof profileTypes>>(),
    createdAt: integer("created_at", { mode: "timestamp" })
        .notNull()
        .default(sql`CURRENT_TIMESTAMP`),
    updatedAt: integer("updated_at", { mode: "timestamp" })
        .notNull()
        .default(sql`CURRENT_TIMESTAMP`),
});

export type Profile = typeof PROFILES.$inferSelect;
export type NewProfile = typeof PROFILES.$inferInsert;
