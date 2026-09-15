CREATE TABLE `lti_deep_link_requests` (
	`id` int AUTO_INCREMENT NOT NULL,
	`platform_id` int NOT NULL,
	`user_id` int NOT NULL,
	`deployment_id` varchar(255) NOT NULL,
	`return_url` varchar(1000) NOT NULL,
	`accept_types` varchar(500) NOT NULL DEFAULT '',
	`accept_multiple` boolean NOT NULL DEFAULT false,
	`data` text,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`expires_at` timestamp NOT NULL,
	`consumed_at` timestamp,
	CONSTRAINT `lti_deep_link_requests_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `lti_deep_link_requests` ADD CONSTRAINT `lti_deep_link_requests_platform_id_lti_platforms_id_fk` FOREIGN KEY (`platform_id`) REFERENCES `lti_platforms`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `lti_deep_link_requests` ADD CONSTRAINT `lti_deep_link_requests_user_id_users_id_fk` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `lti_dl_user_idx` ON `lti_deep_link_requests` (`user_id`,`expires_at`);