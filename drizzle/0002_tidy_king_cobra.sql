CREATE TABLE `transcripts` (
	`id` text PRIMARY KEY NOT NULL,
	`item_id` text NOT NULL,
	`body_text` text NOT NULL,
	`source` text NOT NULL,
	`language_codes_json` text DEFAULT '[]' NOT NULL,
	`model` text,
	`transcript_hash` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`item_id`) REFERENCES `items`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `transcripts_item_id_unique` ON `transcripts` (`item_id`);--> statement-breakpoint
CREATE INDEX `transcripts_hash_idx` ON `transcripts` (`transcript_hash`);