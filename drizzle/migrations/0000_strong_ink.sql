CREATE TABLE `assignment_targets` (
	`id` int AUTO_INCREMENT NOT NULL,
	`assignment_id` int NOT NULL,
	`learner_id` int NOT NULL,
	`status` enum('pending','completed') NOT NULL DEFAULT 'pending',
	`completed_at` timestamp,
	CONSTRAINT `assignment_targets_id` PRIMARY KEY(`id`),
	CONSTRAINT `assignment_target_idx` UNIQUE(`assignment_id`,`learner_id`)
);
--> statement-breakpoint
CREATE TABLE `assignments` (
	`id` int AUTO_INCREMENT NOT NULL,
	`assigned_by_user_id` int NOT NULL,
	`classroom_id` int,
	`title` varchar(200) NOT NULL,
	`description` text,
	`concept_id` varchar(120),
	`due_date` date,
	`reward_coins` smallint NOT NULL DEFAULT 0,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `assignments_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `attempts` (
	`id` int AUTO_INCREMENT NOT NULL,
	`learner_id` int NOT NULL,
	`session_id` int,
	`problem_id` int NOT NULL,
	`concept_id` varchar(120) NOT NULL,
	`submitted_answer` varchar(200) NOT NULL,
	`is_correct` boolean NOT NULL,
	`misconception_code` varchar(60),
	`response_time_ms` int,
	`was_offline` boolean NOT NULL DEFAULT false,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `attempts_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `classroom_learners` (
	`id` int AUTO_INCREMENT NOT NULL,
	`classroom_id` int NOT NULL,
	`learner_id` int NOT NULL,
	`enrolled_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `classroom_learners_id` PRIMARY KEY(`id`),
	CONSTRAINT `classroom_learner_idx` UNIQUE(`classroom_id`,`learner_id`)
);
--> statement-breakpoint
CREATE TABLE `classrooms` (
	`id` int AUTO_INCREMENT NOT NULL,
	`teacher_id` int NOT NULL,
	`name` varchar(200) NOT NULL,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `classrooms_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `concept_mastery_history` (
	`id` int AUTO_INCREMENT NOT NULL,
	`learner_id` int NOT NULL,
	`concept_id` varchar(120) NOT NULL,
	`mastery_score` smallint NOT NULL,
	`accuracy` smallint NOT NULL,
	`recorded_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `concept_mastery_history_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `concept_prerequisites` (
	`id` int AUTO_INCREMENT NOT NULL,
	`concept_id` varchar(120) NOT NULL,
	`prerequisite_id` varchar(120) NOT NULL,
	CONSTRAINT `concept_prerequisites_id` PRIMARY KEY(`id`),
	CONSTRAINT `concept_prereq_idx` UNIQUE(`concept_id`,`prerequisite_id`)
);
--> statement-breakpoint
CREATE TABLE `concepts` (
	`id` varchar(120) NOT NULL,
	`strand` varchar(80) NOT NULL,
	`title` varchar(200) NOT NULL,
	`description` text,
	`tier` enum('early','elementary','middle','high') NOT NULL,
	`age_band_low` smallint NOT NULL,
	`age_band_high` smallint NOT NULL,
	`standard_code` varchar(60),
	`sort_order` int NOT NULL DEFAULT 0,
	CONSTRAINT `concepts_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `consent_events` (
	`id` int AUTO_INCREMENT NOT NULL,
	`learner_id` int NOT NULL,
	`granted_by_user_id` int NOT NULL,
	`decision` enum('granted','withdrawn') NOT NULL,
	`method` enum('credit_card_auth','email_plus_verification','signed_form','institutional_agreement') NOT NULL,
	`evidence` varchar(500),
	`recorded_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `consent_events_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `hints` (
	`id` int AUTO_INCREMENT NOT NULL,
	`concept_id` varchar(120) NOT NULL,
	`body` text NOT NULL,
	`misconception_code` varchar(60),
	`scaffold_level` smallint NOT NULL DEFAULT 1,
	`verified` boolean NOT NULL DEFAULT false,
	CONSTRAINT `hints_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `learner_ability` (
	`id` int AUTO_INCREMENT NOT NULL,
	`learner_id` int NOT NULL,
	`theta` varchar(12) NOT NULL DEFAULT '0',
	`standard_error` varchar(12) NOT NULL DEFAULT '0.85',
	`dynamic_level` varchar(8) NOT NULL DEFAULT '5.5',
	`elo_rating` int NOT NULL DEFAULT 1200,
	`history_count` int NOT NULL DEFAULT 0,
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `learner_ability_id` PRIMARY KEY(`id`),
	CONSTRAINT `ability_learner_idx` UNIQUE(`learner_id`)
);
--> statement-breakpoint
CREATE TABLE `learner_ability_history` (
	`id` int AUTO_INCREMENT NOT NULL,
	`learner_id` int NOT NULL,
	`theta` varchar(12) NOT NULL,
	`standard_error` varchar(12) NOT NULL,
	`elo_rating` int NOT NULL,
	`recorded_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `learner_ability_history_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `learner_access_tokens` (
	`id` int AUTO_INCREMENT NOT NULL,
	`learner_id` int NOT NULL,
	`kind` enum('pin','qr_badge','picture_sequence') NOT NULL,
	`secret_hash` varchar(128) NOT NULL,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`revoked_at` timestamp,
	CONSTRAINT `learner_access_tokens_id` PRIMARY KEY(`id`),
	CONSTRAINT `learner_access_kind_idx` UNIQUE(`learner_id`,`kind`)
);
--> statement-breakpoint
CREATE TABLE `learner_concept_mastery` (
	`id` int AUTO_INCREMENT NOT NULL,
	`learner_id` int NOT NULL,
	`concept_id` varchar(120) NOT NULL,
	`mastery_score` smallint NOT NULL DEFAULT 0,
	`accuracy` smallint NOT NULL DEFAULT 0,
	`attempt_count` int NOT NULL DEFAULT 0,
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `learner_concept_mastery_id` PRIMARY KEY(`id`),
	CONSTRAINT `mastery_learner_concept_idx` UNIQUE(`learner_id`,`concept_id`)
);
--> statement-breakpoint
CREATE TABLE `learner_misconceptions` (
	`id` int AUTO_INCREMENT NOT NULL,
	`learner_id` int NOT NULL,
	`misconception_code` varchar(60) NOT NULL,
	`observed_count` int NOT NULL DEFAULT 0,
	`last_observed_at` timestamp,
	CONSTRAINT `learner_misconceptions_id` PRIMARY KEY(`id`),
	CONSTRAINT `misconception_learner_idx` UNIQUE(`learner_id`,`misconception_code`)
);
--> statement-breakpoint
CREATE TABLE `learner_rewards` (
	`id` int AUTO_INCREMENT NOT NULL,
	`learner_id` int NOT NULL,
	`coins` int NOT NULL DEFAULT 0,
	`xp` int NOT NULL DEFAULT 0,
	`streak_days` smallint NOT NULL DEFAULT 0,
	`streak_shields` smallint NOT NULL DEFAULT 0,
	`last_practiced_on` date,
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `learner_rewards_id` PRIMARY KEY(`id`),
	CONSTRAINT `rewards_learner_idx` UNIQUE(`learner_id`)
);
--> statement-breakpoint
CREATE TABLE `learners` (
	`id` int AUTO_INCREMENT NOT NULL,
	`guardian_id` int NOT NULL,
	`display_name` varchar(100) NOT NULL,
	`birth_year` smallint NOT NULL,
	`avatar` varchar(16) NOT NULL DEFAULT '🌱',
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	`archived_at` timestamp,
	CONSTRAINT `learners_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `practice_sessions` (
	`id` int AUTO_INCREMENT NOT NULL,
	`learner_id` int NOT NULL,
	`target_length` smallint NOT NULL DEFAULT 8,
	`started_at` timestamp NOT NULL DEFAULT (now()),
	`completed_at` timestamp,
	CONSTRAINT `practice_sessions_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `problem_distractors` (
	`id` int AUTO_INCREMENT NOT NULL,
	`problem_id` int NOT NULL,
	`value` varchar(200) NOT NULL,
	`misconception_code` varchar(60) NOT NULL,
	CONSTRAINT `problem_distractors_id` PRIMARY KEY(`id`),
	CONSTRAINT `problem_distractor_idx` UNIQUE(`problem_id`,`value`)
);
--> statement-breakpoint
CREATE TABLE `problems` (
	`id` int AUTO_INCREMENT NOT NULL,
	`concept_id` varchar(120) NOT NULL,
	`source` enum('authored','generated') NOT NULL,
	`generator_kind` varchar(40),
	`prompt` text NOT NULL,
	`answer` varchar(200) NOT NULL,
	`answer_type` enum('numeric','multiple_choice','text') NOT NULL DEFAULT 'multiple_choice',
	`choices` json,
	`explanation` text NOT NULL,
	`hint` text NOT NULL,
	`difficulty` smallint NOT NULL DEFAULT 5,
	`visual` json,
	`irt_discrimination` varchar(12),
	`irt_difficulty` varchar(12),
	`irt_pseudo_guessing` varchar(12),
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `problems_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `screen_time_rules` (
	`id` int AUTO_INCREMENT NOT NULL,
	`learner_id` int NOT NULL,
	`daily_limit_minutes` smallint NOT NULL DEFAULT 45,
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `screen_time_rules_id` PRIMARY KEY(`id`),
	CONSTRAINT `screen_time_learner_idx` UNIQUE(`learner_id`)
);
--> statement-breakpoint
CREATE TABLE `screen_time_usage` (
	`id` int AUTO_INCREMENT NOT NULL,
	`learner_id` int NOT NULL,
	`day` date NOT NULL,
	`minutes_spent` smallint NOT NULL DEFAULT 0,
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `screen_time_usage_id` PRIMARY KEY(`id`),
	CONSTRAINT `screen_time_day_idx` UNIQUE(`learner_id`,`day`)
);
--> statement-breakpoint
CREATE TABLE `users` (
	`id` int AUTO_INCREMENT NOT NULL,
	`email` varchar(320) NOT NULL,
	`name` varchar(200),
	`role` enum('parent','teacher','admin') NOT NULL DEFAULT 'parent',
	`institution_id` int,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	`last_signed_in_at` timestamp,
	CONSTRAINT `users_id` PRIMARY KEY(`id`),
	CONSTRAINT `users_email_idx` UNIQUE(`email`)
);
--> statement-breakpoint
ALTER TABLE `assignment_targets` ADD CONSTRAINT `assignment_targets_assignment_id_assignments_id_fk` FOREIGN KEY (`assignment_id`) REFERENCES `assignments`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `assignment_targets` ADD CONSTRAINT `assignment_targets_learner_id_learners_id_fk` FOREIGN KEY (`learner_id`) REFERENCES `learners`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `assignments` ADD CONSTRAINT `assignments_assigned_by_user_id_users_id_fk` FOREIGN KEY (`assigned_by_user_id`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `assignments` ADD CONSTRAINT `assignments_classroom_id_classrooms_id_fk` FOREIGN KEY (`classroom_id`) REFERENCES `classrooms`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `assignments` ADD CONSTRAINT `assignments_concept_id_concepts_id_fk` FOREIGN KEY (`concept_id`) REFERENCES `concepts`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `attempts` ADD CONSTRAINT `attempts_learner_id_learners_id_fk` FOREIGN KEY (`learner_id`) REFERENCES `learners`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `attempts` ADD CONSTRAINT `attempts_session_id_practice_sessions_id_fk` FOREIGN KEY (`session_id`) REFERENCES `practice_sessions`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `attempts` ADD CONSTRAINT `attempts_problem_id_problems_id_fk` FOREIGN KEY (`problem_id`) REFERENCES `problems`(`id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `attempts` ADD CONSTRAINT `attempts_concept_id_concepts_id_fk` FOREIGN KEY (`concept_id`) REFERENCES `concepts`(`id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `classroom_learners` ADD CONSTRAINT `classroom_learners_classroom_id_classrooms_id_fk` FOREIGN KEY (`classroom_id`) REFERENCES `classrooms`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `classroom_learners` ADD CONSTRAINT `classroom_learners_learner_id_learners_id_fk` FOREIGN KEY (`learner_id`) REFERENCES `learners`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `classrooms` ADD CONSTRAINT `classrooms_teacher_id_users_id_fk` FOREIGN KEY (`teacher_id`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `concept_mastery_history` ADD CONSTRAINT `concept_mastery_history_learner_id_learners_id_fk` FOREIGN KEY (`learner_id`) REFERENCES `learners`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `concept_mastery_history` ADD CONSTRAINT `concept_mastery_history_concept_id_concepts_id_fk` FOREIGN KEY (`concept_id`) REFERENCES `concepts`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `concept_prerequisites` ADD CONSTRAINT `concept_prerequisites_concept_id_concepts_id_fk` FOREIGN KEY (`concept_id`) REFERENCES `concepts`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `concept_prerequisites` ADD CONSTRAINT `concept_prerequisites_prerequisite_id_concepts_id_fk` FOREIGN KEY (`prerequisite_id`) REFERENCES `concepts`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `consent_events` ADD CONSTRAINT `consent_events_learner_id_learners_id_fk` FOREIGN KEY (`learner_id`) REFERENCES `learners`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `consent_events` ADD CONSTRAINT `consent_events_granted_by_user_id_users_id_fk` FOREIGN KEY (`granted_by_user_id`) REFERENCES `users`(`id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `hints` ADD CONSTRAINT `hints_concept_id_concepts_id_fk` FOREIGN KEY (`concept_id`) REFERENCES `concepts`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `learner_ability` ADD CONSTRAINT `learner_ability_learner_id_learners_id_fk` FOREIGN KEY (`learner_id`) REFERENCES `learners`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `learner_ability_history` ADD CONSTRAINT `learner_ability_history_learner_id_learners_id_fk` FOREIGN KEY (`learner_id`) REFERENCES `learners`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `learner_access_tokens` ADD CONSTRAINT `learner_access_tokens_learner_id_learners_id_fk` FOREIGN KEY (`learner_id`) REFERENCES `learners`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `learner_concept_mastery` ADD CONSTRAINT `learner_concept_mastery_learner_id_learners_id_fk` FOREIGN KEY (`learner_id`) REFERENCES `learners`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `learner_concept_mastery` ADD CONSTRAINT `learner_concept_mastery_concept_id_concepts_id_fk` FOREIGN KEY (`concept_id`) REFERENCES `concepts`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `learner_misconceptions` ADD CONSTRAINT `learner_misconceptions_learner_id_learners_id_fk` FOREIGN KEY (`learner_id`) REFERENCES `learners`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `learner_rewards` ADD CONSTRAINT `learner_rewards_learner_id_learners_id_fk` FOREIGN KEY (`learner_id`) REFERENCES `learners`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `learners` ADD CONSTRAINT `learners_guardian_id_users_id_fk` FOREIGN KEY (`guardian_id`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `practice_sessions` ADD CONSTRAINT `practice_sessions_learner_id_learners_id_fk` FOREIGN KEY (`learner_id`) REFERENCES `learners`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `problem_distractors` ADD CONSTRAINT `problem_distractors_problem_id_problems_id_fk` FOREIGN KEY (`problem_id`) REFERENCES `problems`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `problems` ADD CONSTRAINT `problems_concept_id_concepts_id_fk` FOREIGN KEY (`concept_id`) REFERENCES `concepts`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `screen_time_rules` ADD CONSTRAINT `screen_time_rules_learner_id_learners_id_fk` FOREIGN KEY (`learner_id`) REFERENCES `learners`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `screen_time_usage` ADD CONSTRAINT `screen_time_usage_learner_id_learners_id_fk` FOREIGN KEY (`learner_id`) REFERENCES `learners`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `assignments_author_idx` ON `assignments` (`assigned_by_user_id`);--> statement-breakpoint
CREATE INDEX `attempts_learner_idx` ON `attempts` (`learner_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `attempts_concept_idx` ON `attempts` (`learner_id`,`concept_id`);--> statement-breakpoint
CREATE INDEX `attempts_session_idx` ON `attempts` (`session_id`);--> statement-breakpoint
CREATE INDEX `classrooms_teacher_idx` ON `classrooms` (`teacher_id`);--> statement-breakpoint
CREATE INDEX `mastery_history_idx` ON `concept_mastery_history` (`learner_id`,`concept_id`,`recorded_at`);--> statement-breakpoint
CREATE INDEX `concepts_tier_idx` ON `concepts` (`tier`);--> statement-breakpoint
CREATE INDEX `concepts_strand_idx` ON `concepts` (`strand`);--> statement-breakpoint
CREATE INDEX `consent_learner_idx` ON `consent_events` (`learner_id`,`recorded_at`);--> statement-breakpoint
CREATE INDEX `hints_concept_idx` ON `hints` (`concept_id`,`scaffold_level`);--> statement-breakpoint
CREATE INDEX `ability_history_idx` ON `learner_ability_history` (`learner_id`,`recorded_at`);--> statement-breakpoint
CREATE INDEX `learner_access_learner_idx` ON `learner_access_tokens` (`learner_id`);--> statement-breakpoint
CREATE INDEX `learners_guardian_idx` ON `learners` (`guardian_id`);--> statement-breakpoint
CREATE INDEX `sessions_learner_idx` ON `practice_sessions` (`learner_id`,`started_at`);--> statement-breakpoint
CREATE INDEX `problems_concept_idx` ON `problems` (`concept_id`);--> statement-breakpoint
CREATE INDEX `problems_source_idx` ON `problems` (`source`);