CREATE TABLE `lti_identities` (
	`id` int AUTO_INCREMENT NOT NULL,
	`platform_id` int NOT NULL,
	`subject` varchar(255) NOT NULL,
	`user_id` int NOT NULL,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`last_launched_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `lti_identities_id` PRIMARY KEY(`id`),
	CONSTRAINT `lti_identity_idx` UNIQUE(`platform_id`,`subject`)
);
--> statement-breakpoint
ALTER TABLE `lti_identities` ADD CONSTRAINT `lti_identities_platform_id_lti_platforms_id_fk` FOREIGN KEY (`platform_id`) REFERENCES `lti_platforms`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `lti_identities` ADD CONSTRAINT `lti_identities_user_id_users_id_fk` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `lti_identity_user_idx` ON `lti_identities` (`user_id`);