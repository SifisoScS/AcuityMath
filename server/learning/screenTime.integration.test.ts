// @vitest-environment node

/**
 * Screen-time enforcement against a real MySQL.
 *
 * `screen_time_rules` has had a writer, a reader and a parent-facing control
 * since B1. `screen_time_usage` had none of those: no writer outside tests, and
 * a legacy heartbeat that could not match a child because the browser sent
 * `learner-12` while the JSON store held `student_1..4`. **No child had ever
 * been locked out.**
 *
 * What only a database can answer is here — that time accumulates across beats,
 * that the leftover seconds are not rounded away, that a missed afternoon is
 * capped, and that the day rolls. The arithmetic of the decision is covered
 * without a database in `screenTime.test.ts`.
 */

import { and, eq } from 'drizzle-orm';
import type { MySql2Database } from 'drizzle-orm/mysql2';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import * as schema from '../../drizzle/schema';
import { createTestDatabase, type TestDatabase } from '../test-support/database';
import { MAX_BEAT_SECONDS, recordScreenTime, screenTimeState, serverDay } from './screenTime';

const DATABASE_URL = process.env.DATABASE_URL;
if (process.env.CI && !DATABASE_URL) {
  throw new Error('DATABASE_URL is unset in CI; this suite would skip while covering nothing.');
}
const describeWithDb = DATABASE_URL ? describe : describe.skip;

