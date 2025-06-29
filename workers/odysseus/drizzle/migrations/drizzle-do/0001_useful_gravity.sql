CREATE INDEX `idx_cache_expires_at` ON `cache_entries` (`expires_at`);--> statement-breakpoint
CREATE INDEX `idx_table_keys_table_name` ON `table_keys` (`table_name`);--> statement-breakpoint
CREATE INDEX `idx_table_keys_cache_key` ON `table_keys` (`cache_key`);