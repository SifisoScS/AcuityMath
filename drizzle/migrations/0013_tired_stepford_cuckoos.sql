ALTER TABLE `learner_ability` MODIFY COLUMN `elo_rating` int NOT NULL DEFAULT 1000;
--> statement-breakpoint
-- Existing ratings were computed as 1200 + 300*theta, a mapping the
-- specification never had. Recomputed from theta with the same clamp
-- `eloForTheta` applies, so a stored rating and a freshly derived one agree.
UPDATE `learner_ability`
   SET `elo_rating` = ROUND(1000 + GREATEST(-3, LEAST(3, `theta`)) * 250);
--> statement-breakpoint
UPDATE `learner_ability_history`
   SET `elo_rating` = ROUND(1000 + GREATEST(-3, LEAST(3, `theta`)) * 250);
