CREATE TABLE `card_members` (
	`card_id` text NOT NULL,
	`user_id` text NOT NULL,
	`invited_by` text,
	`created_at` integer NOT NULL,
	PRIMARY KEY(`card_id`, `user_id`),
	FOREIGN KEY (`card_id`) REFERENCES `cards`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`invited_by`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `card_members_user_idx` ON `card_members` (`user_id`);--> statement-breakpoint
ALTER TABLE `cards` ADD `due_at` integer;