PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_comment_reactions` (
	`comment_id` text NOT NULL,
	`user_id` text NOT NULL,
	`emoji` text NOT NULL,
	`created_at` integer NOT NULL,
	PRIMARY KEY(`comment_id`, `user_id`),
	FOREIGN KEY (`comment_id`) REFERENCES `card_comments`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
INSERT INTO `__new_comment_reactions`("comment_id", "user_id", "emoji", "created_at") SELECT "comment_id", "user_id", "emoji", "created_at" FROM `comment_reactions`;--> statement-breakpoint
DROP TABLE `comment_reactions`;--> statement-breakpoint
ALTER TABLE `__new_comment_reactions` RENAME TO `comment_reactions`;--> statement-breakpoint
PRAGMA foreign_keys=ON;