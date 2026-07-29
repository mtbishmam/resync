CREATE TABLE `ai_analyses` (
	`id` text PRIMARY KEY NOT NULL,
	`item_id` text NOT NULL,
	`transcript_hash` text NOT NULL,
	`transcript_source` text NOT NULL,
	`summary_markdown` text NOT NULL,
	`novelty_score` integer NOT NULL,
	`recommendation` text NOT NULL,
	`learnable_points_json` text DEFAULT '[]' NOT NULL,
	`suggested_type` text NOT NULL,
	`suggested_topics_json` text DEFAULT '[]' NOT NULL,
	`value_score` integer DEFAULT 0 NOT NULL,
	`value_reason` text DEFAULT '' NOT NULL,
	`value_factors_json` text DEFAULT '[]' NOT NULL,
	`rationale_markdown` text NOT NULL,
	`model` text NOT NULL,
	`prompt_version` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`item_id`) REFERENCES `items`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `ai_analyses_version_unique` ON `ai_analyses` (`item_id`,`transcript_hash`,`model`,`prompt_version`);--> statement-breakpoint
CREATE INDEX `ai_analyses_item_id_idx` ON `ai_analyses` (`item_id`);--> statement-breakpoint
CREATE TABLE `app_meta` (
	`key` text PRIMARY KEY NOT NULL,
	`value` text NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `chat_messages` (
	`id` text PRIMARY KEY NOT NULL,
	`thread_id` text NOT NULL,
	`role` text NOT NULL,
	`content_markdown` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`thread_id`) REFERENCES `chat_threads`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `chat_messages_thread_id_idx` ON `chat_messages` (`thread_id`);--> statement-breakpoint
CREATE TABLE `chat_threads` (
	`id` text PRIMARY KEY NOT NULL,
	`item_id` text NOT NULL,
	`title` text DEFAULT 'New conversation' NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`item_id`) REFERENCES `items`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `chat_threads_item_id_idx` ON `chat_threads` (`item_id`);--> statement-breakpoint
CREATE TABLE `items` (
	`id` text PRIMARY KEY NOT NULL,
	`youtube_id` text,
	`url` text NOT NULL,
	`title` text NOT NULL,
	`author` text NOT NULL,
	`thumbnail_url` text,
	`description` text,
	`published_at` text,
	`tags_json` text DEFAULT '[]' NOT NULL,
	`caption_available` integer,
	`metadata_complete` integer DEFAULT false NOT NULL,
	`duration_minutes` integer DEFAULT 0 NOT NULL,
	`duration_seconds` integer DEFAULT 0 NOT NULL,
	`content_type` text DEFAULT 'Watch' NOT NULL,
	`topics_json` text DEFAULT '[]' NOT NULL,
	`status` text DEFAULT 'inbox' NOT NULL,
	`value_score` integer DEFAULT 0 NOT NULL,
	`value_reason` text DEFAULT 'AI analysis pending' NOT NULL,
	`value_factors_json` text,
	`added_at` integer NOT NULL,
	`cooldown_until` integer DEFAULT 0 NOT NULL,
	`progress` integer DEFAULT 0 NOT NULL,
	`accent` text DEFAULT 'red' NOT NULL,
	`transcript_status` text DEFAULT 'pending' NOT NULL,
	`analysis_status` text DEFAULT 'pending' NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `items_youtube_id_unique` ON `items` (`youtube_id`);--> statement-breakpoint
CREATE INDEX `items_type_status_idx` ON `items` (`content_type`,`status`);--> statement-breakpoint
CREATE INDEX `items_updated_at_idx` ON `items` (`updated_at`);--> statement-breakpoint
CREATE TABLE `note_anchors` (
	`id` text PRIMARY KEY NOT NULL,
	`note_id` text NOT NULL,
	`kind` text NOT NULL,
	`position_seconds` integer,
	`source_quote` text,
	`source_url` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`note_id`) REFERENCES `notes`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `note_anchors_note_id_idx` ON `note_anchors` (`note_id`);--> statement-breakpoint
CREATE TABLE `notes` (
	`id` text PRIMARY KEY NOT NULL,
	`item_id` text NOT NULL,
	`body_markdown` text DEFAULT '' NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`item_id`) REFERENCES `items`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `notes_item_id_unique` ON `notes` (`item_id`);