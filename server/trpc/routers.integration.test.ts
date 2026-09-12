/**
 * The practice loop API, against a real MySQL.
 *
 * The first block is the one that matters. Every other test here would still
 * pass if the ownership check were deleted, because they all call with the right
 * learner. Authorization is only ever proven by the calls that must fail.
 */

import { eq } from 'drizzle-orm';
import { beforeAll, afterAll, beforeEach, describe, expect, it } from 'vitest';

import * as schema from '../../drizzle/schema';
import type { AuthenticatedUser } from '../auth/session';
import { createTestDatabase, type TestDatabase } from '../test-support/database';
import { grantConsentForAllFamilies } from '../test-support/consent';
import { appRouter } from './routers';
import type { Context } from './index';

const DATABASE_URL = process.env.DATABASE_URL;
if (process.env.CI && !DATABASE_URL) {
  throw new Error('DATABASE_URL is unset in CI; this suite would skip while covering nothing.');
}
const describeWithDb = DATABASE_URL ? describe : describe.skip;

describeWithDb('practice loop API', () => {
  let harness: TestDatabase;

  /**
   * A caller acting as the given user, or as nobody.
   *
   * `headers` is empty, so nothing here carries elevation. Procedures built on
   * `elevatedProcedure` are exercised in the step-up suite, where a token can
   * be minted deliberately.
   */
  const callerFor = (user: AuthenticatedUser | null) =>
    appRouter.createCaller({ db: harness.db, user, headers: {} } satisfies Context);

  let sarah: AuthenticatedUser;
  let otherParent: AuthenticatedUser;
  let admin: AuthenticatedUser;
  let maya: number;
  let leo: number;
  /** A child belonging to the *other* parent. */
  let stranger: number;

  beforeAll(async () => {
    harness = await createTestDatabase('routers');
  }, 60_000);

  afterAll(async () => {
    await harness?.close();
  });

  beforeEach(async () => {
    await harness.reset();

    const makeUser = async (email: string, role: 'parent' | 'admin'): Promise<AuthenticatedUser> => {
      const [row] = await harness.db.insert(schema.users).values({ email, name: email, role }).$returningId();
      return { id: row.id, email, name: email, role };
    };

    sarah = await makeUser('sarah@example.test', 'parent');
    otherParent = await makeUser('other@example.test', 'parent');
    admin = await makeUser('admin@example.test', 'admin');

    const makeLearner = async (guardianId: number, displayName: string, birthYear: number) => {
      const [row] = await harness.db
        .insert(schema.learners)
        .values({ guardianId, displayName, birthYear })
        .$returningId();
      return row.id;
    };

    maya = await makeLearner(sarah.id, 'Maya', 2020);
    leo = await makeLearner(sarah.id, 'Leo', 2016);
    stranger = await makeLearner(otherParent.id, 'Someone else', 2016);
  
    // Graft E1b refuses to record an under-13's practice without consent.
    // The learners exist by here, so this covers them.
    await grantConsentForAllFamilies(harness.db);
}, 30_000);

  // -------------------------------------------------------------------------
  describe('authorization', () => {
    it('refuses an unauthenticated caller', async () => {
      await expect(callerFor(null).learners.list()).rejects.toThrow(/UNAUTHORIZED|Sign in/);
    });

    it('refuses to show one parent another parent"s child', async () => {
      await expect(callerFor(sarah).learners.snapshot({ learnerId: stranger })).rejects.toThrow(/No such learner/);
    });

    it('answers the same for a child that does not exist as for one out of reach', async () => {
      // FORBIDDEN on a real id and NOT_FOUND on a fake one lets an outsider
      // enumerate the children on the platform by watching which ids differ.
      const absent = await callerFor(sarah)
        .learners.snapshot({ learnerId: 999_999 })
        .catch((error: Error) => error.message);
      const forbidden = await callerFor(sarah)
        .learners.snapshot({ learnerId: stranger })
        .catch((error: Error) => error.message);

      expect(absent).toBe(forbidden);
    });

    it('refuses every learner-scoped procedure, not only the one that was tested', async () => {
      const caller = callerFor(sarah);
      await expect(caller.practice.start({ learnerId: stranger, targetLength: 8 })).rejects.toThrow(/No such learner/);
      await expect(caller.practice.next({ learnerId: stranger })).rejects.toThrow(/No such learner/);
      await expect(
        caller.practice.submit({ learnerId: stranger, problemId: 1, answer: '3' }),
      ).rejects.toThrow(/No such learner/);
      await expect(caller.practice.complete({ learnerId: stranger, sessionId: 1 })).rejects.toThrow(
        /No such learner/,
      );
    });

    it('lists only the caller"s own children', async () => {
      const mine = await callerFor(sarah).learners.list();
      expect(mine.map(l => l.displayName).sort()).toEqual(['Leo', 'Maya']);

      const theirs = await callerFor(otherParent).learners.list();
      expect(theirs.map(l => l.displayName)).toEqual(['Someone else']);
    });

    it('lets an administrator reach any child', async () => {
      const snapshot = await callerFor(admin).learners.snapshot({ learnerId: stranger });
      expect(snapshot.learner.displayName).toBe('Someone else');
    });

    it('treats an archived child as gone', async () => {
      await harness.db
        .update(schema.learners)
        .set({ archivedAt: new Date() })
        .where(eq(schema.learners.id, maya));

      await expect(callerFor(sarah).learners.snapshot({ learnerId: maya })).rejects.toThrow(/No such learner/);
      const remaining = await callerFor(sarah).learners.list();
      expect(remaining.map(l => l.displayName)).toEqual(['Leo']);
    });

    it('will not attach an attempt to another child"s session', async () => {
      const strangerSession = await callerFor(otherParent).practice.start({
        learnerId: stranger,
        targetLength: 8,
      });
      const problem = await callerFor(sarah).practice.next({ learnerId: maya });

      await expect(
        callerFor(sarah).practice.submit({
          learnerId: maya,
          problemId: problem.problemId,
          sessionId: strangerSession.sessionId,
          answer: problem.choices[0],
        }),
      ).rejects.toThrow(/No such session/);
    });

    it('will not complete another child"s session', async () => {
      const strangerSession = await callerFor(otherParent).practice.start({
        learnerId: stranger,
        targetLength: 8,
      });
      await expect(
        callerFor(sarah).practice.complete({ learnerId: maya, sessionId: strangerSession.sessionId }),
      ).rejects.toThrow(/No such session/);
    });
  });

  // -------------------------------------------------------------------------
  describe('serving a question', () => {
    it('does not send the answer to the browser', async () => {
      // Anything this returns is readable in the network tab by the student it
      // is testing.
      const problem = await callerFor(sarah).practice.next({ learnerId: maya });
      const serialised = JSON.stringify(problem);

      expect(problem).not.toHaveProperty('answer');
      expect(problem).not.toHaveProperty('correctAnswer');
      expect(problem).not.toHaveProperty('explanation');
      expect(serialised).not.toContain('explanation');
    });

    it('stores the problem so an attempt can reference it later', async () => {
      const problem = await callerFor(sarah).practice.next({ learnerId: maya });

      const [stored] = await harness.db
        .select()
        .from(schema.problems)
        .where(eq(schema.problems.id, problem.problemId));

      expect(stored.source).toBe('generated');
      expect(stored.generatorKind).toBe(problem.conceptId);
      expect(stored.choices).toEqual(problem.choices);
      expect(stored.answer).toBeTruthy();
    });

    it('stores the diagnosed distractors alongside it', async () => {
      const problem = await callerFor(sarah).practice.next({ learnerId: maya });

      const distractors = await harness.db
        .select()
        .from(schema.problemDistractors)
        .where(eq(schema.problemDistractors.problemId, problem.problemId));

      expect(distractors).toHaveLength(3);
      const [stored] = await harness.db
        .select()
        .from(schema.problems)
        .where(eq(schema.problems.id, problem.problemId));
      expect(distractors.map(d => d.value)).not.toContain(stored.answer);
    });

    it('pitches a four-year-old and a ten-year-old differently', async () => {
      const forMaya = await callerFor(sarah).practice.next({ learnerId: maya });
      const forLeo = await callerFor(sarah).practice.next({ learnerId: leo });

      expect(forMaya.tier).toBe('early');
      expect(forLeo.tier).toBe('elementary');
    });

    it('serves the requested concept when one is named', async () => {
      const problem = await callerFor(sarah).practice.next({
        learnerId: leo,
        conceptId: 'elem-geom',
      });
      expect(problem.conceptId).toBe('elem-geom');
    });

    it('creates the generator concepts once, not once per question', async () => {
      await callerFor(sarah).practice.next({ learnerId: maya });
      await callerFor(sarah).practice.next({ learnerId: maya });

      const concepts = await harness.db.select().from(schema.concepts);
      expect(concepts).toHaveLength(12);
    });

    it('offers an unseen concept before revisiting a weak one', async () => {
      // A learner who only ever returns to their worst score never meets
      // anything new.
      const first = await callerFor(sarah).practice.next({ learnerId: leo });
      await callerFor(sarah).practice.submit({
        learnerId: leo,
        problemId: first.problemId,
        answer: 'definitely wrong',
      });

      const second = await callerFor(sarah).practice.next({ learnerId: leo });
      expect(second.conceptId).not.toBe(first.conceptId);
    });
  });

  // -------------------------------------------------------------------------
  describe('a whole session', () => {
    it('runs start to finish and moves the learner', async () => {
      const caller = callerFor(sarah);
      const { sessionId } = await caller.practice.start({ learnerId: maya, targetLength: 3 });

      for (let i = 0; i < 3; i++) {
        const problem = await caller.practice.next({ learnerId: maya });
        const [stored] = await harness.db
          .select({ answer: schema.problems.answer })
          .from(schema.problems)
          .where(eq(schema.problems.id, problem.problemId));

        const outcome = await caller.practice.submit({
          learnerId: maya,
          problemId: problem.problemId,
          sessionId,
          answer: stored.answer,
          responseTimeMs: 4_200,
        });

        expect(outcome.isCorrect).toBe(true);
        expect(outcome.correctAnswer).toBe(stored.answer);
        expect(outcome.explanation).toBeTruthy();
      }

      await caller.practice.complete({ learnerId: maya, sessionId });

      const snapshot = await caller.learners.snapshot({ learnerId: maya });
      expect(snapshot.ability?.answered).toBe(3);
      expect(snapshot.mastery.reduce((n, m) => n + m.attempts, 0)).toBe(3);
      expect(snapshot.recentSessions[0].completedAt).not.toBeNull();
    });

    it('returns the explanation only after the learner has committed', async () => {
      const caller = callerFor(sarah);
      const problem = await caller.practice.next({ learnerId: maya });

      const outcome = await caller.practice.submit({
        learnerId: maya,
        problemId: problem.problemId,
        answer: 'not the answer',
      });

      expect(outcome.isCorrect).toBe(false);
      expect(outcome.explanation).toBeTruthy();
      expect(outcome.correctAnswer).toBeTruthy();
    });

    it('keeps two siblings" sessions apart', async () => {
      const caller = callerFor(sarah);
      const mayaSession = await caller.practice.start({ learnerId: maya, targetLength: 4 });
      const leoSession = await caller.practice.start({ learnerId: leo, targetLength: 4 });

      const mayaProblem = await caller.practice.next({ learnerId: maya });
      await caller.practice.submit({
        learnerId: maya,
        problemId: mayaProblem.problemId,
        sessionId: mayaSession.sessionId,
        answer: mayaProblem.choices[0],
      });

      const mayaSnapshot = await caller.learners.snapshot({ learnerId: maya });
      const leoSnapshot = await caller.learners.snapshot({ learnerId: leo });

      expect(mayaSnapshot.ability?.answered).toBe(1);
      expect(leoSnapshot.ability).toBeNull();
      expect(leoSnapshot.recentSessions).toHaveLength(1);
      expect(leoSession.sessionId).not.toBe(mayaSession.sessionId);
    });
  });

  // -------------------------------------------------------------------------
  describe('snapshot', () => {
    it('distinguishes a learner who has never answered from one who is average', async () => {
      // A dashboard showing 1200 ELO for both is lying about one of them.
      const snapshot = await callerFor(sarah).learners.snapshot({ learnerId: maya });
      expect(snapshot.ability).toBeNull();
      expect(snapshot.mastery).toEqual([]);
      expect(snapshot.rewards).toEqual({ coins: 0, xp: 0, streakDays: 0 });
    });

    it('reports the tier the learner is actually placed in', async () => {
      const snapshot = await callerFor(sarah).learners.snapshot({ learnerId: leo });
      expect(snapshot.learner.tier).toBe('elementary');
    });

    it('surfaces the misconceptions a teacher would want', async () => {
      const caller = callerFor(sarah);
      const problem = await caller.practice.next({ learnerId: leo });

      const distractors = await harness.db
        .select()
        .from(schema.problemDistractors)
        .where(eq(schema.problemDistractors.problemId, problem.problemId));

      await caller.practice.submit({
        learnerId: leo,
        problemId: problem.problemId,
        answer: distractors[0].value,
      });

      const snapshot = await caller.learners.snapshot({ learnerId: leo });
      expect(snapshot.misconceptions).toHaveLength(1);
      expect(snapshot.misconceptions[0].code).toBe(distractors[0].misconceptionCode);
    });
  });

  // -------------------------------------------------------------------------
  describe('creating a learner', () => {
    it('attaches the child to the caller, whoever they claim to be', async () => {
      const { id } = await callerFor(sarah).learners.create({ displayName: 'Sophia', birthYear: 2014 });
      const [created] = await harness.db.select().from(schema.learners).where(eq(schema.learners.id, id));
      expect(created.guardianId).toBe(sarah.id);
    });

    it('rejects a birth year that would place a learner outside the curriculum', async () => {
      await expect(
        callerFor(sarah).learners.create({ displayName: 'Typo', birthYear: 1900 }),
      ).rejects.toThrow();
    });

    it('rejects an empty name', async () => {
      await expect(callerFor(sarah).learners.create({ displayName: '   ', birthYear: 2016 })).rejects.toThrow();
    });
  });
});
