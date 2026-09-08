CREATE TABLE `card_attachments` (
	`id` text PRIMARY KEY NOT NULL,
	`card_id` text NOT NULL,
	`user_id` text,
	`filename` text NOT NULL,
	`mime` text NOT NULL,
	`size` integer NOT NULL,
	`data` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`card_id`) REFERENCES `cards`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `card_attachments_card_idx` ON `card_attachments` (`card_id`,`created_at`);