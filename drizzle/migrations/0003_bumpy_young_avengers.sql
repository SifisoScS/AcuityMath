CREATE TABLE `magic_link_tokens` (
	`id` int AUTO_INCREMENT NOT NULL,
	`email` varchar(320) NOT NULL,
	`token_hash` varchar(64) NOT NULL,
	`expires_at` timestamp NOT NULL,
	`consumed_at` timestamp,
	`requested_from_ip` varchar(64),
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `magic_link_tokens_id` PRIMARY KEY(`id`),
	CONSTRAINT `magic_link_hash_idx` UNIQUE(`token_hash`)
);
--> statement-breakpoint
CREATE INDEX `magic_link_email_idx` ON `magic_link_tokens` (`email`,`created_at`);