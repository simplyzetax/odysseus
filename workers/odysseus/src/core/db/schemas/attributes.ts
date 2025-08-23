import { index, sqliteTable, text, integer, uniqueIndex } from 'drizzle-orm/sqlite-core';
import { PROFILES } from './profile';

export const ATTRIBUTES = sqliteTable(
	'attributes',
	{
		profileId: text('profile_id')
			.references(() => PROFILES.id)
			.notNull(),
		key: text('key').notNull(),
		valueJSON: text('value_json', { mode: 'json' }).notNull(),
		type: text('type').notNull(),
	},
	(attributes) => {
		return {
			idIndex: index('attr_id_idx').on(attributes.profileId),
			// Add unique constraint on profileId and key combination
			profileKeyUnique: uniqueIndex('attr_profile_key_unique_idx').on(attributes.profileId, attributes.key),
		};
	},
);

export type Attribute = typeof ATTRIBUTES.$inferSelect;
export type NewAttribute = typeof ATTRIBUTES.$inferInsert;
