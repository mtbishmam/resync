CREATE TABLE `consumption_history` (
	`id` text PRIMARY KEY NOT NULL,
	`item_id` text NOT NULL,
	`completed_at` integer NOT NULL,
	FOREIGN KEY (`item_id`) REFERENCES `items`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `consumption_history_item_id_idx` ON `consumption_history` (`item_id`);--> statement-breakpoint
CREATE INDEX `consumption_history_completed_at_idx` ON `consumption_history` (`completed_at`);--> statement-breakpoint
ALTER TABLE `items` ADD `favorite` integer DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `items` ADD `liked` integer DEFAULT false NOT NULL;