describeWithDb('screen time', () => {
  let harness: TestDatabase;
  let db: MySql2Database<typeof schema>;
  let maya: number;

  /** A fixed start, so "one minute later" means one minute and not a race. */
  const start = new Date('2026-09-12T09:00:00');
  const at = (secondsIn: number) => new Date(start.getTime() + secondsIn * 1000);

  beforeAll(async () => {
    harness = await createTestDatabase('screentime');
    db = harness.db;
  }, 60_000);

  afterAll(async () => {
    await harness?.close();
  });

  beforeEach(async () => {
    await harness.reset();
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
  }, 60_000);

  const setLimit = (dailyLimitMinutes: number) =>
    db.insert(schema.screenTimeRules).values({ learnerId: maya, dailyLimitMinutes });

  const usageRow = async () => {
    const [row] = await db
      .select()
      .from(schema.screenTimeUsage)
      .where(
        and(
          eq(schema.screenTimeUsage.learnerId, maya),
          eq(schema.screenTimeUsage.day, serverDay(start)),
        ),
      );
    return row;
  };

  describe('counting', () => {
    it('banks nothing on the first beat of the day', async () => {
      // There is no earlier mark to measure from. Inventing one would charge
      // the child for every minute since midnight.
      const state = await recordScreenTime(db, maya, start);
      expect(state.minutesSpent).toBe(0);
      expect((await usageRow()).minutesSpent).toBe(0);
    });

    it('accumulates a minute per beat', async () => {
      await recordScreenTime(db, maya, at(0));
      expect((await recordScreenTime(db, maya, at(60))).minutesSpent).toBe(1);
      expect((await recordScreenTime(db, maya, at(120))).minutesSpent).toBe(2);
      expect((await recordScreenTime(db, maya, at(180))).minutesSpent).toBe(3);
    });

    it('carries the leftover seconds instead of rounding them away', async () => {
      /*
       * The defect this prevents. Beats arrive a shade over the minute — jitter
       * guarantees it — so if `countedThrough` moved to `now` on every beat,
       * each would bank one minute and discard the remainder. Here beats land
       * at 59-second intervals: the first four bank 3 minutes between them, and
       * the leftovers add the fourth rather than evaporating.
       */
      await recordScreenTime(db, maya, at(0));
      for (const second of [59, 118, 177, 236]) {
        await recordScreenTime(db, maya, at(second));
      }
      expect((await usageRow()).minutesSpent).toBe(3);

      // 236s elapsed, 180 banked, 56 still carried. One more beat crosses.
      expect((await recordScreenTime(db, maya, at(295))).minutesSpent).toBe(4);
    });

    it('banks nothing when a beat arrives early', async () => {
      await recordScreenTime(db, maya, at(0));
      const state = await recordScreenTime(db, maya, at(30));
      expect(state.minutesSpent).toBe(0);
      // And the mark has not moved, so the 30 seconds are not lost either.
      expect((await recordScreenTime(db, maya, at(60))).minutesSpent).toBe(1);
    });

    it('caps a long gap rather than charging for it', async () => {
      // A laptop that slept for six hours must not cost six hours of screen
      // time. A missed beat costs nothing; it does not cost the gap.
      await recordScreenTime(db, maya, at(0));
      const state = await recordScreenTime(db, maya, at(6 * 60 * 60));
      expect(state.minutesSpent).toBe(MAX_BEAT_SECONDS / 60);
    });

    it('never runs backwards on a clock that jumps back', async () => {
      await recordScreenTime(db, maya, at(0));
      await recordScreenTime(db, maya, at(120));
      const state = await recordScreenTime(db, maya, at(-3600));
      expect(state.minutesSpent).toBe(2);
    });

    it('starts a fresh row when the day rolls', async () => {
      await recordScreenTime(db, maya, at(0));
      await recordScreenTime(db, maya, at(120));

      const tomorrow = new Date(start.getTime() + 24 * 60 * 60 * 1000);
      const state = await recordScreenTime(db, maya, tomorrow);
      expect(state.day).toBe(serverDay(tomorrow));
      expect(state.minutesSpent).toBe(0);

      // Yesterday's total is still there; a new day is not an erasure.
      expect((await usageRow()).minutesSpent).toBe(2);
    });

    it('keeps one row per learner per day', async () => {
      for (const second of [0, 60, 120, 180]) {
        await recordScreenTime(db, maya, at(second));
      }
      const rows = await db
        .select()
        .from(schema.screenTimeUsage)
        .where(eq(schema.screenTimeUsage.learnerId, maya));
      expect(rows).toHaveLength(1);
    });
  });

  describe('the limit', () => {
    it('does not lock a child whose parent set no limit', async () => {
      /*
       * No rule is "no limit set", not "a limit of zero". `screen_time_rules`
       * has no row until a parent opens the control, and reading the absence as
       * zero would lock out every child on the platform whose parent never did.
       */
      await recordScreenTime(db, maya, at(0));
      const state = await recordScreenTime(db, maya, at(60));
      expect(state.dailyLimitMinutes).toBeNull();
      expect(state.remainingMinutes).toBeNull();
      expect(state.isLocked).toBe(false);
    });

    it('locks when the limit is reached', async () => {
      await setLimit(2);
      await recordScreenTime(db, maya, at(0));

      expect((await recordScreenTime(db, maya, at(60))).isLocked).toBe(false);
      const locked = await recordScreenTime(db, maya, at(120));
      expect(locked.isLocked).toBe(true);
      expect(locked.remainingMinutes).toBe(0);
    });

    it('stays locked once past the limit', async () => {
      await setLimit(1);
      await recordScreenTime(db, maya, at(0));
      await recordScreenTime(db, maya, at(60));
      expect((await recordScreenTime(db, maya, at(120))).isLocked).toBe(true);
    });

    it('reports what is left', async () => {
      await setLimit(45);
      await recordScreenTime(db, maya, at(0));
      const state = await recordScreenTime(db, maya, at(120));
      expect(state.minutesSpent).toBe(2);
      expect(state.remainingMinutes).toBe(43);
    });

    it('locks a child already over a limit set later in the day', async () => {
      // The parent lowers the limit while the child is practising. The next
      // beat has to honour it rather than waiting for tomorrow.
      await recordScreenTime(db, maya, at(0));
      await recordScreenTime(db, maya, at(MAX_BEAT_SECONDS * 1000));
      await recordScreenTime(db, maya, at(180));
      await setLimit(1);
      expect((await recordScreenTime(db, maya, at(240))).isLocked).toBe(true);
    });
  });

  describe('reading without counting', () => {
    it('reports the state without advancing the clock', async () => {
      /*
       * The reload path. Beating on mount would bank the time the browser spent
       * closed, so a child who shut the laptop at the limit and opened it the
       * next morning would be charged for the night.
       */
      await setLimit(45);
      await recordScreenTime(db, maya, at(0));
      await recordScreenTime(db, maya, at(120));

      const before = await usageRow();
      const state = await screenTimeState(db, maya, at(9999));
      expect(state.minutesSpent).toBe(2);
      expect((await usageRow()).minutesSpent).toBe(before.minutesSpent);
      expect((await usageRow()).countedThrough).toEqual(before.countedThrough);
    });

    it('answers for a child with no usage row at all', async () => {
      await setLimit(30);
      const state = await screenTimeState(db, maya, start);
      expect(state.minutesSpent).toBe(0);
      expect(state.isLocked).toBe(false);
      expect(state.remainingMinutes).toBe(30);
    });
  });
});
