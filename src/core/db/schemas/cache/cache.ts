import { sqliteTable, text, integer, primaryKey, index } from 'drizzle-orm/sqlite-core';

export const cacheEntries = sqliteTable(
	'cache_entries',
	{
		key: text('key').primaryKey(),
		data: text('data').notNull(),
		tables: text('tables').notNull(), // JSON string of table names
		expiresAt: integer('expires_at').notNull(),
		createdAt: integer('created_at').notNull(),
	},
	(table) => ({
		expiresAtIdx: index('idx_cache_expires_at').on(table.expiresAt),
	}),
);

export const tableKeys = sqliteTable(
	'table_keys',
	{
		tableName: text('table_name').notNull(),
		cacheKey: text('cache_key').notNull(),
		createdAt: integer('created_at').notNull(),
	},
	(table) => ({
		pk: primaryKey({ columns: [table.tableName, table.cacheKey] }),
		tableNameIdx: index('idx_table_keys_table_name').on(table.tableName),
		cacheKeyIdx: index('idx_table_keys_cache_key').on(table.cacheKey),
	}),
);

export type CacheEntry = typeof cacheEntries.$inferSelect;
export type NewCacheEntry = typeof cacheEntries.$inferInsert;
export type TableKey = typeof tableKeys.$inferSelect;
export type NewTableKey = typeof tableKeys.$inferInsert;
