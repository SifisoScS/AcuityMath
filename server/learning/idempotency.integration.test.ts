// @vitest-environment node

/**
 * Replaying an answer must not count it twice.
 *
 * This is the whole foundation of the offline queue. A queue retries whatever it
 * is not certain was delivered — a request that timed out, a tab closed
 * mid-flight, a reconciler that ran twice — and if the server treats a retry as
 * a fresh answer, mastery and the 3PL estimate move a second time for one
 * question.
 *
 * That is not a duplicate row a report can filter out afterwards. The running
 * scores have already absorbed it, `concept_mastery_history` has a point that
 * never happened, and there is no way back to what they should have been. So the
 * tests here are mostly about what does *not* change on a replay.
 */

import { and, eq } from 'drizzle-orm';
import type { MySql2Database } from 'drizzle-orm/mysql2';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import * as schema from '../../drizzle/schema';
import { createTestDatabase, type TestDatabase } from '../test-support/database';
import { recordAttempt } from './recordAttempt';
import { ensureGeneratorConcepts, serveNextProblem } from './serveProblem';

const DATABASE_URL = process.env.DATABASE_URL;
if (process.env.CI && !DATABASE_URL) {
  throw new Error('DATABASE_URL is unset in CI; this suite would skip while covering nothing.');
}
const describeWithDb = DATABASE_URL ? describe : describe.skip;

