import { index, jsonb, pgTable, text, uuid, varchar, uniqueIndex } from "drizzle-orm/pg-core";
import { PROFILES } from "./profile";

export const ATTRIBUTES = pgTable('attributes', {
    profileId: uuid('profile_id').references(() => PROFILES.id).notNull(),
    key: text('key').notNull(),
    valueJSON: jsonb('value_json').notNull(),
    type: text('type').notNull(),
}, (attributes) => {
    return {
        idIndex: index('attr_id_idx').on(attributes.profileId),
        // Add unique constraint on profileId and key combination
        profileKeyUnique: uniqueIndex('attr_profile_key_unique_idx').on(attributes.profileId, attributes.key),
    }
});

export type Attribute = typeof ATTRIBUTES.$inferSelect;
export type NewAttribute = typeof ATTRIBUTES.$inferInsert;