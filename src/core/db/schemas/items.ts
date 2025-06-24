import { sql } from "drizzle-orm";
import { pgTable, integer, uuid, text, boolean, jsonb, uniqueIndex, index } from "drizzle-orm/pg-core"
import { PROFILES } from "./profile";

const defaultJsonAttributes = {
    item_seen: true,
    variants: []
};

export const ITEMS = pgTable('items', {
    id: uuid().primaryKey().default(sql`uuid_generate_v4()`),
    templateId: text('template_id').notNull(),
    profileId: uuid('profile_id').references(() => PROFILES.id).notNull(),
    jsonAttributes: jsonb('attributes').notNull().default(defaultJsonAttributes),
    quantity: integer('quantity').notNull().default(1),
    favorite: boolean('favorite').default(false),
    seen: boolean('has_seen').default(false),
}, (items) => {
    return {
        profileIdIndex: index('items_profile_id_idx').on(items.profileId),
        templateIdIndex: index('items_template_id_idx').on(items.templateId),
    }
});

export type SelectItem = typeof ITEMS.$inferSelect;
export type NewItem = typeof ITEMS.$inferInsert;