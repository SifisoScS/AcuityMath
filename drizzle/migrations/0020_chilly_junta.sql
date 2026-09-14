ALTER TABLE `lti_identities` MODIFY COLUMN `user_id` int;--> statement-breakpoint
ALTER TABLE `lti_identities` ADD `learner_id` int;--> statement-breakpoint
ALTER TABLE `lti_identities` ADD CONSTRAINT `lti_identity_is_one_person` CHECK ((`user_id` is null) <> (`learner_id` is null));--> statement-breakpoint
ALTER TABLE `lti_identities` ADD CONSTRAINT `lti_identities_learner_id_learners_id_fk` FOREIGN KEY (`learner_id`) REFERENCES `learners`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `lti_identity_learner_idx` ON `lti_identities` (`learner_id`);