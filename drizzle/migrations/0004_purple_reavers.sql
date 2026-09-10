ALTER TABLE `users` ADD `step_up_pin_hash` varchar(255);--> statement-breakpoint
ALTER TABLE `users` ADD `step_up_pin_set_at` timestamp;--> statement-breakpoint
ALTER TABLE `users` ADD `step_up_failed_attempts` smallint DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `users` ADD `step_up_locked_until` timestamp;