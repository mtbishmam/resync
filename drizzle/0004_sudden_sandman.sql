CREATE TABLE `ai_usage_events` (
	`id` text PRIMARY KEY NOT NULL,
	`item_id` text NOT NULL,
	`purpose` text NOT NULL,
	`model` text NOT NULL,
	`input_tokens` integer DEFAULT 0 NOT NULL,
	`cached_input_tokens` integer DEFAULT 0 NOT NULL,
	`audio_input_tokens` integer DEFAULT 0 NOT NULL,
	`output_tokens` integer DEFAULT 0 NOT NULL,
	`total_tokens` integer DEFAULT 0 NOT NULL,
	`estimated_cost_micros` integer,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`item_id`) REFERENCES `items`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `ai_usage_events_item_id_idx` ON `ai_usage_events` (`item_id`);--> statement-breakpoint
CREATE INDEX `ai_usage_events_created_at_idx` ON `ai_usage_events` (`created_at`);--> statement-breakpoint
CREATE TABLE `learned_summaries` (
	`id` text PRIMARY KEY NOT NULL,
	`item_id` text NOT NULL,
	`note_hash` text NOT NULL,
	`summary_markdown` text NOT NULL,
	`topics_json` text DEFAULT '[]' NOT NULL,
	`model` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`item_id`) REFERENCES `items`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `learned_summaries_item_id_unique` ON `learned_summaries` (`item_id`);--> statement-breakpoint
CREATE INDEX `learned_summaries_updated_at_idx` ON `learned_summaries` (`updated_at`);