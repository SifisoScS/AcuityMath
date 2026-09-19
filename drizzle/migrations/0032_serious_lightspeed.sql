CREATE TABLE `corpus_seeds` (
	`id` int NOT NULL,
	`fingerprint` varchar(64) NOT NULL,
	`seeded_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `corpus_seeds_id` PRIMARY KEY(`id`)
);
