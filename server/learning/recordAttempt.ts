/**
 * Everything that happens when a learner answers a question.
 *
 * One answer touches six tables: the attempt itself, the concept's running
 * mastery, a mastery history point, the 3PL ability estimate, an ability
 * history point, and — when the answer was wrong and diagnosable — the
 * misconception tally. They must all move together or none of them, which is
 * why this is a single transaction rather than six calls from the router.
 *
 * The two models are deliberately independent. Mastery answers "does this
 * learner know this concept", per concept, and drives the dashboard and goal
 * roadmap. Theta answers "how hard should the next question be", across all
 * concepts, and drives the adaptive loop. Collapsing them would make a learner
 * who is strong overall look strong at the one thing they have never met.
 */

import { and, eq, sql } from 'drizzle-orm';

import { AdaptiveEngine, type MisconceptionCode, type StudentAbilityProfile } from '../../src/services/adaptiveEngine';
import { approximateAge } from '../../src/services/tiers';
import * as schema from '../../drizzle/schema';
import { raiseMasteryMilestone } from './notifications';
import { awardForAttempt, type RewardChange } from './rewards';
import type { Database } from '../db/client';
import { accuracyPercent, nextMastery } from './mastery';

export interface RecordAttemptInput {
  learnerId: number;
  problemId: number;
  sessionId?: number | null;
  submittedAnswer: string;
  responseTimeMs?: number | null;
  /** True when the attempt was queued offline and is being reconciled now. */
  wasOffline?: boolean;
  /**
   * An id the client made when the child answered.
   *
   * Supplying one makes this call safe to repeat: a second call with the same id
   * returns the first call's result instead of recording another answer.
   */
  clientId?: string | null;
}

export interface RecordAttemptResult {
  attemptId: number;
  /**
   * True when this call found the answer already recorded and returned it.
   *
   * The reconciler needs to tell "the server took it" from "the server took it
   * twice" — both are success, but only one of them should be counted as work
   * done — and a test cannot otherwise distinguish a replay that was ignored
   * from one that was silently applied again.
   */
  replayed: boolean;
  isCorrect: boolean;
  misconceptionCode: MisconceptionCode | null;
  conceptId: string;
  mastery: number;
  accuracy: number;
  ability: StudentAbilityProfile;
  /** Coins, XP and streak after this answer. Null on a replay, which pays once. */
  rewards: RewardChange | null;
}

/**
 * Records one answer and returns the learner's new state.
 *
 * Correctness is decided here, from the stored problem, and never taken from
 * the client. The browser also evaluates the answer so feedback is immediate —
 * that is a rendering concern. This is the one that counts.
 */
export async function recordAttempt(db: Database, input: RecordAttemptInput): Promise<RecordAttemptResult> {
  const [problem] = await db
    .select()
    .from(schema.problems)
    .where(eq(schema.problems.id, input.problemId))
    .limit(1);

  if (!problem) throw new Error(`No problem ${input.problemId}`);

  /*
   * Already recorded?
   *
   * Checked before the transaction rather than relying on the unique index to
   * reject the insert, because by then `updateConceptMastery` and
   * `updateAbility` have already run inside the same transaction. The rollback
   * would undo them, but the caller would see a database error where it should
   * see the original answer — and a queue that treats an error as "not yet
   * delivered" would retry the same item forever.
   *
   * The index is still there, and is what actually guarantees this: two
   * reconcilers racing on the same item both pass this check, and one of them
   * loses at the insert.
   */
  if (input.clientId) {
    const existing = await replayOf(db, input.learnerId, input.clientId);
    if (existing) return existing;
  }

  const isCorrect = normalise(input.submittedAnswer) === normalise(problem.answer);

  // A wrong answer is only diagnosable if the generator said what it means. An
  // unrecognised answer — a typed number nobody predicted — is simply wrong,
  // and inventing a misconception for it would put a false diagnosis in front
  // of a teacher.
  let misconceptionCode: MisconceptionCode | null = null;
  if (!isCorrect) {
    const [distractor] = await db
      .select()
      .from(schema.problemDistractors)
      .where(
        and(
          eq(schema.problemDistractors.problemId, problem.id),
          eq(schema.problemDistractors.value, input.submittedAnswer),
        ),
      )
      .limit(1);
    misconceptionCode = (distractor?.misconceptionCode as MisconceptionCode) ?? null;
  }

  return db.transaction(async tx => {
    const [inserted] = await tx
      .insert(schema.attempts)
      .values({
        learnerId: input.learnerId,
        sessionId: input.sessionId ?? null,
        problemId: problem.id,
        conceptId: problem.conceptId,
        submittedAnswer: input.submittedAnswer,
        isCorrect,
        misconceptionCode,
        responseTimeMs: input.responseTimeMs ?? null,
        wasOffline: input.wasOffline ?? false,
        clientId: input.clientId ?? null,
      })
      .$returningId();

    const mastery = await updateConceptMastery(tx, input.learnerId, problem.conceptId, isCorrect);

    // Inside the transaction, so a child cannot be congratulated for an answer
    // the database ends up not having.
    await raiseMasteryMilestone(tx, {
      learnerId: input.learnerId,
      conceptId: problem.conceptId,
      previousMastery: mastery.previousMastery,
      currentMastery: mastery.masteryScore,
    });

    const ability = await updateAbility(tx, input.learnerId, problem, isCorrect, misconceptionCode);

    /*
     * After the replay check at the top of this function, and inside the same
     * transaction. Awarding before the check would let a learner mint coins by
     * losing their connection and letting the queue deliver one answer twice.
     */
    const rewards = await awardForAttempt(tx, { learnerId: input.learnerId, isCorrect });

    if (!isCorrect && misconceptionCode) {
      await tx
        .insert(schema.learnerMisconceptions)
        .values({
          learnerId: input.learnerId,
          misconceptionCode,
          observedCount: 1,
          lastObservedAt: new Date(),
        })
        .onDuplicateKeyUpdate({
          set: {
            observedCount: sql`${schema.learnerMisconceptions.observedCount} + 1`,
            lastObservedAt: new Date(),
          },
        });
    }

    return {
      attemptId: inserted.id,
      replayed: false,
      isCorrect,
      misconceptionCode,
      conceptId: problem.conceptId,
      mastery: mastery.masteryScore,
      accuracy: mastery.accuracy,
      ability,
      rewards,
    };
  });
}

