// @vitest-environment node
//
// jose and scrypt both want real node primitives; jsdom's realm breaks the
// former's `instanceof` checks. Nothing here needs a DOM.

/**
 * The step-up PIN and the child selector.
 *
 * The PIN is what stands between a child holding a signed-in family tablet and
 * their sibling's records. Almost every test here asserts a refusal, because
 * the interesting cases are the wrong PIN, the fifth wrong PIN, the guessed
 * badge and the elevation belonging to somebody else.
 */

import { eq } from 'drizzle-orm';
import type { MySql2Database } from 'drizzle-orm/mysql2';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import * as schema from '../../drizzle/schema';
import { appRouter } from '../trpc/routers';
import type { Context } from '../trpc';
import { createTestDatabase, type TestDatabase } from '../test-support/database';
import {
  assertUsablePin,
  checkStepUpPin,
  hashPin,
  LOCKOUT_MS,
  MAX_ATTEMPTS,
  resolveLearnerBySecret,
  setLearnerAccessToken,
  setStepUpPin,
  verifyPinHash,
  WeakPin,
} from './pin';
import {
  ELEVATION_COOKIE,
  hasElevation,
  issueElevation,
  issueSession,
  SESSION_COOKIE,
} from './session';

const DATABASE_URL = process.env.DATABASE_URL;
if (process.env.CI && !DATABASE_URL) {
  throw new Error('DATABASE_URL is unset in CI; this suite would skip while covering nothing.');
}
const describeWithDb = DATABASE_URL ? describe : describe.skip;

const SECRET = 'a-test-secret-that-is-comfortably-long-enough-to-pass';

