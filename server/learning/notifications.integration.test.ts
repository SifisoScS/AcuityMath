// @vitest-environment node

/**
 * What raises a notification, and who may read or clear it.
 *
 * `INITIAL_NOTIFICATIONS` was four invented items about children who do not
 * exist. Nothing in the application had ever raised one, so most of what matters
 * here is the two producers: that they fire on the event they claim to describe,
 * that they fire once, and that they do not fire otherwise.
 */

import { and, eq } from 'drizzle-orm';
import type { MySql2Database } from 'drizzle-orm/mysql2';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import * as schema from '../../drizzle/schema';
import { issueElevation, ELEVATION_COOKIE } from '../auth/session';
import { appRouter } from '../trpc/routers';
import type { Context } from '../trpc';
import { createTestDatabase, type TestDatabase } from '../test-support/database';
import { grantConsentForAllFamilies, grantConsentForFamily } from '../test-support/consent';
import { raiseMasteryMilestone } from './notifications';
import { recordAttempt } from './recordAttempt';
import { ensureGeneratorConcepts, serveNextProblem } from './serveProblem';

const DATABASE_URL = process.env.DATABASE_URL;
if (process.env.CI && !DATABASE_URL) {
  throw new Error('DATABASE_URL is unset in CI; this suite would skip while covering nothing.');
}
const describeWithDb = DATABASE_URL ? describe : describe.skip;

type Adult = { id: number; email: string; name: string | null; role: 'parent' | 'teacher' | 'admin' };

