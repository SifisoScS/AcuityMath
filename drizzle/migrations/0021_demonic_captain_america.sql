CREATE TABLE `lti_access_tokens` (
	`id` int AUTO_INCREMENT NOT NULL,
	`platform_id` int NOT NULL,
	`scope` varchar(500) NOT NULL,
	`access_token` text NOT NULL,
	`expires_at` timestamp NOT NULL,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `lti_access_tokens_id` PRIMARY KEY(`id`),
	CONSTRAINT `lti_access_token_idx` UNIQUE(`platform_id`,`scope`)
);
--> statement-breakpoint
ALTER TABLE `lti_access_tokens` ADD CONSTRAINT `lti_access_tokens_platform_id_lti_platforms_id_fk` FOREIGN KEY (`platform_id`) REFERENCES `lti_platforms`(`id`) ON DELETE cascade ON UPDATE no action;