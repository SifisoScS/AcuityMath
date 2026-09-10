// @vitest-environment node

/**
 * What a parent is shown, against a real MySQL.
 *
 * The shape these fill used to be a literal in `storage.ts`: seven days of
 * invented activity and a recommended action somebody typed. So the tests worth
 * having are the ones proving each figure traces to something the child did —
 * and that the fields with no honest source stay at zero rather than being
 * filled in to look complete.
 */

import { eq } from 'drizzle-orm';
import type { MySql2Database } from 'drizzle-orm/mysql2';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import * as schema from '../../drizzle/schema';
import { issueElevation, ELEVATION_COOKIE } from '../auth/session';
import { appRouter } from '../trpc/routers';
import type { Context } from '../trpc';
import { createTestDatabase, type TestDatabase } from '../test-support/database';
import { learnerAnalytics } from './analytics';
import { recordAttempt } from './recordAttempt';
import { serveNextProblem } from './serveProblem';

const DATABASE_URL = process.env.DATABASE_URL;
if (process.env.CI && !DATABASE_URL) {
  throw new Error('DATABASE_URL is unset in CI; this suite would skip while covering nothing.');
}
const describeWithDb = DATABASE_URL ? describe : describe.skip;

describeWithDb('parent analytics', () => {
  let harness: TestDatabase;
  let db: MySql2Database<typeof schema>;
  let sarah: { id: number; email: string; name: string | null; role: 'parent' };
  let maya: number;

  beforeAll(async () => {
    harness = await createTestDatabase('analytics');
    db = harness.db;
  }, 60_000);

  afterAll(async () => {
    await harness?.close();
  });

  beforeEach(async () => {
    await harness.reset();
    process.env.JWT_SECRET = 'a-test-secret-that-is-comfortably-long-enough-to-pass';

    await db.insert(schema.users).values({ email: 'sarah@example.test', role: 'parent' });
    const [row] = await db.select().from(schema.users).where(eq(schema.users.email, 'sarah@example.test'));
    sarah = { id: row.id, email: row.email, name: row.name, role: 'parent' };

    await db.insert(schema.learners).values({ guardianId: sarah.id, displayName: 'Maya', birthYear: 2016 });
    const [learner] = await db.select().from(schema.learners).where(eq(schema.learners.guardianId, sarah.id));
    maya = learner.id;
  }, 30_000);

  /** Answers `count` questions, getting `correct` of them right. */
  async function practise(learnerId: number, count: number, correct: number) {
    const [learner] = await db.select().from(schema.learners).where(eq(schema.learners.id, learnerId));
    for (let i = 0; i < count; i++) {
      const problem = await serveNextProblem(db, learner);
      const [stored] = await db
        .select({ answer: schema.problems.answer, choices: schema.problems.choices })
        .from(schema.problems)
        .where(eq(schema.problems.id, problem.problemId))
        .limit(1);

      const shouldBeCorrect = i < correct;
      const wrong = (stored.choices as string[] | null)?.find(c => c !== stored.answer) ?? 'nope';

      await recordAttempt(db, {
        learnerId,
        problemId: problem.problemId,
        submittedAnswer: shouldBeCorrect ? stored.answer : wrong,
        responseTimeMs: 30_000,
      });
    }
  }

  describe('a learner who has done nothing', () => {
    it('reports zeroes rather than an encouraging fiction', async () => {
      const analytics = await learnerAnalytics(db, maya);

      expect(analytics.totalTimeMinutes).toBe(0);
      expect(analytics.masteryDomains).toEqual([]);
      expect(analytics.strengths).toEqual([]);
      expect(analytics.areasToImprove).toEqual([]);
    });

    it('says there is not enough practice to advise on', async () => {
      // The old literal always had a recommendation, whoever the child was.
      const analytics = await learnerAnalytics(db, maya);
      expect(analytics.recommendedAction).toMatch(/not enough practice/i);
    });

    it('still returns seven days', async () => {
      // A chart that omits empty days compresses a fortnight of silence into a
      // tidy line.
      const analytics = await learnerAnalytics(db, maya);
      expect(analytics.weeklyActivity).toHaveLength(7);
      expect(analytics.weeklyActivity.every(day => day.problemsSolved === 0)).toBe(true);
    });
  });

  describe('a learner who has practised', () => {
    beforeEach(async () => {
      await practise(maya, 8, 6);
    });

    it('counts the questions they actually answered', async () => {
      const analytics = await learnerAnalytics(db, maya);
      const solved = analytics.weeklyActivity.reduce((sum, day) => sum + day.problemsSolved, 0);
      expect(solved).toBe(8);
    });

    it('reports time from the answers, not from the tab being open', async () => {
      // Eight answers at thirty seconds each. Screen time would count a child
      // who wandered off, and telling a parent that is practice would be
      // flattering and false.
      const analytics = await learnerAnalytics(db, maya);
      expect(analytics.totalTimeMinutes).toBe(4);
    });

    it('reports accuracy that matches the attempts', async () => {
      const analytics = await learnerAnalytics(db, maya);
      const today = analytics.weeklyActivity[analytics.weeklyActivity.length - 1];
      expect(today.problemsSolved).toBe(8);
      expect(today.accuracy).toBe(75);
    });

    it('names mastery domains from the concepts practised', async () => {
      const analytics = await learnerAnalytics(db, maya);
      expect(analytics.masteryDomains.length).toBeGreaterThan(0);

      const titles = await db.select({ title: schema.concepts.title }).from(schema.concepts);
      for (const domain of analytics.masteryDomains) {
        expect(titles.some(row => row.title === domain.domain)).toBe(true);
        expect(domain.score).toBeGreaterThanOrEqual(0);
        expect(domain.score).toBeLessThanOrEqual(100);
      }
    });

    it('labels each domain consistently with its own score', async () => {
      // The band and the number must agree; a component repeating the
      // thresholds is how "Mastered" ends up over 44%.
      const analytics = await learnerAnalytics(db, maya);
      for (const domain of analytics.masteryDomains) {
        if (domain.score >= 80) expect(domain.level).toBe('Mastered');
        else if (domain.score >= 50) expect(domain.level).toBe('Developing');
        else expect(domain.level).toBe('Target Area');
      }
    });

    it('recommends the weakest thing, by name and number', async () => {
      const analytics = await learnerAnalytics(db, maya);
      expect(analytics.recommendedAction).toMatch(/\d+%|secure/);
    });

    it('says nothing about a concept answered once or twice', async () => {
      // A single lucky answer is not a strength.
      const analytics = await learnerAnalytics(db, maya);
      const mastery = await db
        .select()
        .from(schema.learnerConceptMastery)
        .where(eq(schema.learnerConceptMastery.learnerId, maya));

      const thin = mastery.filter(row => row.attemptCount < 3);
      const titles = await db.select().from(schema.concepts);
      for (const row of thin) {
        const title = titles.find(c => c.id === row.conceptId)?.title;
        expect(analytics.strengths).not.toContain(title);
        expect(analytics.areasToImprove).not.toContain(title);
      }
    });
  });

  describe('fields with no honest source', () => {
    it('leaves focus alerts at zero', async () => {
      // Nothing records a lapse in attention. Inventing a count is the one
      // made-up number that would discredit the rest.
      await practise(maya, 5, 3);
      expect((await learnerAnalytics(db, maya)).focusAlertsCount).toBe(0);
    });

    it('reports a screen-time limit only when one is set', async () => {
      expect((await learnerAnalytics(db, maya)).screenTimeLimitMinutes).toBe(0);

      await db.insert(schema.screenTimeRules).values({ learnerId: maya, dailyLimitMinutes: 35 });
      expect((await learnerAnalytics(db, maya)).screenTimeLimitMinutes).toBe(35);
    });
  });

  describe('who may read it', () => {
    const callerFor = (user: typeof sarah | null, elevation?: string) =>
      appRouter.createCaller({
        db,
        user,
        headers: elevation ? { cookie: `${ELEVATION_COOKIE}=${elevation}` } : {},
        setCookie: () => {},
      } satisfies Context);

    it('refuses a signed-in parent who has not stepped up', async () => {
      // A signed-in session on a family tablet is not proof that the person
      // reading a nine-year-old's error patterns is their parent.
      await expect(callerFor(sarah).analytics.forLearner({ learnerId: maya })).rejects.toThrow(
        /STEP_UP_REQUIRED/,
      );
    });

    it('allows it once they have', async () => {
      const elevated = callerFor(sarah, await issueElevation(sarah.id));
      await expect(elevated.analytics.forLearner({ learnerId: maya })).resolves.toBeTruthy();
    });

    it('still refuses another family"s child, elevated or not', async () => {
      await db.insert(schema.users).values({ email: 'other@example.test', role: 'parent' });
      const [other] = await db.select().from(schema.users).where(eq(schema.users.email, 'other@example.test'));
      await db.insert(schema.learners).values({
        guardianId: other.id,
        displayName: 'Someone else',
        birthYear: 2016,
      });
      const [stranger] = await db
        .select()
        .from(schema.learners)
        .where(eq(schema.learners.guardianId, other.id));

      const elevated = callerFor(sarah, await issueElevation(sarah.id));
      await expect(elevated.analytics.forLearner({ learnerId: stranger.id })).rejects.toThrow(
        /No such learner/,
      );
    });

    it('returns the whole family only to an elevated caller', async () => {
      await expect(callerFor(sarah).analytics.forFamily()).rejects.toThrow(/STEP_UP_REQUIRED/);

      const elevated = callerFor(sarah, await issueElevation(sarah.id));
      const family = await elevated.analytics.forFamily();
      expect(Object.keys(family)).toEqual([String(maya)]);
    });
  });
});
