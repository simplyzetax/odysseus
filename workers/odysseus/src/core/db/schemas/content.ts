import { index, sqliteTable, text, integer, uniqueIndex } from 'drizzle-orm/sqlite-core';


export const CONTENT = sqliteTable(
	'content',
	{
		id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
		key: text('key').notNull(),
		valueJSON: text('value_json', { mode: 'json' }).notNull().default(JSON.stringify({})),
	},
	(content) => {
		return {
			idIndex: index('content_id_idx').on(content.id),
			// Add unique constraint on profileId and key combination
			keyUnique: uniqueIndex('content_key_unique_idx').on(content.key),
		};
	},
);

export type Content = typeof CONTENT.$inferSelect;
export type NewContent = typeof CONTENT.$inferInsert;
