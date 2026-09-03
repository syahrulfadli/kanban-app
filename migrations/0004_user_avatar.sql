CREATE TABLE `user_avatars` (
	`user_id` text PRIMARY KEY NOT NULL,
	`mime` text NOT NULL,
	`data` text NOT NULL,
	`version` text NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
