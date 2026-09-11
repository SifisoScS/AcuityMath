/**
 * The streak rule, in isolation.
 *
 * All the awkward cases here are about dates — a missed day, a shield covering a
 * holiday, a clock that went backwards — and standing up MySQL to ask what
 * happens after a two-day gap would make them tedious enough to skip. The
 * database side is covered by `rewards.integration.test.ts`.
 */

import { describe, expect, it } from 'vitest';

import { advanceStreak, dayOf, DAYS_PER_SHIELD, MAX_SHIELDS } from './rewards';

const from = (
  streakDays: number,
  streakShields: number,
  lastPracticedOn: string | null,
) => ({ streakDays, streakShields, lastPracticedOn });

describe('advancing a streak', () => {
  it('starts at one for a learner who has never practised', () => {
    const next = advanceStreak(from(0, 0, null), '2026-09-10');
    expect(next.streakDays).toBe(1);
    expect(next.extended).toBe(true);
  });

  it('counts days, not answers', () => {
    // A child who answers forty questions in one sitting has practised one day.
    const next = advanceStreak(from(4, 0, '2026-09-10'), '2026-09-10');
    expect(next.streakDays).toBe(4);
    expect(next.extended).toBe(false);
  });

  it('extends on the following day', () => {
    expect(advanceStreak(from(4, 0, '2026-09-09'), '2026-09-10').streakDays).toBe(5);
  });

  it('extends across a month boundary', () => {
    // Arithmetic on date strings is where this sort of rule usually breaks.
    expect(advanceStreak(from(9, 0, '2026-08-31'), '2026-09-01').streakDays).toBe(10);
  });

  it('extends across a year boundary', () => {
    expect(advanceStreak(from(9, 0, '2026-12-31'), '2027-01-01').streakDays).toBe(10);
  });

  describe('when a day is missed', () => {
    it('breaks the streak when there is no shield', () => {
      const next = advanceStreak(from(20, 0, '2026-09-08'), '2026-09-10');
      expect(next.streakDays).toBe(1);
      expect(next.shieldSpent).toBe(false);
    });

    it('spends a shield to keep it', () => {
      // Day 20, deliberately not a multiple of seven — see the next test.
      const next = advanceStreak(from(19, 2, '2026-09-08'), '2026-09-10');
      expect(next.streakDays).toBe(20);
      expect(next.streakShields).toBe(1);
      expect(next.shieldSpent).toBe(true);
    });

    it('can spend and earn a shield on the same answer', () => {
      /*
       * Surprising, and correct. A child on day 20 who misses a day spends a
       * shield to reach day 21 — which is a multiple of seven, so it earns one
       * back. The net effect is no change to the reserve, and pinning it here
       * means a future reading of the code does not "fix" it into a rule where
       * a missed day silently costs a shield the child then re-earns invisibly.
       */
      const next = advanceStreak(from(20, 2, '2026-09-08'), '2026-09-10');
      expect(next.streakDays).toBe(21);
      expect(next.shieldSpent).toBe(true);
      expect(next.shieldEarned).toBe(true);
      expect(next.streakShields).toBe(2);
    });

    it('spends one shield however long the gap', () => {
      // One per missed day would burn a child's whole reserve on a single
      // holiday without them ever choosing to.
      const next = advanceStreak(from(30, 2, '2026-08-01'), '2026-09-10');
      expect(next.streakShields).toBe(1);
      expect(next.streakDays).toBe(31);
    });
  });

  describe('earning shields', () => {
    it('earns one on reaching seven days', () => {
      const next = advanceStreak(from(DAYS_PER_SHIELD - 1, 0, '2026-09-09'), '2026-09-10');
      expect(next.streakDays).toBe(DAYS_PER_SHIELD);
      expect(next.shieldEarned).toBe(true);
      expect(next.streakShields).toBe(1);
    });

    it('earns nothing on the days between', () => {
      const next = advanceStreak(from(3, 0, '2026-09-09'), '2026-09-10');
      expect(next.shieldEarned).toBe(false);
    });

    it('does not earn one twice for sitting on the same day', () => {
      // Without the "did the streak move" condition, a child on day seven would
      // earn a shield for every answer.
      const next = advanceStreak(from(DAYS_PER_SHIELD, 1, '2026-09-10'), '2026-09-10');
      expect(next.shieldEarned).toBe(false);
      expect(next.streakShields).toBe(1);
    });

    it('stops at the cap', () => {
      // Unbounded, a child who practised daily for a year could miss two months
      // and keep an unbroken streak, which makes the streak meaningless.
      const next = advanceStreak(from(DAYS_PER_SHIELD * 4 - 1, MAX_SHIELDS, '2026-09-09'), '2026-09-10');
      expect(next.streakShields).toBe(MAX_SHIELDS);
      expect(next.shieldEarned).toBe(false);
    });
  });

  describe('a clock that went backwards', () => {
    it('starts again rather than computing a negative gap', () => {
      // A device with the wrong date, or a timezone change. Either way the
      // arithmetic should not decide anything.
      const next = advanceStreak(from(12, 1, '2026-09-20'), '2026-09-10');
      expect(next.streakDays).toBe(1);
      expect(next.shieldSpent).toBe(false);
    });
  });
});

describe('the day an answer falls on', () => {
  it('uses local date parts rather than an ISO string', () => {
    // `toISOString().slice(0, 10)` is UTC, so an answer at 9pm on the 10th in a
    // timezone four hours behind would be recorded as the 11th, and a child
    // would be told they practised on a day they did not.
    const at = new Date(2026, 8, 10, 21, 30);
    expect(dayOf(at)).toBe('2026-09-10');
  });

  it('pads single digits', () => {
    expect(dayOf(new Date(2026, 0, 5))).toBe('2026-01-05');
  });
});