describeWithDb('notifications', () => {
  let harness: TestDatabase;
  let db: MySql2Database<typeof schema>;

  let sarah: Adult;
  let stranger: Adult;
  let maya: number;
  let leo: number;
  let outsider: number;
  let conceptId: string;

  beforeAll(async () => {
    harness = await createTestDatabase('notifications');
    db = harness.db;
  }, 60_000);

  afterAll(async () => {
    await harness?.close();
  });

  async function adult(email: string, role: Adult['role']): Promise<Adult> {
    await db.insert(schema.users).values({ email, role });
    const [row] = await db.select().from(schema.users).where(eq(schema.users.email, email));
    return { id: row.id, email: row.email, name: row.name, role };
  }

  /** A child, with their guardian's consent — which E1b requires before any
   * attempt of theirs can be recorded. Every producer tested here runs off a
   * recorded attempt, so a child without it would produce nothing and the suite
   * would be asserting about silence. */
  async function childOf(guardianId: number, displayName: string): Promise<number> {
    await db.insert(schema.learners).values({ guardianId, displayName, birthYear: 2016 });
    const mine = await db
      .select()
      .from(schema.learners)
      .where(eq(schema.learners.guardianId, guardianId));
    await grantConsentForFamily(db, guardianId);
    return mine.find(row => row.displayName === displayName)!.id;
  }

  beforeEach(async () => {
    await harness.reset();
    process.env.JWT_SECRET = 'a-test-secret-that-is-comfortably-long-enough-to-pass';
    await ensureGeneratorConcepts(db);

    const [concept] = await db.select({ id: schema.concepts.id }).from(schema.concepts).limit(1);
    conceptId = concept.id;

    sarah = await adult('sarah@example.test', 'parent');
    stranger = await adult('stranger@example.test', 'parent');
    maya = await childOf(sarah.id, 'Maya');
    leo = await childOf(sarah.id, 'Leo');
    outsider = await childOf(stranger.id, 'Outsider');
  }, 60_000);

  const callerFor = (user: Adult | null, elevation?: string) =>
    appRouter.createCaller({
      db,
      user,
      headers: elevation ? { cookie: `${ELEVATION_COOKIE}=${elevation}` } : {},
      setCookie: () => {},
    } satisfies Context);

  const elevated = async (user: Adult) => callerFor(user, await issueElevation(user.id));

  /**
   * Answers `count` questions on one concept, all correct, which is what drives
   * mastery past the threshold.
   */
  async function practise(learnerId: number, count: number, correct = true) {
    const [learner] = await db.select().from(schema.learners).where(eq(schema.learners.id, learnerId));
    for (let i = 0; i < count; i++) {
      const problem = await serveNextProblem(db, learner, { conceptId });
      const [stored] = await db
        .select({ answer: schema.problems.answer, choices: schema.problems.choices })
        .from(schema.problems)
        .where(eq(schema.problems.id, problem.problemId))
        .limit(1);
      const wrong = (stored.choices as string[] | null)?.find(c => c !== stored.answer) ?? 'nope';
      await recordAttempt(db, {
        learnerId,
        problemId: problem.problemId,
        submittedAnswer: correct ? stored.answer : wrong,
        responseTimeMs: 5_000,
      });
    }
  }

  /**
   * Raises a milestone directly.
   *
   * The blocks below are about who may read and clear notifications, not about
   * what produces them — that is covered by 'mastering a concept', which goes
   * through the whole pipeline. Getting there by answering twenty-five questions
   * took over a minute per test, and once it crossed the 30s limit the timeout
   * left the shared harness mid-flight and failed the next test in the file for
   * an unrelated reason.
   */
  const giveMilestone = (learnerId: number) =>
    raiseMasteryMilestone(db, { learnerId, conceptId, previousMastery: 79, currentMastery: 82 });

  const milestones = (learnerId: number) =>
    db
      .select()
      .from(schema.notifications)
      .where(
        and(
          eq(schema.notifications.aboutLearnerId, learnerId),
          eq(schema.notifications.type, 'milestone'),
        ),
      );

  describe('mastering a concept', () => {
    it('says nothing while the concept is not yet mastered', async () => {
      await practise(maya, 2);
      const [row] = await db
        .select()
        .from(schema.learnerConceptMastery)
        .where(eq(schema.learnerConceptMastery.learnerId, maya));
      expect(row.masteryScore).toBeLessThan(80);
      expect(await milestones(maya)).toHaveLength(0);
    });

    it('tells the child and their guardian when it is', async () => {
      await practise(maya, 25);
      const raised = await milestones(maya);
      expect(raised.length).toBeGreaterThan(0);

      const toChild = raised.find(row => row.learnerId === maya);
      const toGuardian = raised.find(row => row.userId === sarah.id);
      expect(toChild).toBeTruthy();
      expect(toGuardian).toBeTruthy();
      // Different sentences, because the audiences are different.
      expect(toChild!.message).toMatch(/^You have mastered/);
      expect(toGuardian!.message).toMatch(/^Maya has mastered/);
    });

    it('names the concept rather than its slug', async () => {
      await practise(maya, 25);
      const [concept] = await db
        .select()
        .from(schema.concepts)
        .where(eq(schema.concepts.id, conceptId));
      const [row] = await milestones(maya);
      expect(row.message).toContain(concept.title);
    });

    it('says it once, however much more practice happens', async () => {
      // Mastery can fall back under the threshold and cross again, so a
      // producer keyed on "score is above 80" congratulates a wobbling child
      // every few questions.
      await practise(maya, 25);
      const after = (await milestones(maya)).length;

      await practise(maya, 15);
      expect(await milestones(maya)).toHaveLength(after);
    });

    it('does not congratulate a sibling', async () => {
      await practise(maya, 25);
      expect(await milestones(leo)).toHaveLength(0);
    });

    it('writes inside the caller transaction, so a rollback takes it too', async () => {
      /*
       * `recordAttempt` passes its transaction handle, so a child cannot be
       * congratulated for an answer the database ends up not having.
       *
       * An earlier version of this test submitted a non-existent problem id and
       * asserted no milestone appeared. That proved nothing: `recordAttempt`
       * rejects an unknown problem *before* opening a transaction, so the
       * producer was never reached. Rolling one back deliberately is the only
       * way to watch the write disappear.
       */
      await expect(
        db.transaction(async tx => {
          const written = await raiseMasteryMilestone(tx, {
            learnerId: maya,
            conceptId,
            previousMastery: 79,
            currentMastery: 82,
          });
          expect(written).toBe(2);
          throw new Error('deliberate rollback');
        }),
      ).rejects.toThrow(/deliberate rollback/);

      expect(await milestones(maya)).toHaveLength(0);
    });
  });

  describe('the milestone guards, separately', () => {
    /*
     * Driven through `recordAttempt`, the crossing check and the already-raised
     * check hide each other: remove either and the suite still passes, because
     * the survivor is enough. Mutating them proved exactly that. These call the
     * producer directly so each guard is pinned on its own.
     */
    const raise = (previousMastery: number, currentMastery: number) =>
      raiseMasteryMilestone(db, { learnerId: maya, conceptId, previousMastery, currentMastery });

    it('raises two rows when the threshold is crossed', async () => {
      expect(await raise(79, 80)).toBe(2);
    });

    it('raises nothing when the score was already above it', async () => {
      // Without the crossing check this fires on every subsequent answer.
      expect(await raise(85, 90)).toBe(0);
      expect(await milestones(maya)).toHaveLength(0);
    });

    it('raises nothing when the threshold was not reached', async () => {
      expect(await raise(50, 70)).toBe(0);
    });

    it('is not silenced by an assignment already recorded on the concept', async () => {
      /*
       * The dedup query filters on `type = 'milestone'`. Without that filter an
       * assignment row — which records the same `conceptId` — looks like the
       * milestone already having been raised, and a child who is set work on a
       * concept and then masters it is never congratulated.
       *
       * The order matters: this only bites when the assignment exists first,
       * which is why asserting it the other way round proved nothing.
       */
      await (await elevated(sarah)).assignments.create({
        title: 'Work set before mastery',
        instructions: '',
        conceptId,
        learnerIds: [maya],
        rewardCoins: 0,
      });

      expect(await raise(79, 82)).toBe(2);
    });

    it('stays quiet when a child wobbles back over the threshold', async () => {
      // The case the already-raised check exists for: mastery falls under 80 and
      // climbs back, which is a genuine second crossing and not a second event.
      expect(await raise(79, 82)).toBe(2);
      expect(await raise(78, 81)).toBe(0);
      expect(await milestones(maya)).toHaveLength(2);
    });
  });

  describe('being set work', () => {
    const setWork = async (learnerIds: number[], title = 'Ten minutes of practice') =>
      (await elevated(sarah)).assignments.create({
        title,
        instructions: '',
        conceptId,
        learnerIds,
        rewardCoins: 0,
      });

    it('tells each child who was set it', async () => {
      await setWork([maya, leo]);

      const forMaya = await callerFor(sarah).notifications.forLearner({ learnerId: maya });
      const forLeo = await callerFor(sarah).notifications.forLearner({ learnerId: leo });
      expect(forMaya).toHaveLength(1);
      expect(forLeo).toHaveLength(1);
      expect(forMaya[0].message).toContain('Ten minutes of practice');
      expect(forMaya[0].type).toBe('assignment');
    });

    it('does not ring the guardian for routine homework', async () => {
      // A parent whose bell rings for every assignment stops reading the bell,
      // which costs them the milestones that are worth reading.
      await setWork([maya]);
      expect(await callerFor(sarah).notifications.forMe()).toHaveLength(0);
    });

    it('tells nobody who was not set it', async () => {
      await setWork([maya]);
      expect(await callerFor(sarah).notifications.forLearner({ learnerId: leo })).toHaveLength(0);
    });

    it('is not silenced by a milestone already raised on the same concept', async () => {
      await giveMilestone(maya);
      expect((await milestones(maya)).length).toBeGreaterThan(0);

      await setWork([maya], 'Work after mastery');
      const forMaya = await callerFor(sarah).notifications.forLearner({ learnerId: maya });
      expect(forMaya.some(row => row.type === 'assignment')).toBe(true);
    });

    it('does not look like a repeat when two are set on one concept', async () => {
      // Assignment rows record their concept, which is also the milestone dedup
      // key — so that query filters on `type = 'milestone'`. Without the filter,
      // work set on a concept a child had already mastered would read as a
      // repeat and be dropped.
      await setWork([maya], 'First piece');
      await setWork([maya], 'Second piece');
      expect(await callerFor(sarah).notifications.forLearner({ learnerId: maya })).toHaveLength(2);
    });
  });

  describe('who may read them', () => {
    it('refuses another family child', async () => {
      await expect(
        callerFor(sarah).notifications.forLearner({ learnerId: outsider }),
      ).rejects.toThrow(/No such learner/);
    });

    it('refuses a signed-out caller', async () => {
      await expect(callerFor(null).notifications.forMe()).rejects.toThrow();
    });

    it('shows an adult only their own', async () => {
      await giveMilestone(maya);
      expect((await callerFor(sarah).notifications.forMe()).length).toBeGreaterThan(0);
      expect(await callerFor(stranger).notifications.forMe()).toHaveLength(0);
    });
  });

  describe('reading and clearing', () => {
    beforeEach(async () => {
      await giveMilestone(maya);
    
    // Graft E1b refuses to record an under-13's practice without consent.
    // The learners exist by here, so this covers them.
    await grantConsentForAllFamilies(db);
});

    it('marks one read, and back to unread', async () => {
      const caller = callerFor(sarah);
      const [first] = await caller.notifications.forMe();
      expect(first.read).toBe(false);

      await caller.notifications.setRead({ notificationId: first.id, read: true });
      expect((await caller.notifications.forMe())[0].read).toBe(true);

      await caller.notifications.setRead({ notificationId: first.id, read: false });
      expect((await caller.notifications.forMe())[0].read).toBe(false);
    });

    it('lets a guardian mark their own child notification read', async () => {
      // Clearing the family bell is a parent's job, so an adult owns the rows
      // addressed to their own children as well as their own.
      const caller = callerFor(sarah);
      const [childRow] = await caller.notifications.forLearner({ learnerId: maya });
      await expect(
        caller.notifications.setRead({ notificationId: childRow.id, read: true }),
      ).resolves.toEqual({ ok: true });
    });

    it('refuses to touch another family notification', async () => {
      const caller = callerFor(sarah);
      const [mine] = await caller.notifications.forMe();
      await expect(
        callerFor(stranger).notifications.setRead({ notificationId: mine.id, read: true }),
      ).rejects.toThrow(/No such notification/);
    });

    it('marks everything read at once', async () => {
      const caller = callerFor(sarah);
      const { marked } = await caller.notifications.markAllRead();
      expect(marked).toBeGreaterThan(0);
      expect((await caller.notifications.forMe()).every(row => row.read)).toBe(true);
      // Including the child copies, which the family bell shows.
      expect(
        (await caller.notifications.forLearner({ learnerId: maya })).every(row => row.read),
      ).toBe(true);
    });

    it('clears only the caller family', async () => {
      await giveMilestone(outsider);
      const strangerBefore = (await callerFor(stranger).notifications.forMe()).length;
      expect(strangerBefore).toBeGreaterThan(0);

      await callerFor(sarah).notifications.clear();

      expect(await callerFor(sarah).notifications.forMe()).toHaveLength(0);
      expect(await callerFor(sarah).notifications.forLearner({ learnerId: maya })).toHaveLength(0);
      expect(await callerFor(stranger).notifications.forMe()).toHaveLength(strangerBefore);
    });
  });

  describe('the shape of a row', () => {
    it('addresses exactly one recipient', async () => {
      // The invariant the schema cannot state: `user_id` and `learner_id` are
      // who reads it, and a row addressed to both would appear in two bells and
      // share one read flag between them.
      await giveMilestone(maya);
      await (await elevated(sarah)).assignments.create({
        title: 'Some work',
        instructions: '',
        conceptId,
        learnerIds: [maya],
        rewardCoins: 0,
      });

      const rows = await db.select().from(schema.notifications);
      expect(rows.length).toBeGreaterThan(1);
      for (const row of rows) {
        expect(Number(row.userId !== null) + Number(row.learnerId !== null)).toBe(1);
      }
    });
  });
});
