// @vitest-environment node

/**
 * Coins, XP and streaks against a real MySQL.
 *
 * `learner_rewards` had a table from B1 and no writer, so every child's coins,
 * XP, streak and shields read zero on every dashboard. The rule itself is tested
 * in `rewards.test.ts`; this covers the parts only a database can answer — that
 * the row is created, that it is updated rather than duplicated, and above all
 * that a replayed answer is paid for exactly once.
 */

import { eq } from 'drizzle-orm';
import type { MySql2Database } from 'drizzle-orm/mysql2';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import * as schema from '../../drizzle/schema';
import { createTestDatabase, type TestDatabase } from '../test-support/database';
import { grantConsentForAllFamilies } from '../test-support/consent';
import { recordAttempt } from './recordAttempt';
import { COINS_FOR_CORRECT, XP_FOR_ATTEMPT, XP_FOR_CORRECT, spendCoins } from './rewards';
import { ensureGeneratorConcepts, serveNextProblem } from './serveProblem';

const DATABASE_URL = process.env.DATABASE_URL;
if (process.env.CI && !DATABASE_URL) {
  throw new Error('DATABASE_URL is unset in CI; this suite would skip while covering nothing.');
}
const describeWithDb = DATABASE_URL ? describe : describe.skip;

describeWithDb('rewards', () => {
  let harness: TestDatabase;
  let db: MySql2Database<typeof schema>;
  let maya: number;

  beforeAll(async () => {
    harness = await createTestDatabase('rewards');
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
    await db
      .insert(schema.learners)
      .values({ guardianId: sarah.id, displayName: 'Maya', birthYear: 2016 });
    const [learner] = await db
      .select()
      .from(schema.learners)
      .where(eq(schema.learners.guardianId, sarah.id));
    maya = learner.id;
  
    // Graft E1b refuses to record an under-13's practice without consent.
    // The learners exist by here, so this covers them.
    await grantConsentForAllFamilies(db);
}, 60_000);

  async function aProblem() {
    const [learner] = await db.select().from(schema.learners).where(eq(schema.learners.id, maya));
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

  const rewardsOf = async () => {
    const [row] = await db
      .select()
      .from(schema.learnerRewards)
      .where(eq(schema.learnerRewards.learnerId, maya));
    return row;
  };

  describe('answering', () => {
    it('creates the row on the first answer', async () => {
      // There was no row for any learner, ever, which is why every dashboard
      // read zero.
      expect(await rewardsOf()).toBeUndefined();

      const problem = await aProblem();
      await recordAttempt(db, {
        learnerId: maya,
        problemId: problem.problemId,
        submittedAnswer: problem.correct,
      });

      const row = await rewardsOf();
      expect(row.coins).toBe(COINS_FOR_CORRECT);
      expect(row.xp).toBe(XP_FOR_CORRECT);
      expect(row.streakDays).toBe(1);
    });

    it('pays experience for a wrong answer but no coins', async () => {
      // A schedule that pays only for correctness teaches a child to avoid the
      // questions that would move them.
      const problem = await aProblem();
      await recordAttempt(db, {
        learnerId: maya,
        problemId: problem.problemId,
        submittedAnswer: problem.wrong,
      });

      const row = await rewardsOf();
      expect(row.xp).toBe(XP_FOR_ATTEMPT);
      expect(row.coins).toBe(0);
    });

    it('accumulates across answers, in one row', async () => {
      for (let i = 0; i < 3; i++) {
        const problem = await aProblem();
        await recordAttempt(db, {
          learnerId: maya,
          problemId: problem.problemId,
          submittedAnswer: problem.correct,
        });
      }

      const rows = await db
        .select()
        .from(schema.learnerRewards)
        .where(eq(schema.learnerRewards.learnerId, maya));
      expect(rows).toHaveLength(1);
      expect(rows[0].coins).toBe(COINS_FOR_CORRECT * 3);
      expect(rows[0].xp).toBe(XP_FOR_CORRECT * 3);
    });

    it('counts one day however many answers', async () => {
      for (let i = 0; i < 4; i++) {
        const problem = await aProblem();
        await recordAttempt(db, {
          learnerId: maya,
          problemId: problem.problemId,
          submittedAnswer: problem.correct,
        });
      }
      expect((await rewardsOf()).streakDays).toBe(1);
    });

    it('reports what the answer earned', async () => {
      const problem = await aProblem();
      const result = await recordAttempt(db, {
        learnerId: maya,
        problemId: problem.problemId,
        submittedAnswer: problem.correct,
      });

      expect(result.rewards).toMatchObject({
        coinsEarned: COINS_FOR_CORRECT,
        xpEarned: XP_FOR_CORRECT,
        streakExtended: true,
      });
    });
  });

  describe('a replayed answer', () => {
    it('is paid for exactly once', async () => {
      /*
       * The reason the award happens after the replay check. Without it an
       * offline learner could mint coins by losing their connection and letting
       * the queue deliver the same answer repeatedly — and unlike a duplicate
       * row, a balance cannot be corrected after the fact.
       */
      const problem = await aProblem();
      const input = {
        learnerId: maya,
        problemId: problem.problemId,
        submittedAnswer: problem.correct,
        clientId: 'queued-offline-0001',
      };

      await recordAttempt(db, input);
      const after = await rewardsOf();

      await recordAttempt(db, input);
      await recordAttempt(db, input);
      const afterReplays = await rewardsOf();

      expect(afterReplays.coins).toBe(after.coins);
      expect(afterReplays.xp).toBe(after.xp);
    });

    it('reports that it earned nothing', async () => {
      // Handing back the current balance would read to the caller as "this
      // answer paid that".
      const problem = await aProblem();
      const input = {
        learnerId: maya,
        problemId: problem.problemId,
        submittedAnswer: problem.correct,
        clientId: 'queued-offline-0002',
      };

      expect((await recordAttempt(db, input)).rewards).not.toBeNull();
      expect((await recordAttempt(db, input)).rewards).toBeNull();
    });
  });

  describe('spending coins', () => {
    async function give(coins: number) {
      await db.insert(schema.learnerRewards).values({ learnerId: maya, coins, xp: 0 });
    }

    it('takes the price when the learner can afford it', async () => {
      await give(100);
      expect(await spendCoins(db, maya, 40)).toBe(true);
      expect((await rewardsOf()).coins).toBe(60);
    });

    it('refuses rather than going negative', async () => {
      await give(10);
      expect(await spendCoins(db, maya, 40)).toBe(false);
      expect((await rewardsOf()).coins).toBe(10);
    });

    it('lets the learner spend everything', async () => {
      await give(40);
      expect(await spendCoins(db, maya, 40)).toBe(true);
      expect((await rewardsOf()).coins).toBe(0);
    });

    it('refuses a learner with no row at all', async () => {
      expect(await spendCoins(db, maya, 1)).toBe(false);
    });

    it('cannot be spent twice concurrently', async () => {
      /*
       * Two tabs pressing buy at the same moment. A read-then-write would have
       * both read 40, both find it sufficient, and both succeed — leaving the
       * child with one balance and two purchases.
       */
      await give(40);
      const results = await Promise.all([
        spendCoins(db, maya, 40),
        spendCoins(db, maya, 40),
      ]);

      expect(results.filter(Boolean)).toHaveLength(1);
      expect((await rewardsOf()).coins).toBe(0);
    });
  });
});
