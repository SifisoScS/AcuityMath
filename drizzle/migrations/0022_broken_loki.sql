CREATE TABLE `lti_contexts` (
	`id` int AUTO_INCREMENT NOT NULL,
	`deployment_id` int NOT NULL,
	`context_id` varchar(255) NOT NULL,
	`title` varchar(255),
	`memberships_url` varchar(1000),
	`last_synced_at` timestamp,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `lti_contexts_id` PRIMARY KEY(`id`),
	CONSTRAINT `lti_context_idx` UNIQUE(`deployment_id`,`context_id`)
);
--> statement-breakpoint
ALTER TABLE `lti_contexts` ADD CONSTRAINT `lti_contexts_deployment_id_lti_deployments_id_fk` FOREIGN KEY (`deployment_id`) REFERENCES `lti_deployments`(`id`) ON DELETE cascade ON UPDATE no action;