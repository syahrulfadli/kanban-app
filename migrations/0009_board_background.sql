CREATE TABLE `app_admins` (
	`user_id` text PRIMARY KEY NOT NULL,
	`granted_by` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`granted_by`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE TABLE `background_images` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`url` text NOT NULL,
	`photographer` text NOT NULL,
	`photographer_url` text,
	`position` real NOT NULL,
	`active` integer DEFAULT true NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `background_images_position_idx` ON `background_images` (`position`);--> statement-breakpoint
ALTER TABLE `boards` ADD `background_kind` text DEFAULT 'default' NOT NULL;--> statement-breakpoint
ALTER TABLE `boards` ADD `background_value` text;