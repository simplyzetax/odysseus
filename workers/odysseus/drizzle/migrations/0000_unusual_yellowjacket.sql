CREATE TABLE `accounts` (
	`id` text PRIMARY KEY NOT NULL,
	`email` text NOT NULL,
	`username` text NOT NULL,
	`password_hash` text NOT NULL,
	`banned` integer DEFAULT false,
	`discord_id` text NOT NULL,
	`creator` integer DEFAULT false,
	`settings` text DEFAULT '{"privacy":{"optOutOfPublicLeaderboards":false},"friends":{"mutualPrivacy":"ALL","acceptInvites":"private"}}' NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `accounts_email_unique` ON `accounts` (`email`);--> statement-breakpoint
CREATE UNIQUE INDEX `accounts_username_unique` ON `accounts` (`username`);--> statement-breakpoint
CREATE UNIQUE INDEX `accounts_discord_id_unique` ON `accounts` (`discord_id`);--> statement-breakpoint
CREATE TABLE `analytics` (
	`id` text PRIMARY KEY NOT NULL,
	`value` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `analytics_id_idx` ON `analytics` (`id`);--> statement-breakpoint
CREATE TABLE `attributes` (
	`profile_id` text NOT NULL,
	`key` text NOT NULL,
	`value_json` text NOT NULL,
	`type` text NOT NULL,
	FOREIGN KEY (`profile_id`) REFERENCES `profiles`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `attr_id_idx` ON `attributes` (`profile_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `attr_profile_key_unique_idx` ON `attributes` (`profile_id`,`key`);--> statement-breakpoint
CREATE TABLE `cache_entries` (
	`key` text PRIMARY KEY NOT NULL,
	`data` text NOT NULL,
	`tables` text NOT NULL,
	`expires_at` integer NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_cache_expires_at` ON `cache_entries` (`expires_at`);--> statement-breakpoint
CREATE TABLE `table_keys` (
	`table_name` text NOT NULL,
	`cache_key` text NOT NULL,
	`created_at` integer NOT NULL,
	PRIMARY KEY(`table_name`, `cache_key`)
);
--> statement-breakpoint
CREATE INDEX `idx_table_keys_table_name` ON `table_keys` (`table_name`);--> statement-breakpoint
CREATE INDEX `idx_table_keys_cache_key` ON `table_keys` (`cache_key`);--> statement-breakpoint
CREATE TABLE `content` (
	`id` text PRIMARY KEY NOT NULL,
	`key` text NOT NULL,
	`value_json` text DEFAULT '{}' NOT NULL
);
--> statement-breakpoint
CREATE INDEX `content_id_idx` ON `content` (`id`);--> statement-breakpoint
CREATE UNIQUE INDEX `content_key_unique_idx` ON `content` (`key`);--> statement-breakpoint
CREATE TABLE `friends` (
	`id` text PRIMARY KEY NOT NULL,
	`account_id` integer NOT NULL,
	`target_id` integer NOT NULL,
	`status` text DEFAULT 'PENDING' NOT NULL,
	`created_at` integer DEFAULT '"2025-08-23T00:03:44.646Z"',
	`updated_at` integer DEFAULT '"2025-08-23T00:03:44.646Z"',
	`favorite` integer DEFAULT false NOT NULL,
	`note` text,
	`alias` text,
	FOREIGN KEY (`account_id`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`target_id`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `friends_account_id_idx` ON `friends` (`account_id`);--> statement-breakpoint
CREATE INDEX `friends_target_id_idx` ON `friends` (`target_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `friends_unique_idx` ON `friends` (`account_id`,`target_id`);--> statement-breakpoint
CREATE TABLE `hotfixes` (
	`id` text PRIMARY KEY NOT NULL,
	`reason` text NOT NULL,
	`details` text NOT NULL,
	`playlist_name` text NOT NULL,
	`account_id` integer,
	FOREIGN KEY (`account_id`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `items` (
	`id` text PRIMARY KEY NOT NULL,
	`template_id` text NOT NULL,
	`profile_id` integer NOT NULL,
	`attributes` text DEFAULT '{"item_seen":true,"variants":[]}' NOT NULL,
	`quantity` integer DEFAULT 1 NOT NULL,
	`favorite` integer DEFAULT false,
	`has_seen` integer DEFAULT false,
	FOREIGN KEY (`profile_id`) REFERENCES `profiles`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `items_profile_id_idx` ON `items` (`profile_id`);--> statement-breakpoint
CREATE INDEX `items_template_id_idx` ON `items` (`template_id`);--> statement-breakpoint
CREATE TABLE `profiles` (
	`id` text PRIMARY KEY NOT NULL,
	`type` text DEFAULT 'common_core' NOT NULL,
	`account_id` integer NOT NULL,
	`rvn` integer DEFAULT 0 NOT NULL,
	FOREIGN KEY (`account_id`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE no action
);
