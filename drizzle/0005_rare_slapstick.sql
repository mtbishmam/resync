ALTER TABLE `source_documents` ADD `storage_backend` text DEFAULT 'd1' NOT NULL;--> statement-breakpoint
ALTER TABLE `source_documents` ADD `object_key` text;--> statement-breakpoint
ALTER TABLE `source_documents` ADD `byte_size` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `source_documents` ADD `storage_status` text DEFAULT 'ready' NOT NULL;--> statement-breakpoint
CREATE INDEX `source_documents_object_key_idx` ON `source_documents` (`object_key`);