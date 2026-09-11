ALTER TABLE `consent_events` MODIFY COLUMN `method` enum('credit_card_auth','email_plus_verification','signed_form','institutional_agreement','email_verified_name_attested') NOT NULL;--> statement-breakpoint
ALTER TABLE `consent_events` ADD `policy_version` varchar(32) NOT NULL;--> statement-breakpoint
ALTER TABLE `consent_events` ADD `policy_sha256` varchar(64) NOT NULL;--> statement-breakpoint
ALTER TABLE `consent_events` ADD `attested_name` varchar(200) NOT NULL;--> statement-breakpoint
ALTER TABLE `consent_events` ADD `verified_email` varchar(320) NOT NULL;--> statement-breakpoint
ALTER TABLE `consent_events` ADD `email_verified_at` timestamp;--> statement-breakpoint
ALTER TABLE `consent_events` ADD `second_step_sent` boolean DEFAULT false NOT NULL;