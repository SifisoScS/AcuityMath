ALTER TABLE `learners` ADD `archived_reason` enum('requested','roster_departure');--> statement-breakpoint
--
-- Backfilled before the constraint, not after. Drizzle generates the column and
-- the CHECK as two statements with nothing between them, which is correct on an
-- empty database and fails on any that already holds an archived child — the
-- new column is null for every existing row, and the constraint forbids exactly
-- that.
--
-- `requested` is the conservative reading: every archival that predates D3 was
-- made by a person through a surface, because nothing else could make one. It
-- is also the safe direction to be wrong in, since a sync may never undo a
-- `requested` archival.
--
UPDATE `learners` SET `archived_reason` = 'requested' WHERE `archived_at` is not null;--> statement-breakpoint
ALTER TABLE `learners` ADD CONSTRAINT `learner_archival_has_a_reason` CHECK ((`archived_at` is null) = (`archived_reason` is null));