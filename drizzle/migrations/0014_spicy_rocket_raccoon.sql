CREATE TABLE `lti_keys` (
	`id` int AUTO_INCREMENT NOT NULL,
	`kid` varchar(64) NOT NULL,
	`public_jwk` json NOT NULL,
	`private_pem` text NOT NULL,
	`is_active` boolean NOT NULL DEFAULT false,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`activated_at` timestamp,
	`retired_at` timestamp,
	CONSTRAINT `lti_keys_id` PRIMARY KEY(`id`),
	CONSTRAINT `lti_key_kid_idx` UNIQUE(`kid`)
);
