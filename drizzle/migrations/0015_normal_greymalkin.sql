CREATE TABLE `lti_deployments` (
	`id` int AUTO_INCREMENT NOT NULL,
	`platform_id` int NOT NULL,
	`deployment_id` varchar(255) NOT NULL,
	`institution_id` int NOT NULL,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `lti_deployments_id` PRIMARY KEY(`id`),
	CONSTRAINT `lti_deployment_idx` UNIQUE(`platform_id`,`deployment_id`)
);
--> statement-breakpoint
CREATE TABLE `lti_platforms` (
	`id` int AUTO_INCREMENT NOT NULL,
	`issuer` varchar(255) NOT NULL,
	`client_id` varchar(255) NOT NULL,
	`name` varchar(200) NOT NULL,
	`auth_login_url` varchar(500) NOT NULL,
	`auth_token_url` varchar(500) NOT NULL,
	`keyset_url` varchar(500) NOT NULL,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `lti_platforms_id` PRIMARY KEY(`id`),
	CONSTRAINT `lti_platform_idx` UNIQUE(`issuer`,`client_id`)
);
--> statement-breakpoint
ALTER TABLE `lti_deployments` ADD CONSTRAINT `lti_deployments_platform_id_lti_platforms_id_fk` FOREIGN KEY (`platform_id`) REFERENCES `lti_platforms`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `lti_deployments` ADD CONSTRAINT `lti_deployments_institution_id_institutions_id_fk` FOREIGN KEY (`institution_id`) REFERENCES `institutions`(`id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `lti_deployment_institution_idx` ON `lti_deployments` (`institution_id`);