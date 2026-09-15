CREATE TABLE `learner_deletions` (
	`id` int AUTO_INCREMENT NOT NULL,
	`learner_id` int NOT NULL,
	`institution_id` int,
	`requested_by_user_id` int,
	`requested_by_email` varchar(320) NOT NULL,
	`removed_counts` json NOT NULL,
	`deleted_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `learner_deletions_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `learner_deletions` ADD CONSTRAINT `learner_deletions_institution_id_institutions_id_fk` FOREIGN KEY (`institution_id`) REFERENCES `institutions`(`id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `learner_deletions` ADD CONSTRAINT `learner_deletions_requested_by_user_id_users_id_fk` FOREIGN KEY (`requested_by_user_id`) REFERENCES `users`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `learner_deletion_institution_idx` ON `learner_deletions` (`institution_id`,`deleted_at`);