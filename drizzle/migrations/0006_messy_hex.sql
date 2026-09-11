ALTER TABLE `attempts` ADD `client_id` varchar(64);--> statement-breakpoint
ALTER TABLE `attempts` ADD CONSTRAINT `attempts_client_idx` UNIQUE(`learner_id`,`client_id`);