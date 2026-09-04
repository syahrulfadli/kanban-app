CREATE TABLE `card_watches` (
	`card_id` text NOT NULL,
	`user_id` text NOT NULL,
	`watching` integer NOT NULL,
	`updated_at` integer NOT NULL,
	PRIMARY KEY(`card_id`, `user_id`),
	FOREIGN KEY (`card_id`) REFERENCES `cards`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `card_watches_user_idx` ON `card_watches` (`user_id`);--> statement-breakpoint
CREATE TABLE `column_watches` (
	`column_id` text NOT NULL,
	`user_id` text NOT NULL,
	`created_at` integer NOT NULL,
	PRIMARY KEY(`column_id`, `user_id`),
	FOREIGN KEY (`column_id`) REFERENCES `columns`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `column_watches_user_idx` ON `column_watches` (`user_id`);