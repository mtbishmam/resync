CREATE TABLE `source_documents` (
	`id` text PRIMARY KEY NOT NULL,
	`item_id` text NOT NULL,
	`body_text` text NOT NULL,
	`kind` text NOT NULL,
	`source` text NOT NULL,
	`language_codes_json` text DEFAULT '[]' NOT NULL,
	`model` text,
	`content_hash` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`item_id`) REFERENCES `items`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `source_documents_item_id_unique` ON `source_documents` (`item_id`);--> statement-breakpoint
CREATE INDEX `source_documents_hash_idx` ON `source_documents` (`content_hash`);