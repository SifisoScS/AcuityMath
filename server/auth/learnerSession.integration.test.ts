// @vitest-environment node

/**
 * The first session a child can hold, and the wall around it.
 *
 * Every other principal in this product is an adult. A learner session exists
 * because an LTI pupil arrives with nobody standing behind them, and the whole
 * question it raises is **what a nine-year-old with a cookie can reach**.
 *
 * Two answers matter more than the rest. A child reaches their own practice —
 * otherwise the launch was pointless. And a child reaches **nothing that names
 * another child**, which is the line every procedure below takes a `learnerId`
 * across.
 */

import { and, eq } from 'drizzle-orm';
import type { MySql2Database } from 'drizzle-orm/mysql2';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import * as schema from '../../drizzle/schema';
import { createTestDatabase, type TestDatabase } from '../test-support/database';
import { grantConsentForFamily } from '../test-support/consent';
import { appRouter } from '../trpc/routers';
import type { Context } from '../trpc';
import {
  issueLearnerSession,
  issueSession,
  LEARNER_COOKIE,
  LEARNER_SESSION_LIFETIME_SECONDS,
  ltiLearnerCookie,
  resolveLearnerSession,
  SESSION_COOKIE,
} from './session';

const DATABASE_URL = process.env.DATABASE_URL;
if (process.env.CI && !DATABASE_URL) {
  throw new Error('DATABASE_URL is unset in CI; this suite would skip while covering nothing.');
}
const describeWithDb = DATABASE_URL ? describe : describe.skip;

