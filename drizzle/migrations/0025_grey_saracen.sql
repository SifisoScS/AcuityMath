CREATE TABLE `lti_line_items` (
	`id` int AUTO_INCREMENT NOT NULL,
	`context_id` int NOT NULL,
	`resource_link_id` varchar(255) NOT NULL,
	`line_item_url` varchar(1000) NOT NULL,
	`label` varchar(255) NOT NULL,
	`score_maximum` decimal(8,2) NOT NULL,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `lti_line_items_id` PRIMARY KEY(`id`),
	CONSTRAINT `lti_line_item_idx` UNIQUE(`context_id`,`resource_link_id`)
);
--> statement-breakpoint
ALTER TABLE `lti_contexts` ADD `line_items_url` varchar(1000);--> statement-breakpoint
ALTER TABLE `lti_line_items` ADD CONSTRAINT `lti_line_items_context_id_lti_contexts_id_fk` FOREIGN KEY (`context_id`) REFERENCES `lti_contexts`(`id`) ON DELETE cascade ON UPDATE no action;