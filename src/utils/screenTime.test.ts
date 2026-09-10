/**
 * The meter shown to a child, and the distinction it turns on.
 *
 * Both bugs these cover shipped: an invented `{ 42, 45 }` fallback, and then
 * `max(0, 0 - used)` reading an unset limit as an exhausted one.
 */

import { describe, expect, it } from 'vitest';

import { screenTimeMeter } from './screenTime';

describe('screen time meter', () => {
  describe('when no parent has set a limit', () => {
    const noRule = { totalTimeMinutes: 12, screenTimeLimitMinutes: 0 };

    it('reports no limit rather than a limit of zero', () => {
      expect(screenTimeMeter(noRule).hasLimit).toBe(false);
    });

    it('does not warn the child that their time is nearly up', () => {
      // `max(0, 0 - 12)` is zero remaining, which compares as "at the limit".
      // Every child whose parent had set nothing would sit permanently in the
      // red, pulsing state.
      expect(screenTimeMeter(noRule).isNearLimit).toBe(false);
    });

    it('leaves nothing remaining to count down', () => {
      expect(screenTimeMeter(noRule).remainingMinutes).toBe(Infinity);
    });
  });

  describe('when there is no analytics at all', () => {
    it('invents neither the minutes used nor the limit', () => {
      // This returned `{ totalTimeMinutes: 42, screenTimeLimitMinutes: 45 }`.
      const meter = screenTimeMeter(undefined);
      expect(meter.minutesUsed).toBe(0);
      expect(meter.limitMinutes).toBe(0);
      expect(meter.hasLimit).toBe(false);
      expect(meter.isNearLimit).toBe(false);
    });
  });

  describe('when a parent has set one', () => {
    it('counts down from it', () => {
      const meter = screenTimeMeter({ totalTimeMinutes: 20, screenTimeLimitMinutes: 45 });
      expect(meter.hasLimit).toBe(true);
      expect(meter.remainingMinutes).toBe(25);
      expect(meter.isNearLimit).toBe(false);
    });

    it('warns inside the last five minutes', () => {
      expect(screenTimeMeter({ totalTimeMinutes: 41, screenTimeLimitMinutes: 45 }).isNearLimit).toBe(true);
    });

    it('does not go negative once the limit is passed', () => {
      const meter = screenTimeMeter({ totalTimeMinutes: 90, screenTimeLimitMinutes: 45 });
      expect(meter.remainingMinutes).toBe(0);
      expect(meter.isNearLimit).toBe(true);
    });
  });
});