describeWithDb('step-up and child access', () => {
  let harness: TestDatabase;
  let db: MySql2Database<typeof schema>;
  let sarah: { id: number; email: string; name: string | null; role: 'parent' };
  let otherParent: { id: number; email: string; name: string | null; role: 'parent' };
  let maya: number;
  let leo: number;

  beforeAll(async () => {
    harness = await createTestDatabase('stepup');
    db = harness.db;
  }, 60_000);

  afterAll(async () => {
    await harness?.close();
  });

  beforeEach(async () => {
    await harness.reset();
    process.env.JWT_SECRET = SECRET;
    delete process.env.NODE_ENV;

    const makeParent = async (email: string) => {
      await db.insert(schema.users).values({ email, role: 'parent' });
      const [row] = await db.select().from(schema.users).where(eq(schema.users.email, email));
      return { id: row.id, email: row.email, name: row.name, role: 'parent' as const };
    };
    sarah = await makeParent('sarah@example.test');
    otherParent = await makeParent('other@example.test');

    const makeLearner = async (guardianId: number, displayName: string, birthYear: number) => {
      await db.insert(schema.learners).values({ guardianId, displayName, birthYear });
      const rows = await db.select().from(schema.learners).where(eq(schema.learners.guardianId, guardianId));
      return rows[rows.length - 1].id;
    };
    maya = await makeLearner(sarah.id, 'Maya', 2020);
    leo = await makeLearner(sarah.id, 'Leo', 2016);
  }, 30_000);

  afterEach(() => {
    delete process.env.NODE_ENV;
  });

  /** A caller with an optional elevation cookie. */
  const callerFor = (user: typeof sarah | null, elevation?: string) =>
    appRouter.createCaller({
      db,
      user,
      headers: elevation ? { cookie: `${ELEVATION_COOKIE}=${elevation}` } : {},
      setCookie: () => {},
    } satisfies Context);

  // -------------------------------------------------------------------------
  describe('storing a PIN', () => {
    it('does not store the PIN', async () => {
      await setStepUpPin(db, sarah.id, '8317');
      const [row] = await db.select().from(schema.users).where(eq(schema.users.id, sarah.id));

      expect(row.stepUpPinHash).not.toContain('8317');
      expect(row.stepUpPinHash).toMatch(/^scrypt\$/);
    });

    it('produces a different hash for the same PIN each time', async () => {
      // Equal hashes would mean no salt, and a rainbow table over ten thousand
      // candidates covers every parent at once.
      const [a, b] = await Promise.all([hashPin('8317'), hashPin('8317')]);
      expect(a).not.toBe(b);
      expect(await verifyPinHash('8317', a)).toBe(true);
      expect(await verifyPinHash('8317', b)).toBe(true);
    });

    it('records the parameters it used, so they can be raised later', async () => {
      const hash = await hashPin('8317');
      const [algorithm, n, r, p] = hash.split('$');
      expect(algorithm).toBe('scrypt');
      expect(Number(n)).toBeGreaterThanOrEqual(16_384);
      expect(Number(r)).toBeGreaterThan(0);
      expect(Number(p)).toBeGreaterThan(0);
    });

    it('refuses the PINs a sibling tries first', () => {
      for (const weak of ['0000', '1111', '1234', '4321', '9876']) {
        expect(() => assertUsablePin(weak), weak).toThrow(WeakPin);
      }
      expect(() => assertUsablePin('12')).toThrow(WeakPin);
      expect(() => assertUsablePin('abcd')).toThrow(WeakPin);
      expect(() => assertUsablePin('8317')).not.toThrow();
    });

    it('refuses a corrupted stored value rather than crashing', async () => {
      expect(await verifyPinHash('8317', 'not-a-hash')).toBe(false);
      expect(await verifyPinHash('8317', 'scrypt$1$2$3$bad$bad')).toBe(false);
    });
  });

  // -------------------------------------------------------------------------
  describe('checking a PIN', () => {
    // scrypt, at real cost parameters, on every test in this block.
    beforeEach(async () => {
      await setStepUpPin(db, sarah.id, '8317');
    }, 30_000);

    it('accepts the right one', async () => {
      expect(await checkStepUpPin(db, sarah.id, '8317')).toEqual({ ok: true });
    });

    it('refuses the wrong one, and counts down', async () => {
      const first = await checkStepUpPin(db, sarah.id, '0001');
      expect(first.ok).toBe(false);
      expect(first.ok === false && first.reason).toBe('wrong');
      expect(first.ok === false && 'attemptsRemaining' in first && first.attemptsRemaining).toBe(
        MAX_ATTEMPTS - 1,
      );
    });

    it('locks after five wrong answers', async () => {
      // What makes a four-digit secret defensible: ten thousand guesses becomes
      // roughly a month of uninterrupted effort.
      for (let i = 0; i < MAX_ATTEMPTS - 1; i++) await checkStepUpPin(db, sarah.id, '0001');
      const last = await checkStepUpPin(db, sarah.id, '0001');

      expect(last.ok).toBe(false);
      expect(last.ok === false && last.reason).toBe('locked');
      expect(last.ok === false && 'retryAfterMs' in last && last.retryAfterMs).toBeLessThanOrEqual(LOCKOUT_MS);
    });

    it('refuses the correct PIN while locked', async () => {
      for (let i = 0; i < MAX_ATTEMPTS; i++) await checkStepUpPin(db, sarah.id, '0001');
      const correct = await checkStepUpPin(db, sarah.id, '8317');

      expect(correct.ok).toBe(false);
      expect(correct.ok === false && correct.reason).toBe('locked');
    });

    it('forgives an occasional slip', async () => {
      // Four wrong answers then a right one must not leave the parent one
      // mistake from a lockout for the rest of the week.
      for (let i = 0; i < MAX_ATTEMPTS - 1; i++) await checkStepUpPin(db, sarah.id, '0001');
      expect(await checkStepUpPin(db, sarah.id, '8317')).toEqual({ ok: true });

      const [row] = await db.select().from(schema.users).where(eq(schema.users.id, sarah.id));
      expect(row.stepUpFailedAttempts).toBe(0);
    });

    it('lets a locked-out parent set a new PIN', async () => {
      // Otherwise forgetting the PIN locks them out of fixing it.
      for (let i = 0; i < MAX_ATTEMPTS; i++) await checkStepUpPin(db, sarah.id, '0001');
      await setStepUpPin(db, sarah.id, '5926');

      expect(await checkStepUpPin(db, sarah.id, '5926')).toEqual({ ok: true });
    });

    it('says so when no PIN has been set', async () => {
      const result = await checkStepUpPin(db, otherParent.id, '8317');
      expect(result.ok === false && result.reason).toBe('not-set');
    });

    it('counts attempts per account', async () => {
      await setStepUpPin(db, otherParent.id, '5926');
      for (let i = 0; i < MAX_ATTEMPTS; i++) await checkStepUpPin(db, sarah.id, '0001');

      // One parent's lockout must not lock another out.
      expect(await checkStepUpPin(db, otherParent.id, '5926')).toEqual({ ok: true });
    });
  });

  // -------------------------------------------------------------------------
  describe('elevation', () => {
    it('is not granted by merely being signed in', async () => {
      const caller = callerFor(sarah);
      expect((await caller.access.status()).isElevated).toBe(false);
    });

    it('is refused for a session token presented as elevation', async () => {
      // Distinct audiences. Without them the same signature verifies for both,
      // and holding a session would be holding the step-up it exists to require.
      const session = await issueSession(sarah.id);
      expect(await hasElevation({ cookie: `${ELEVATION_COOKIE}=${session}` }, sarah.id)).toBe(false);
    });

    it('is refused when it belongs to another account', async () => {
      // Two parents on one shared computer.
      const theirs = await issueElevation(otherParent.id);
      expect(await hasElevation({ cookie: `${ELEVATION_COOKIE}=${theirs}` }, sarah.id)).toBe(false);
    });

    it('is granted by the right PIN and refused by the wrong one', async () => {
      await setStepUpPin(db, sarah.id, '8317');
      const caller = callerFor(sarah);

      await expect(caller.access.elevate({ pin: '0001' })).rejects.toThrow(/Incorrect PIN/);
      await expect(caller.access.elevate({ pin: '8317' })).resolves.toEqual({ elevated: true });
    });

    it('reports a lockout as a lockout, not as a wrong PIN', async () => {
      // Repeating "wrong PIN" at somebody who is locked out sends them to reset
      // a PIN that was right.
      await setStepUpPin(db, sarah.id, '8317');
      const caller = callerFor(sarah);
      for (let i = 0; i < MAX_ATTEMPTS; i++) {
        await caller.access.elevate({ pin: '0001' }).catch(() => {});
      }
      await expect(caller.access.elevate({ pin: '8317' })).rejects.toThrow(/Too many attempts/);
    });

    it('refuses a weak PIN when one is chosen', async () => {
      await expect(callerFor(sarah).access.setPin({ pin: '1234' })).rejects.toThrow(/simple sequence/);
      await expect(callerFor(sarah).access.setPin({ pin: '8317' })).resolves.toEqual({ set: true });
    });
  });

  // -------------------------------------------------------------------------
  describe('what elevation guards', () => {
    it('refuses to set a child"s badge without it', async () => {
      // A child who could set their own badge could set their sibling's.
      await expect(
        callerFor(sarah).access.setLearnerSecret({
          learnerId: maya,
          kind: 'picture_sequence',
          secret: 'star-rocket-apple',
        }),
      ).rejects.toThrow(/STEP_UP_REQUIRED/);
    });

    it('allows it with elevation', async () => {
      const elevated = callerFor(sarah, await issueElevation(sarah.id));
      await expect(
        elevated.access.setLearnerSecret({
          learnerId: maya,
          kind: 'picture_sequence',
          secret: 'star-rocket-apple',
        }),
      ).resolves.toEqual({ set: true });
    });

    it('still refuses another family"s child, elevated or not', async () => {
      // Elevation proves an adult is present. It says nothing about whose
      // children they may reach.
      await db.insert(schema.learners).values({
        guardianId: otherParent.id,
        displayName: 'Someone else',
        birthYear: 2016,
      });
      const [stranger] = await db
        .select()
        .from(schema.learners)
        .where(eq(schema.learners.guardianId, otherParent.id));

      const elevated = callerFor(sarah, await issueElevation(sarah.id));
      await expect(
        elevated.access.setLearnerSecret({
          learnerId: stranger.id,
          kind: 'pin',
          secret: '4417',
        }),
      ).rejects.toThrow(/No such learner/);
    });
  });

  // -------------------------------------------------------------------------
  describe('a child choosing themselves', () => {
    beforeEach(async () => {
      await setLearnerAccessToken(db, maya, 'picture_sequence', 'star-rocket-apple');
      await setLearnerAccessToken(db, leo, 'picture_sequence', 'moon-train-pear');
    }, 30_000);

    it('does not store the badge', async () => {
      const rows = await db.select().from(schema.learnerAccessTokens);
      expect(JSON.stringify(rows)).not.toContain('star-rocket-apple');
    });

    it('resolves the right child', async () => {
      const caller = callerFor(sarah);
      await expect(
        caller.access.selectLearner({ kind: 'picture_sequence', secret: 'star-rocket-apple' }),
      ).resolves.toEqual({ learnerId: maya });
      await expect(
        caller.access.selectLearner({ kind: 'picture_sequence', secret: 'moon-train-pear' }),
      ).resolves.toEqual({ learnerId: leo });
    });

    it('refuses a badge nobody here holds', async () => {
      await expect(
        callerFor(sarah).access.selectLearner({ kind: 'picture_sequence', secret: 'cat-cat-cat' }),
      ).rejects.toThrow(/does not match anyone here/);
    });

    it('cannot start a session on its own', async () => {
      // The whole design: a badge is a selector inside a guardian's session and
      // nothing at all outside one. A three-year-old holds nothing that could
      // sign anybody in.
      await expect(
        callerFor(null).access.selectLearner({
          kind: 'picture_sequence',
          secret: 'star-rocket-apple',
        }),
      ).rejects.toThrow(/UNAUTHORIZED|Sign in/);
    });

    it('scopes a shared badge to the family presenting it', async () => {
      // Two families choosing the same picture sequence must not collide.
      await db.insert(schema.learners).values({
        guardianId: otherParent.id,
        displayName: 'Someone else',
        birthYear: 2016,
      });
      const [stranger] = await db
        .select()
        .from(schema.learners)
        .where(eq(schema.learners.guardianId, otherParent.id));
      await setLearnerAccessToken(db, stranger.id, 'picture_sequence', 'star-rocket-apple');

      // Sarah presents the shared sequence; it must resolve to *her* Maya.
      await expect(
        callerFor(sarah).access.selectLearner({
          kind: 'picture_sequence',
          secret: 'star-rocket-apple',
        }),
      ).resolves.toEqual({ learnerId: maya });

      // And directly: the resolver is scoped to the ids it was given.
      expect(await resolveLearnerBySecret(db, [stranger.id], 'picture_sequence', 'moon-train-pear')).toBeNull();
    });

    it('distinguishes the kind of badge', async () => {
      await setLearnerAccessToken(db, maya, 'pin', '4417');
      // The same secret under a different kind is a different credential.
      expect(await resolveLearnerBySecret(db, [maya, leo], 'pin', 'star-rocket-apple')).toBeNull();
      expect(await resolveLearnerBySecret(db, [maya, leo], 'pin', '4417')).toBe(maya);
    });
  });
});
