import { index, jsonb, pgTable, text, uuid, uniqueIndex } from "drizzle-orm/pg-core";

export const CONTENT = pgTable('content', {
    id: uuid('id').primaryKey().defaultRandom(),
    key: text('key').notNull(),
    valueJSON: jsonb('value_json').notNull(),
}, (content) => {
    return {
        idIndex: index('content_id_idx').on(content.id),
        // Add unique constraint on profileId and key combination
        keyUnique: uniqueIndex('content_key_unique_idx').on(content.key),
    }
});

export type Content = typeof CONTENT.$inferSelect;
export type NewContent = typeof CONTENT.$inferInsert;