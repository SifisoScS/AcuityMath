/**
 * Everything this product has recorded about one child.
 *
 * Two signed promises rest on this file and neither had anything behind it.
 *
 * The family consent policy — the text whose hash is stored against every
 * consent row — says **"You can see everything recorded about your child."** The
 * institutional agreement says a district **"may request an export or the
 * deletion of any pupil's records at any time."** Both were true only in the
 * sense that nobody had asked.
 *
 * The hard part is not assembling the data. It is that "everything" is a claim
 * that decays: the next learner-scoped table somebody adds will not be here, the
 * export will still work, and the promise will quietly become false. So the set
 * of tables is not a list maintained by hand — it is checked against the same
 * `LEARNER_SCOPED` inventory `drizzle/schema.test.ts` already enforces, and a
 * table missing from either fails the build.
 */

import { eq } from 'drizzle-orm';
import type { MySql2Database } from 'drizzle-orm/mysql2';

import * as schema from '../../drizzle/schema';

type Db = MySql2Database<typeof schema>;

/**
 * Every table holding a child's records, and the column that names them.
 *
 * Keyed by SQL table name so the completeness test can compare these keys
 * against `LEARNER_SCOPED` directly. A column per entry rather than an
 * assumption, because `notifications` names its subject differently and
 * assuming `learner_id` everywhere would have silently exported nothing from it.
 */
const LEARNER_TABLES = {
  learner_access_tokens: {
    table: schema.learnerAccessTokens,
    column: schema.learnerAccessTokens.learnerId,
  },
  consent_events: { table: schema.consentEvents, column: schema.consentEvents.learnerId },
  classroom_learners: {
    table: schema.classroomLearners,
    column: schema.classroomLearners.learnerId,
  },
  practice_sessions: {
    table: schema.practiceSessions,
    column: schema.practiceSessions.learnerId,
  },
  attempts: { table: schema.attempts, column: schema.attempts.learnerId },
  learner_concept_mastery: {
    table: schema.learnerConceptMastery,
    column: schema.learnerConceptMastery.learnerId,
  },
  concept_mastery_history: {
    table: schema.conceptMasteryHistory,
    column: schema.conceptMasteryHistory.learnerId,
  },
  learner_ability: { table: schema.learnerAbility, column: schema.learnerAbility.learnerId },
  learner_ability_history: {
    table: schema.learnerAbilityHistory,
    column: schema.learnerAbilityHistory.learnerId,
  },
  learner_misconceptions: {
    table: schema.learnerMisconceptions,
    column: schema.learnerMisconceptions.learnerId,
  },
  screen_time_rules: {
    table: schema.screenTimeRules,
    column: schema.screenTimeRules.learnerId,
  },
  screen_time_usage: {
    table: schema.screenTimeUsage,
    column: schema.screenTimeUsage.learnerId,
  },
  assignment_targets: {
    table: schema.assignmentTargets,
    column: schema.assignmentTargets.learnerId,
  },
  learner_rewards: { table: schema.learnerRewards, column: schema.learnerRewards.learnerId },
  learner_avatars: { table: schema.learnerAvatars, column: schema.learnerAvatars.learnerId },
} as const;

/**
 * Tables that hold records *about* a child without being theirs alone.
 *
 * `notifications` is the only one. A guardian's copy of "Ada mastered halves" is
 * addressed to the adult and is about the child, and `about_learner_id` is the
 * column that says so. Omitting it would mean an export that claimed to be
 * everything while leaving out every message this product ever sent about them.
 */
const ABOUT_LEARNER_TABLES = {
  notifications: {
    table: schema.notifications,
    column: schema.notifications.aboutLearnerId,
  },
} as const;

export const EXPORTED_TABLES = Object.keys(LEARNER_TABLES);
export const EXPORTED_ABOUT_TABLES = Object.keys(ABOUT_LEARNER_TABLES);

export interface LearnerExport {
  /** When it was taken, so a file found later can be dated. */
  exportedAt: Date;
  /** The version of this format, so a reader can tell what to expect. */
  format: 'acuitymath-learner-export/1';
  learner: typeof schema.learners.$inferSelect;
  /** Every learner-scoped table, keyed by its SQL name. */
  records: Record<string, unknown[]>;
  /** Tables holding rows *about* this child, such as notifications. */
  about: Record<string, unknown[]>;
}

/**
 * Assembles the export.
 *
 * **Entitlement is not decided here.** The caller establishes who may ask —
 * `elevatedLearnerProcedure` in the tRPC layer — and this function answers about
 * whichever child it is given. Mixing the two would mean a second place that
 * decides who may reach a child, and two such places eventually disagree.
 */
export async function exportLearner(db: Db, learnerId: number): Promise<LearnerExport | null> {
  const [learner] = await db
    .select()
    .from(schema.learners)
    .where(eq(schema.learners.id, learnerId))
    .limit(1);

  /*
   * An archived child still exports. Archiving is a deletion *request* being
   * honoured in the product's own surfaces; it does not erase the rows, and a
   * family or district asking what is still held deserves the true answer
   * rather than an empty one.
   */
  if (!learner) return null;

  const records: Record<string, unknown[]> = {};
  for (const [name, { table, column }] of Object.entries(LEARNER_TABLES)) {
    records[name] = await db.select().from(table).where(eq(column, learnerId));
  }

  const about: Record<string, unknown[]> = {};
  for (const [name, { table, column }] of Object.entries(ABOUT_LEARNER_TABLES)) {
    about[name] = await db.select().from(table).where(eq(column, learnerId));
  }

  return {
    exportedAt: new Date(),
    format: 'acuitymath-learner-export/1',
    learner,
    records,
    about,
  };
}

/**
 * How many rows an export would contain, by table.
 *
 * For a surface that wants to say "this will contain 412 answers" before
 * somebody downloads anything. Counted the same way the export is assembled, so
 * the number and the file cannot disagree.
 */
export async function exportSummary(
  db: Db,
  learnerId: number,
): Promise<Record<string, number> | null> {
  const full = await exportLearner(db, learnerId);
  if (!full) return null;

  return Object.fromEntries(
    [...Object.entries(full.records), ...Object.entries(full.about)].map(([name, rows]) => [
      name,
      rows.length,
    ]),
  );
}
