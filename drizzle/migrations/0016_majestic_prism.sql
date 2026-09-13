CREATE TABLE `lti_launch_states` (
	`id` int AUTO_INCREMENT NOT NULL,
	`state` varchar(64) NOT NULL,
	`nonce` varchar(64) NOT NULL,
	`platform_id` int NOT NULL,
	`target_link_uri` varchar(500) NOT NULL,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`expires_at` timestamp NOT NULL,
	`consumed_at` timestamp,
	CONSTRAINT `lti_launch_states_id` PRIMARY KEY(`id`),
	CONSTRAINT `lti_state_idx` UNIQUE(`state`)
);
--> statement-breakpoint
ALTER TABLE `lti_launch_states` ADD CONSTRAINT `lti_launch_states_platform_id_lti_platforms_id_fk` FOREIGN KEY (`platform_id`) REFERENCES `lti_platforms`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `lti_state_expiry_idx` ON `lti_launch_states` (`expires_at`);