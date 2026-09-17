CREATE TABLE `oneroster_access_tokens` (
	`id` int AUTO_INCREMENT NOT NULL,
	`provider_id` int NOT NULL,
	`scope` varchar(500) NOT NULL,
	`access_token` text NOT NULL,
	`expires_at` timestamp NOT NULL,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `oneroster_access_tokens_id` PRIMARY KEY(`id`),
	CONSTRAINT `oneroster_access_token_idx` UNIQUE(`provider_id`,`scope`)
);
--> statement-breakpoint
CREATE TABLE `oneroster_providers` (
	`id` int AUTO_INCREMENT NOT NULL,
	`institution_id` int NOT NULL,
	`name` varchar(200) NOT NULL,
	`base_url` varchar(500) NOT NULL,
	`token_url` varchar(500) NOT NULL,
	`client_id` varchar(255) NOT NULL,
	`client_secret_sealed` text NOT NULL,
	`scopes` varchar(500) NOT NULL,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `oneroster_providers_id` PRIMARY KEY(`id`),
	CONSTRAINT `oneroster_provider_institution_idx` UNIQUE(`institution_id`)
);
--> statement-breakpoint
ALTER TABLE `oneroster_access_tokens` ADD CONSTRAINT `oneroster_access_tokens_provider_id_oneroster_providers_id_fk` FOREIGN KEY (`provider_id`) REFERENCES `oneroster_providers`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `oneroster_providers` ADD CONSTRAINT `oneroster_providers_institution_id_institutions_id_fk` FOREIGN KEY (`institution_id`) REFERENCES `institutions`(`id`) ON DELETE cascade ON UPDATE no action;