/**
 * A stored ability row as the engine's profile.
 *
 * Shared by the live path and the replay path. The confidence interval is
 * derived rather than stored, so computing it in two places is how the number a
 * replay returns quietly stops matching the number the original answer did.
 */
function profileFromRow(row: typeof schema.learnerAbility.$inferSelect): StudentAbilityProfile {
  const theta = Number(row.theta);
  const standardError = Number(row.standardError);
  return {
    theta,
    standardError,
    dynamicLevel: Number(row.dynamicLevel),
    eloRating: row.eloRating,
    historyCount: row.historyCount,
    // The tallies live in their own table for classroom-level questions; the
    // engine only reads this map to add to it, and the write below is the row
    // that counts.
    misconceptionsMap: {} as StudentAbilityProfile['misconceptionsMap'],
    confidenceInterval: [theta - 1.96 * standardError, theta + 1.96 * standardError],
  };
}

/**
 * The result of an answer that was already recorded under this client id.
 *
 * Rebuilt from the stored attempt and the learner's *current* mastery and
 * ability, not from what they were at the time. A reconciler replaying an item
 * wants to know where the learner stands now; returning the historical figures
 * would hand the client numbers older than ones it may already have shown.
 */
async function replayOf(
  db: Database,
  learnerId: number,
  clientId: string,
): Promise<RecordAttemptResult | null> {
  const [attempt] = await db
    .select()
    .from(schema.attempts)
    .where(and(eq(schema.attempts.learnerId, learnerId), eq(schema.attempts.clientId, clientId)))
    .limit(1);
  if (!attempt) return null;

  const [mastery] = await db
    .select()
    .from(schema.learnerConceptMastery)
    .where(
      and(
        eq(schema.learnerConceptMastery.learnerId, learnerId),
        eq(schema.learnerConceptMastery.conceptId, attempt.conceptId),
      ),
    )
    .limit(1);

  const [ability] = await db
    .select()
    .from(schema.learnerAbility)
    .where(eq(schema.learnerAbility.learnerId, learnerId))
    .limit(1);

  return {
    attemptId: attempt.id,
    replayed: true,
    isCorrect: attempt.isCorrect,
    misconceptionCode: (attempt.misconceptionCode as MisconceptionCode) ?? null,
    conceptId: attempt.conceptId,
    mastery: mastery?.masteryScore ?? 0,
    accuracy: mastery?.accuracy ?? 0,
    // An ability row always exists by the time an attempt does, since
    // `updateAbility` writes one in the same transaction. `blankProfile` is the
    // answer if that ever stops being true, rather than a zeroed profile that
    // would read as a learner who has done nothing.
    ability: ability ? profileFromRow(ability) : await blankProfile(db, learnerId),
    // Null rather than the current totals: a replay earns nothing, and handing
    // back a balance would read to the caller as "this answer paid that".
    rewards: null,
  };
}

type Tx = Parameters<Parameters<Database['transaction']>[0]>[0];

/**
 * Moves the concept's running mastery and records a history point.
 *
 * The running total is stored rather than recomputed from `attempts`. The donor
 * engine recomputed from raw attempts capped at 180, so a concept mastered
 * months ago eventually read as a confident zero and the goal roadmap marked a
 * finished prerequisite unfinished.
 */
