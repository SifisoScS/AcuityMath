CREATE TABLE `learner_avatars` (
	`id` int AUTO_INCREMENT NOT NULL,
	`learner_id` int NOT NULL,
	`avatar_id` varchar(64) NOT NULL,
	`unlocked_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `learner_avatars_id` PRIMARY KEY(`id`),
	CONSTRAINT `learner_avatar_idx` UNIQUE(`learner_id`,`avatar_id`)
);
--> statement-breakpoint
ALTER TABLE `learner_avatars` ADD CONSTRAINT `learner_avatars_learner_id_learners_id_fk` FOREIGN KEY (`learner_id`) REFERENCES `learners`(`id`) ON DELETE cascade ON UPDATE no action;