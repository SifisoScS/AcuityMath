ALTER TABLE `learner_ability` MODIFY COLUMN `theta` decimal(6,3) NOT NULL DEFAULT '0';--> statement-breakpoint
ALTER TABLE `learner_ability` MODIFY COLUMN `standard_error` decimal(5,3) NOT NULL DEFAULT '0.85';--> statement-breakpoint
ALTER TABLE `learner_ability` MODIFY COLUMN `dynamic_level` decimal(4,2) NOT NULL DEFAULT '5.5';--> statement-breakpoint
ALTER TABLE `learner_ability_history` MODIFY COLUMN `theta` decimal(6,3) NOT NULL;--> statement-breakpoint
ALTER TABLE `learner_ability_history` MODIFY COLUMN `standard_error` decimal(5,3) NOT NULL;--> statement-breakpoint
ALTER TABLE `problems` MODIFY COLUMN `irt_discrimination` decimal(5,3);--> statement-breakpoint
ALTER TABLE `problems` MODIFY COLUMN `irt_difficulty` decimal(6,3);--> statement-breakpoint
ALTER TABLE `problems` MODIFY COLUMN `irt_pseudo_guessing` decimal(4,3);