describeWithDb('replaying an attempt', () => {
  let harness: TestDatabase;
  let db: MySql2Database<typeof schema>;
  let maya: number;
  let leo: number;

  beforeAll(async () => {
    harness = await createTestDatabase('idempotency');
    db = harness.db;
  }, 60_000);

  afterAll(async () => {
    await harness?.close();
  });

  beforeEach(async () => {
    await harness.reset();
    await ensureGeneratorConcepts(db);

    await db.insert(schema.users).values({ email: 'sarah@example.test', role: 'parent' });
    const [sarah] = await db
      .select()
      .from(schema.users)
      .where(eq(schema.users.email, 'sarah@example.test'));

    await db.insert(schema.learners).values([
      { guardianId: sarah.id, displayName: 'Maya', birthYear: 2016 },
      { guardianId: sarah.id, displayName: 'Leo', birthYear: 2016 },
    ]);
    const children = await db
      .select()
      .from(schema.learners)
      .where(eq(schema.learners.guardianId, sarah.id));
    maya = children.find(row => row.displayName === 'Maya')!.id;
    leo = children.find(row => row.displayName === 'Leo')!.id;
  }, 60_000);

  /** Serves a real problem and returns its id and correct answer. */
  async function aProblem(learnerId: number) {
    const [learner] = await db
      .select()
      .from(schema.learners)
      .where(eq(schema.learners.id, learnerId));
    const served = await serveNextProblem(db, learner);
    const [stored] = await db
      .select({ answer: schema.problems.answer, choices: schema.problems.choices })
      .from(schema.problems)
      .where(eq(schema.problems.id, served.problemId))
      .limit(1);
    return {
      problemId: served.problemId,
      correct: stored.answer,
      wrong: (stored.choices as string[] | null)?.find(c => c !== stored.answer) ?? 'nope',
    };
  }

  const attemptsOf = (learnerId: number) =>
    db.select().from(schema.attempts).where(eq(schema.attempts.learnerId, learnerId));

  const abilityOf = async (learnerId: number) => {
    const [row] = await db
      .select()
      .from(schema.learnerAbility)
      .where(eq(schema.learnerAbility.learnerId, learnerId));
    return row;
  };

  describe('with a client id', () => {
    it('records the answer once, however many times it is sent', async () => {
      const problem = await aProblem(maya);
      const send = () =>
        recordAttempt(db, {
          learnerId: maya,
          problemId: problem.problemId,
          submittedAnswer: problem.correct,
          responseTimeMs: 5_000,
          clientId: 'offline-attempt-0001',
        });

      await send();
      await send();
      await send();

      expect(await attemptsOf(maya)).toHaveLength(1);
    });

    it('leaves mastery exactly where the first answer left it', async () => {
      const problem = await aProblem(maya);
      const input = {
        learnerId: maya,
        problemId: problem.problemId,
        submittedAnswer: problem.correct,
        clientId: 'offline-attempt-0002',
      };

      const first = await recordAttempt(db, input);
      const second = await recordAttempt(db, input);

      expect(second.mastery).toBe(first.mastery);
      expect(second.accuracy).toBe(first.accuracy);
    });

    it('leaves the ability estimate where the first answer left it', async () => {
      // The 3PL update is the one that cannot be undone: theta, the ELO rating
      // and the answered count all move, and a second application of the same
      // answer is indistinguishable afterwards from genuine extra practice.
      const problem = await aProblem(maya);
      const input = {
        learnerId: maya,
        problemId: problem.problemId,
        submittedAnswer: problem.correct,
        clientId: 'offline-attempt-0003',
      };

      await recordAttempt(db, input);
      const after = await abilityOf(maya);

      await recordAttempt(db, input);
      const afterReplay = await abilityOf(maya);

      expect(afterReplay.theta).toBe(after.theta);
      expect(afterReplay.eloRating).toBe(after.eloRating);
      expect(afterReplay.historyCount).toBe(after.historyCount);
    });

    it('adds no point to the mastery history', async () => {
      // A chart drawn from this table would show a step that never happened.
      const problem = await aProblem(maya);
      const input = {
        learnerId: maya,
        problemId: problem.problemId,
        submittedAnswer: problem.correct,
        clientId: 'offline-attempt-0004',
      };

      await recordAttempt(db, input);
      const before = await db
        .select()
        .from(schema.conceptMasteryHistory)
        .where(eq(schema.conceptMasteryHistory.learnerId, maya));

      await recordAttempt(db, input);
      const after = await db
        .select()
        .from(schema.conceptMasteryHistory)
        .where(eq(schema.conceptMasteryHistory.learnerId, maya));

      expect(after).toHaveLength(before.length);
    });

    it('says which call did the work', async () => {
      // The reconciler counts what it delivered, not what it re-sent.
      const problem = await aProblem(maya);
      const input = {
        learnerId: maya,
        problemId: problem.problemId,
        submittedAnswer: problem.correct,
        clientId: 'offline-attempt-0005',
      };

      expect((await recordAttempt(db, input)).replayed).toBe(false);
      expect((await recordAttempt(db, input)).replayed).toBe(true);
    });

    it('returns the original verdict, not a re-evaluation of the resent answer', async () => {
      // A queue must not be able to change a recorded answer by resending the
      // same id with different content.
      const problem = await aProblem(maya);
      const first = await recordAttempt(db, {
        learnerId: maya,
        problemId: problem.problemId,
        submittedAnswer: problem.wrong,
        clientId: 'offline-attempt-0006',
      });
      expect(first.isCorrect).toBe(false);

      const replay = await recordAttempt(db, {
        learnerId: maya,
        problemId: problem.problemId,
        submittedAnswer: problem.correct,
        clientId: 'offline-attempt-0006',
      });

      expect(replay.isCorrect).toBe(false);
      expect(replay.attemptId).toBe(first.attemptId);
      const [stored] = await attemptsOf(maya);
      expect(stored.submittedAnswer).toBe(problem.wrong);
    });

    it('reports the learner current standing on a replay', async () => {
      // Not the standing at the time of the original answer: a reconciler
      // replaying an item wants to know where the child is now, and returning
      // historical figures would hand back numbers older than ones the client
      // may already be showing.
      const first = await aProblem(maya);
      await recordAttempt(db, {
        learnerId: maya,
        problemId: first.problemId,
        submittedAnswer: first.correct,
        clientId: 'offline-attempt-0007',
      });

      // More practice moves the estimate on.
      for (let i = 0; i < 4; i++) {
        const next = await aProblem(maya);
        await recordAttempt(db, {
          learnerId: maya,
          problemId: next.problemId,
          submittedAnswer: next.correct,
        });
      }
      const now = await abilityOf(maya);

      const replay = await recordAttempt(db, {
        learnerId: maya,
        problemId: first.problemId,
        submittedAnswer: first.correct,
        clientId: 'offline-attempt-0007',
      });

      expect(replay.ability.historyCount).toBe(now.historyCount);
      expect(replay.ability.eloRating).toBe(now.eloRating);
    });
  });

  describe('scoping', () => {
    it('does not let one child id silence another child answer', async () => {
      // Two children on a shared tablet generate ids independently. If the
      // uniqueness were global, a collision would drop a real answer — the
      // second child would be told their answer was already recorded.
      const forMaya = await aProblem(maya);
      const forLeo = await aProblem(leo);

      await recordAttempt(db, {
        learnerId: maya,
        problemId: forMaya.problemId,
        submittedAnswer: forMaya.correct,
        clientId: 'collision',
      });
      const leoResult = await recordAttempt(db, {
        learnerId: leo,
        problemId: forLeo.problemId,
        submittedAnswer: forLeo.correct,
        clientId: 'collision',
      });

      expect(leoResult.replayed).toBe(false);
      expect(await attemptsOf(maya)).toHaveLength(1);
      expect(await attemptsOf(leo)).toHaveLength(1);
    });

    it('is enforced by the database, not only by the check', async () => {
      // The pre-flight lookup is what returns the original result; the unique
      // index is what makes it true under a race. Two reconcilers running at
      // once both pass the lookup, and one must lose at the insert.
      const problem = await aProblem(maya);
      await recordAttempt(db, {
        learnerId: maya,
        problemId: problem.problemId,
        submittedAnswer: problem.correct,
        clientId: 'enforced-by-the-index',
      });

      await expect(
        db.insert(schema.attempts).values({
          learnerId: maya,
          problemId: problem.problemId,
          conceptId: (await attemptsOf(maya))[0].conceptId,
          submittedAnswer: problem.correct,
          isCorrect: true,
          clientId: 'enforced-by-the-index',
        }),
      ).rejects.toThrow();
    });
  });

  describe('without a client id', () => {
    it('records every answer, because each is a real one', async () => {
      // A learner answering online sends no id and has nothing to reconcile.
      // Deduplicating these would silently drop the second of two identical
      // answers to the same question, which is ordinary practice.
      const problem = await aProblem(maya);
      for (let i = 0; i < 3; i++) {
        await recordAttempt(db, {
          learnerId: maya,
          problemId: problem.problemId,
          submittedAnswer: problem.correct,
        });
      }
      expect(await attemptsOf(maya)).toHaveLength(3);
    });

    it('stores null rather than an empty string', async () => {
      // MySQL treats NULLs as distinct in a unique index; empty strings are not
      // distinct, so a second attempt would collide with the first.
      const problem = await aProblem(maya);
      await recordAttempt(db, {
        learnerId: maya,
        problemId: problem.problemId,
        submittedAnswer: problem.correct,
      });
      const [stored] = await attemptsOf(maya);
      expect(stored.clientId).toBeNull();
    });
  });

  describe('what the offline flag records', () => {
    it('marks an attempt that was queued', async () => {
      const problem = await aProblem(maya);
      await recordAttempt(db, {
        learnerId: maya,
        problemId: problem.problemId,
        submittedAnswer: problem.correct,
        wasOffline: true,
        clientId: 'queued-while-offline',
      });

      const [stored] = await db
        .select()
        .from(schema.attempts)
        .where(and(eq(schema.attempts.learnerId, maya), eq(schema.attempts.wasOffline, true)));
      expect(stored).toBeTruthy();
      expect(stored.clientId).toBe('queued-while-offline');
    });
  });
});
