CREATE TABLE `hint_error_modes` (
	`id` int AUTO_INCREMENT NOT NULL,
	`hint_id` int NOT NULL,
	`error_mode` varchar(60) NOT NULL,
	CONSTRAINT `hint_error_modes_id` PRIMARY KEY(`id`),
	CONSTRAINT `hint_error_mode_idx` UNIQUE(`hint_id`,`error_mode`)
);
--> statement-breakpoint
ALTER TABLE `hints` ADD `cognitive_state` varchar(40);--> statement-breakpoint
ALTER TABLE `hints` ADD `hint_style` varchar(40);--> statement-breakpoint
ALTER TABLE `hints` ADD `difficulty_level` smallint;--> statement-breakpoint
ALTER TABLE `problems` ADD `external_id` varchar(120);--> statement-breakpoint
ALTER TABLE `problems` ADD `problem_type` varchar(40);--> statement-breakpoint
ALTER TABLE `problems` ADD `cognitive_load` smallint;--> statement-breakpoint
ALTER TABLE `problems` ADD `context_label` varchar(120);--> statement-breakpoint
ALTER TABLE `problems` ADD `variant_index` smallint;--> statement-breakpoint
ALTER TABLE `problems` ADD `interleaved` boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `problems` ADD `verification_expression` text;--> statement-breakpoint
ALTER TABLE `problems` ADD CONSTRAINT `problems_external_idx` UNIQUE(`external_id`);--> statement-breakpoint
ALTER TABLE `hint_error_modes` ADD CONSTRAINT `hint_error_modes_hint_id_hints_id_fk` FOREIGN KEY (`hint_id`) REFERENCES `hints`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `hints_state_idx` ON `hints` (`concept_id`,`cognitive_state`);