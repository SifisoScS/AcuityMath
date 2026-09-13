CREATE TABLE `institution_agreements` (
	`id` int AUTO_INCREMENT NOT NULL,
	`institution_id` int NOT NULL,
	`signed_by_user_id` int NOT NULL,
	`signatory_name` varchar(200) NOT NULL,
	`signatory_title` varchar(200) NOT NULL,
	`signatory_email` varchar(320) NOT NULL,
	`agreement_version` varchar(32) NOT NULL,
	`agreement_sha256` varchar(64) NOT NULL,
	`signed_at` timestamp NOT NULL DEFAULT (now()),
	`expires_at` timestamp,
	`withdrawn_at` timestamp,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `institution_agreements_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `consent_events` ADD `agreement_id` int;--> statement-breakpoint
ALTER TABLE `institution_agreements` ADD CONSTRAINT `institution_agreements_institution_id_institutions_id_fk` FOREIGN KEY (`institution_id`) REFERENCES `institutions`(`id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `institution_agreements` ADD CONSTRAINT `institution_agreements_signed_by_user_id_users_id_fk` FOREIGN KEY (`signed_by_user_id`) REFERENCES `users`(`id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `institution_agreement_institution_idx` ON `institution_agreements` (`institution_id`);--> statement-breakpoint
CREATE INDEX `institution_agreement_active_idx` ON `institution_agreements` (`institution_id`,`withdrawn_at`);--> statement-breakpoint
ALTER TABLE `consent_events` ADD CONSTRAINT `consent_method_matches_evidence` CHECK ((`method` = 'institutional_agreement') = (`agreement_id` is not null));--> statement-breakpoint
ALTER TABLE `consent_events` ADD CONSTRAINT `consent_events_agreement_id_institution_agreements_id_fk` FOREIGN KEY (`agreement_id`) REFERENCES `institution_agreements`(`id`) ON DELETE restrict ON UPDATE no action;