async function updateConceptMastery(tx: Tx, learnerId: number, conceptId: string, isCorrect: boolean) {
  const [existing] = await tx
    .select()
    .from(schema.learnerConceptMastery)
    .where(
      and(
        eq(schema.learnerConceptMastery.learnerId, learnerId),
        eq(schema.learnerConceptMastery.conceptId, conceptId),
      ),
    )
    .limit(1);

  const priorAttempts = existing?.attemptCount ?? 0;
  const priorCorrect = Math.round(((existing?.accuracy ?? 0) / 100) * priorAttempts);

  const attemptCount = priorAttempts + 1;
  const correctCount = priorCorrect + (isCorrect ? 1 : 0);
  const masteryScore = nextMastery(existing?.masteryScore ?? 0, isCorrect, priorAttempts);
  const accuracy = accuracyPercent(correctCount, attemptCount);

  if (existing) {
    await tx
      .update(schema.learnerConceptMastery)
      .set({ masteryScore, accuracy, attemptCount })
      .where(eq(schema.learnerConceptMastery.id, existing.id));
  } else {
    await tx
      .insert(schema.learnerConceptMastery)
      .values({ learnerId, conceptId, masteryScore, accuracy, attemptCount });
  }

  await tx.insert(schema.conceptMasteryHistory).values({ learnerId, conceptId, masteryScore, accuracy });

  // `previousMastery` so the caller can see a *crossing* rather than a level.
  // A notification raised on `masteryScore >= 80` alone fires on every answer
  // after the first time a concept is mastered.
  return { masteryScore, accuracy, attemptCount, previousMastery: existing?.masteryScore ?? 0 };
}

/**
 * Advances the 3PL estimate using the same engine the client uses.
 *
 * `AdaptiveEngine` is imported from `src/` rather than reimplemented. It is pure
 * and already covered by its own suite; a second copy on the server would drift
 * from the first and the learner would see one number while the database held
 * another.
 */
async function updateAbility(
  tx: Tx,
  learnerId: number,
  problem: typeof schema.problems.$inferSelect,
  isCorrect: boolean,
  misconceptionCode: MisconceptionCode | null,
): Promise<StudentAbilityProfile> {
  const [row] = await tx
    .select()
    .from(schema.learnerAbility)
    .where(eq(schema.learnerAbility.learnerId, learnerId))
    .limit(1);

  const current: StudentAbilityProfile = row ? profileFromRow(row) : await blankProfile(tx, learnerId);

  const updated = AdaptiveEngine.updateAbility(current, {
    itemParams: {
      // An uncalibrated authored item is treated as average difficulty with
      // four-option guessing, which is what it is until it has been answered
      // enough times to say otherwise.
      discrimination: Number(problem.irtDiscrimination ?? 1.0),
      difficulty: Number(problem.irtDifficulty ?? 0),
      pseudoGuessing: Number(problem.irtPseudoGuessing ?? 0.25),
    },
    isCorrect,
    misconceptionCode,
  });

  const values = {
    theta: updated.theta.toString(),
    standardError: updated.standardError.toString(),
    dynamicLevel: updated.dynamicLevel.toString(),
    eloRating: updated.eloRating,
    historyCount: updated.historyCount,
  };

  if (row) {
    await tx.update(schema.learnerAbility).set(values).where(eq(schema.learnerAbility.id, row.id));
  } else {
    await tx.insert(schema.learnerAbility).values({ learnerId, ...values });
  }

  await tx.insert(schema.learnerAbilityHistory).values({
    learnerId,
    theta: values.theta,
    standardError: values.standardError,
    eloRating: values.eloRating,
  });

  return updated;
}

/**
 * The ability a learner starts from, before any evidence.
 *
 * Seeded from the learner's own age. This used to return
 * `createInitialProfile(10)` with a comment claiming the seeding belonged at
 * learner creation — but nothing seeded it there, so *every* learner began at a
 * ten-year-old's ability regardless of age. A five-year-old's first answer moved
 * her from -1.2 to -0.8 and her level from 2.0 to 4.3, and her next questions
 * were pitched for a ten-year-old.
 *
 * It is one query, on the first attempt of a learner's life, on the branch where
 * no ability row exists yet. That is a fair price for not mis-pitching a child's
 * first session.
 */
// `Tx | Database` because this only reads. The live path passes its transaction
// handle so it sees the row it just wrote; the replay path has no transaction
// and does not need one.
async function blankProfile(tx: Tx | Database, learnerId: number): Promise<StudentAbilityProfile> {
  const [learner] = await tx
    .select({ birthYear: schema.learners.birthYear })
    .from(schema.learners)
    .where(eq(schema.learners.id, learnerId))
    .limit(1);

  // A learner who cannot be read here cannot have an attempt recorded either —
  // the foreign key sees to that — so this is defensive rather than reachable.
  const age = learner ? approximateAge(learner.birthYear) : 10;
  return AdaptiveEngine.createInitialProfile(age);
}

/**
 * Compares answers the way a person would.
 *
 * `x = 3` and `X = 3 ` are the same answer; a learner should not lose a mark to
 * a trailing space. Anything beyond case and whitespace — treating `1/-1` as
 * `-1`, say — is deliberately *not* done here: the generator integrity gate
 * guarantees no two options are the same value, so an answer that differs from
 * the correct one differs in substance.
 */
function normalise(answer: string): string {
  return answer.trim().replace(/\s+/g, ' ').toLowerCase();
}
