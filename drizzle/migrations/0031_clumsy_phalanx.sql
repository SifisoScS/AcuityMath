CREATE TABLE `oneroster_sync_runs` (
	`id` int AUTO_INCREMENT NOT NULL,
	`provider_id` int NOT NULL,
	`started_at` timestamp NOT NULL,
	`finished_at` timestamp,
	`outcome` enum('completed','refused') NOT NULL,
	`refused_reason` varchar(80),
	`partial` boolean NOT NULL DEFAULT false,
	`counts` json,
	CONSTRAINT `oneroster_sync_runs_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `oneroster_sync_runs` ADD CONSTRAINT `oneroster_sync_runs_provider_id_oneroster_providers_id_fk` FOREIGN KEY (`provider_id`) REFERENCES `oneroster_providers`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `oneroster_sync_run_provider_idx` ON `oneroster_sync_runs` (`provider_id`,`started_at`);