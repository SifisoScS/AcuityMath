CREATE TABLE `oneroster_class_links` (
	`id` int AUTO_INCREMENT NOT NULL,
	`provider_id` int NOT NULL,
	`sourced_id` varchar(255) NOT NULL,
	`classroom_id` int NOT NULL,
	CONSTRAINT `oneroster_class_links_id` PRIMARY KEY(`id`),
	CONSTRAINT `oneroster_class_link_idx` UNIQUE(`provider_id`,`sourced_id`),
	CONSTRAINT `oneroster_class_link_classroom_idx` UNIQUE(`classroom_id`)
);
--> statement-breakpoint
CREATE TABLE `oneroster_identities` (
	`id` int AUTO_INCREMENT NOT NULL,
	`provider_id` int NOT NULL,
	`sourced_id` varchar(255) NOT NULL,
	`user_id` int,
	`learner_id` int,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`last_seen_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `oneroster_identities_id` PRIMARY KEY(`id`),
	CONSTRAINT `oneroster_identity_idx` UNIQUE(`provider_id`,`sourced_id`),
	CONSTRAINT `oneroster_identity_is_one_person` CHECK((`user_id` is null) <> (`learner_id` is null))
);
--> statement-breakpoint
CREATE TABLE `oneroster_school_links` (
	`id` int AUTO_INCREMENT NOT NULL,
	`provider_id` int NOT NULL,
	`sourced_id` varchar(255) NOT NULL,
	`school_id` int NOT NULL,
	CONSTRAINT `oneroster_school_links_id` PRIMARY KEY(`id`),
	CONSTRAINT `oneroster_school_link_idx` UNIQUE(`provider_id`,`sourced_id`),
	CONSTRAINT `oneroster_school_link_school_idx` UNIQUE(`school_id`)
);
--> statement-breakpoint
ALTER TABLE `oneroster_class_links` ADD CONSTRAINT `oneroster_class_links_provider_id_oneroster_providers_id_fk` FOREIGN KEY (`provider_id`) REFERENCES `oneroster_providers`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `oneroster_class_links` ADD CONSTRAINT `oneroster_class_links_classroom_id_classrooms_id_fk` FOREIGN KEY (`classroom_id`) REFERENCES `classrooms`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `oneroster_identities` ADD CONSTRAINT `oneroster_identities_provider_id_oneroster_providers_id_fk` FOREIGN KEY (`provider_id`) REFERENCES `oneroster_providers`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `oneroster_identities` ADD CONSTRAINT `oneroster_identities_user_id_users_id_fk` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `oneroster_identities` ADD CONSTRAINT `oneroster_identities_learner_id_learners_id_fk` FOREIGN KEY (`learner_id`) REFERENCES `learners`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `oneroster_school_links` ADD CONSTRAINT `oneroster_school_links_provider_id_oneroster_providers_id_fk` FOREIGN KEY (`provider_id`) REFERENCES `oneroster_providers`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `oneroster_school_links` ADD CONSTRAINT `oneroster_school_links_school_id_schools_id_fk` FOREIGN KEY (`school_id`) REFERENCES `schools`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `oneroster_identity_user_idx` ON `oneroster_identities` (`user_id`);--> statement-breakpoint
CREATE INDEX `oneroster_identity_learner_idx` ON `oneroster_identities` (`learner_id`);