ALTER TABLE `learners` MODIFY COLUMN `guardian_id` int;--> statement-breakpoint
ALTER TABLE `learners` ADD `institution_id` int;--> statement-breakpoint
ALTER TABLE `learners` ADD CONSTRAINT `learner_has_exactly_one_owner` CHECK ((`guardian_id` is null) <> (`institution_id` is null));--> statement-breakpoint
ALTER TABLE `learners` ADD CONSTRAINT `learners_institution_id_institutions_id_fk` FOREIGN KEY (`institution_id`) REFERENCES `institutions`(`id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `learners_institution_idx` ON `learners` (`institution_id`);