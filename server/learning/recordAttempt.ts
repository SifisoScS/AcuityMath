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
}

export interface RecordAttemptResult {
  attemptId: number;
  isCorrect: boolean;
  misconceptionCode: MisconceptionCode | null;
  conceptId: string;
  mastery: number;
  accuracy: number;
  ability: StudentAbilityProfile;
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
      })
      .$returningId();

    const mastery = await updateConceptMastery(tx, input.learnerId, problem.conceptId, isCorrect);
    const ability = await updateAbility(tx, input.learnerId, problem, isCorrect, misconceptionCode);

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
      isCorrect,
      misconceptionCode,
      conceptId: problem.conceptId,
      mastery: mastery.masteryScore,
      accuracy: mastery.accuracy,
      ability,
    };
  });
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

  return { masteryScore, accuracy, attemptCount };
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

  const current: StudentAbilityProfile = row
    ? {
        theta: Number(row.theta),
        standardError: Number(row.standardError),
        dynamicLevel: Number(row.dynamicLevel),
        eloRating: row.eloRating,
        historyCount: row.historyCount,
        // The tallies live in their own table for classroom-level questions;
        // the engine only reads this map to add to it, and the write below is
        // the row that counts.
        misconceptionsMap: {} as StudentAbilityProfile['misconceptionsMap'],
        confidenceInterval: [Number(row.theta) - 1.96 * Number(row.standardError), Number(row.theta) + 1.96 * Number(row.standardError)],
      }
    : await blankProfile(tx, learnerId);

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
async function blankProfile(tx: Tx, learnerId: number): Promise<StudentAbilityProfile> {
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
