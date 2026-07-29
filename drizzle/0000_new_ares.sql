CREATE TABLE `replay_library` (
	`id` text PRIMARY KEY NOT NULL,
	`videos_json` text DEFAULT '[]' NOT NULL,
	`notes_json` text DEFAULT '{}' NOT NULL,
	`updated_at` integer NOT NULL
);
