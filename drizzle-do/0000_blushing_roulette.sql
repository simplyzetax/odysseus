CREATE TABLE `cache_entries` (
	`key` text PRIMARY KEY NOT NULL,
	`data` text NOT NULL,
	`tables` text NOT NULL,
	`expires_at` integer NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `table_keys` (
	`table_name` text NOT NULL,
	`cache_key` text NOT NULL,
	`created_at` integer NOT NULL,
	PRIMARY KEY(`table_name`, `cache_key`)
);