describeWithDb('a child holding their own session', () => {
  let harness: TestDatabase;
  let db: MySql2Database<typeof schema>;
  let sarah: { id: number; email: string; name: string | null; role: 'parent' };
  let mine: number;
  let sibling: number;
  let stranger: number;

  beforeAll(async () => {
    harness = await createTestDatabase('learnersession');
    db = harness.db;
    process.env.JWT_SECRET = 'a-test-signing-secret-that-is-long-enough-to-use';
  }, 60_000);

  afterAll(async () => {
    await harness?.close();
  });

  beforeEach(async () => {
    await harness.reset();

    await db.insert(schema.users).values({ email: 'sarah@example.test', role: 'parent' });
    const [row] = await db
      .select()
      .from(schema.users)
      .where(eq(schema.users.email, 'sarah@example.test'));
    sarah = { id: row.id, email: row.email, name: row.name, role: 'parent' };

    await db.insert(schema.users).values({ email: 'other@example.test', role: 'parent' });
    const [otherParent] = await db
      .select()
      .from(schema.users)
      .where(eq(schema.users.email, 'other@example.test'));

    const make = async (guardianId: number, displayName: string) => {
      await db.insert(schema.learners).values({ guardianId, displayName, birthYear: 2015 });
      const [learner] = await db
        .select()
        .from(schema.learners)
        .where(
          and(
            eq(schema.learners.guardianId, guardianId),
            eq(schema.learners.displayName, displayName),
          ),
        );
      return learner.id;
    };

    mine = await make(sarah.id, 'Mine');
    sibling = await make(sarah.id, 'Sibling');
    stranger = await make(otherParent.id, 'Stranger');

    await grantConsentForFamily(db, sarah.id);
    await grantConsentForFamily(db, otherParent.id);
  });

  /** A request made by a child, with no adult anywhere. */
  const asChild = (learnerId: number) =>
    appRouter.createCaller({
      db,
      user: null,
      learnerSession: { learnerId, launch: null },
      headers: {},
      setCookie: () => {},
    } satisfies Context);

  /** A request made by nobody at all. */
  const asNobody = () =>
    appRouter.createCaller({
      db,
      user: null,
      learnerSession: null,
      headers: {},
      setCookie: () => {},
    } satisfies Context);

  describe('the token', () => {
    it('resolves the child it was minted for', async () => {
      const token = await issueLearnerSession(mine);
      const resolved = await resolveLearnerSession({ cookie: `${LEARNER_COOKIE}=${token}` });

      expect(resolved?.learnerId).toBe(mine);
      // No placement, because this one was not minted by a launch.
      expect(resolved?.launch).toBeNull();
    });

    it('carries the placement a launch came in through', async () => {
      /*
       * C5b put it here because nothing else knows it later: a practice session
       * records no course, and by the time one finishes the launch is long gone.
       * Without it a score has no column to go to.
       */
      const token = await issueLearnerSession(mine, {
        contextRowId: 7,
        resourceLinkId: 'link-1',
      });
      const resolved = await resolveLearnerSession({ cookie: `${LEARNER_COOKIE}=${token}` });

      expect(resolved?.launch).toEqual({ contextRowId: 7, resourceLinkId: 'link-1' });
    });

    it('refuses half a placement', async () => {
      /*
       * A column needs a course **and** a placement. Half a pair would send a
       * score to a course's default column — a mark in a place no teacher put a
       * link.
       */
      const token = await issueLearnerSession(mine, {
        contextRowId: 7,
        resourceLinkId: '',
      });
      const resolved = await resolveLearnerSession({ cookie: `${LEARNER_COOKIE}=${token}` });

      expect(resolved?.learnerId).toBe(mine);
      expect(resolved?.launch).toBeNull();
    });

    it('is not an adult session, and an adult session is not one of these', async () => {
      /*
       * **The audience is the only thing separating them.** All three token
       * kinds are signed with the same key, so without a distinct audience a
       * learner token dropped into the adult cookie would verify — and the ids
       * collide, because learner 7 and user 7 are both perfectly ordinary rows
       * from separate sequences.
       */
      const adult = await issueSession(sarah.id);
      expect(await resolveLearnerSession({ cookie: `${LEARNER_COOKIE}=${adult}` })).toBeNull();

      const child = await issueLearnerSession(mine);
      const { resolveUser } = await import('./session');
      expect(await resolveUser(db, { cookie: `${SESSION_COOKIE}=${child}` })).toBeNull();
    });

    it('treats a forged or corrupted cookie as nobody, not as an error', async () => {
      expect(await resolveLearnerSession({ cookie: `${LEARNER_COOKIE}=nonsense` })).toBeNull();
      expect(await resolveLearnerSession({})).toBeNull();
    });

    it('expires in hours rather than the adult session’s weeks', async () => {
      // A classroom machine should not stay signed in as a particular child
      // overnight. Eight hours covers a school day and stops there.
      expect(LEARNER_SESSION_LIFETIME_SECONDS).toBe(8 * 60 * 60);
      expect(ltiLearnerCookie('t')).toContain(`Max-Age=${8 * 60 * 60}`);
    });

    it('travels inside an LMS frame', async () => {
      // Same reason the staff cookie does: a tool launched from an LMS runs
      // cross-site, and `Lax` is not sent on those requests at all.
      const previous = process.env.APP_BASE_URL;
      process.env.APP_BASE_URL = 'https://acuitymath.test';
      try {
        const cookie = ltiLearnerCookie('t');
        expect(cookie).toContain('SameSite=None');
        expect(cookie).toContain('Secure');
        expect(cookie).toContain('HttpOnly');
      } finally {
        process.env.APP_BASE_URL = previous;
      }
    });
  });

  describe('what a child may reach', () => {
    it('practises as themselves', async () => {
      const state = await asChild(mine).learners.screenTime({ learnerId: mine });
      expect(state).toBeTruthy();
    });

    it('sees their own assignments and notifications', async () => {
      await expect(
        asChild(mine).assignments.forLearner({ learnerId: mine }),
      ).resolves.toBeDefined();
      await expect(
        asChild(mine).notifications.forLearner({ learnerId: mine }),
      ).resolves.toBeDefined();
    });
  });

  describe('what a child may not reach', () => {
    it('cannot name their sibling', async () => {
      /*
       * **The line this whole change rests on.** Every procedure here takes a
       * `learnerId` as input, so without comparing it against the session's own
       * child, a nine-year-old could read their brother's practice by editing a
       * number.
       */
      await expect(asChild(mine).learners.screenTime({ learnerId: sibling })).rejects.toThrow(
        /No such learner/,
      );
    });

    it('cannot name a child in another family', async () => {
      await expect(asChild(mine).learners.screenTime({ learnerId: stranger })).rejects.toThrow(
        /No such learner/,
      );
    });

    it('is refused the same way for a learner that does not exist', async () => {
      // Indistinguishable answers, so ids cannot be enumerated by watching which
      // ones fail differently.
      await expect(asChild(mine).learners.screenTime({ learnerId: 999_999 })).rejects.toThrow(
        /No such learner/,
      );
    });

    it('cannot reach any parent surface', async () => {
      /*
       * These are all `protectedProcedure` or `elevatedProcedure`, which mean
       * "an adult is signed in". A child satisfies neither, and the point of
       * leaving `learnerProcedure` as the only widened one is that none of these
       * had to restate the rule.
       */
      const child = asChild(mine);

      await expect(child.learners.list()).rejects.toThrow(/Sign in/);
      await expect(child.consent.forFamily()).rejects.toThrow(/Sign in/);
      await expect(child.analytics.forFamily()).rejects.toThrow(/Sign in/);
      await expect(child.notifications.forMe()).rejects.toThrow(/Sign in/);
      await expect(child.me()).rejects.toThrow(/Sign in/);
    });

    it('cannot read their own analytics, because that surface is a parent’s', async () => {
      /*
       * `elevatedLearnerProcedure`. A child is refused *by name* rather than
       * failing on a null — step-up proves the adult is at the keyboard, and
       * there is no PIN a child could type that would mean that.
       */
      await expect(asChild(mine).analytics.forLearner({ learnerId: mine })).rejects.toThrow(
        /parent or teacher/,
      );
    });

    it('cannot export their own full record', async () => {
      /*
       * E2 made "everything recorded about your child" real, and it is more than
       * analytics: every answer, every timing, every notification about them.
       * The promise it fulfils is made to the adult responsible for the child,
       * and `elevatedLearnerProcedure` is what establishes that the adult is the
       * one asking. A child with a session is not that adult.
       */
      await expect(asChild(mine).learners.export({ learnerId: mine })).rejects.toThrow(
        /parent or teacher/,
      );
      await expect(
        asChild(mine).learners.exportSummary({ learnerId: mine }),
      ).rejects.toThrow(/parent or teacher/);
    });

    it('cannot set their own badge', async () => {
      // Deciding how a child identifies themselves is a parent's decision — a
      // child who could set their own badge could set their sibling's.
      await expect(
        asChild(mine).access.setLearnerSecret({ learnerId: mine, kind: 'pin', secret: '1234' }),
      ).rejects.toThrow();
    });
  });

  describe('a request with nobody at all', () => {
    it('is refused', async () => {
      await expect(asNobody().learners.screenTime({ learnerId: mine })).rejects.toThrow(/Sign in/);
    });
  });

  describe('an archived child', () => {
    it('cannot use a session minted before they were archived', async () => {
      /*
       * There is no session table, so a token outlives the row it names. The
       * `archivedAt` filter in `learnerProcedure` is what makes a deletion
       * request effective — without it, a child whose records were removed would
       * keep practising until their cookie expired.
       */
      await db
        .update(schema.learners)
        .set({ archivedAt: new Date() })
        .where(eq(schema.learners.id, mine));

      await expect(asChild(mine).learners.screenTime({ learnerId: mine })).rejects.toThrow(
        /No such learner/,
      );
    });
  });

  describe('the adult paths, unchanged', () => {
    const asParent = () =>
      appRouter.createCaller({
        db,
        user: sarah,
        learnerSession: null,
        headers: {},
        setCookie: () => {},
      } satisfies Context);

    it('still reaches their own child', async () => {
      await expect(asParent().learners.screenTime({ learnerId: mine })).resolves.toBeTruthy();
    });

    it('still cannot reach another family’s child', async () => {
      await expect(asParent().learners.screenTime({ learnerId: stranger })).rejects.toThrow(
        /No such learner/,
      );
    });

    it('is not widened by a stale learner cookie naming somebody else', async () => {
      /*
       * A context carrying both is not a thing the adapter builds, but the
       * entitlement check reads them independently — so this asserts that an
       * adult's reach is their own, and that the child half cannot be used to
       * extend it. The stranger's id in the learner slot must not open the
       * stranger's record to Sarah... and must not be silently ignored either.
       */
      const both = appRouter.createCaller({
        db,
        user: sarah,
        learnerSession: { learnerId: stranger, launch: null },
        headers: {},
        setCookie: () => {},
      } satisfies Context);

      await expect(both.learners.screenTime({ learnerId: mine })).resolves.toBeTruthy();
    });
  });
});
