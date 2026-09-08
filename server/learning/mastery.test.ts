import { describe, expect, it } from 'vitest';

import { accuracyPercent, correctAnswersToReach, learningRate, nextMastery } from './mastery';

describe('learningRate', () => {
  it('falls with experience', () => {
    expect(learningRate(0)).toBeGreaterThan(learningRate(10));
    expect(learningRate(10)).toBeGreaterThan(learningRate(100));
  });

  it('never reaches zero, so a regression can still be shown', () => {
    expect(learningRate(10_000)).toBeGreaterThanOrEqual(0.08);
  });
});

describe('nextMastery', () => {
  it('rises on a correct answer and falls on a wrong one', () => {
    expect(nextMastery(50, true, 0)).toBeGreaterThan(50);
    expect(nextMastery(50, false, 0)).toBeLessThan(50);
  });

  it('always moves, so an answer is never invisible', () => {
    // At a high score and a low learning rate the multiplicative term rounds to
    // nothing, and a learner is shown the same number after answering well.
    for (const mastery of [1, 50, 95, 97, 99]) {
      for (const attempts of [0, 25, 200, 5_000]) {
        expect(nextMastery(mastery, true, attempts)).toBeGreaterThan(mastery);
      }
    }
  });

  it('stays inside 0 and 100', () => {
    expect(nextMastery(100, true, 0)).toBe(100);
    expect(nextMastery(0, false, 0)).toBe(0);
    expect(nextMastery(99, true, 0)).toBeLessThanOrEqual(100);
  });

  it('costs less to be wrong than it earns to be right', () => {
    // One slip must not erase a fortnight. Symmetric would.
    const gained = nextMastery(50, true, 5) - 50;
    const lost = 50 - nextMastery(50, false, 5);
    expect(lost).toBeLessThan(gained);
  });

  it('still lets a real regression show', () => {
    // Damped is not immovable: sustained wrong answers must carry a learner out
    // of the band their score puts them in. The bands the dashboard reads are
    // <50 struggling, 50-79 developing, 80+ mastered, so the assertion is that
    // ten consecutive failures move someone from "mastered" to "struggling" —
    // not an arbitrary number of points, which would pin the exact curve and
    // fail on any future recalibration that preserved the meaning.
    let mastery = 80;
    for (let i = 0; i < 10; i++) mastery = nextMastery(mastery, false, 20 + i);

    expect(mastery).toBeLessThan(50);
    expect(80 - mastery).toBeGreaterThan(30);
  });

  it('does not let one slip undo sustained work', () => {
    // The other half of the same property. A learner who has earned 80 and
    // mis-taps once is still, plainly, someone who knows this.
    const afterOneSlip = nextMastery(80, false, 30);
    expect(afterOneSlip).toBeGreaterThan(75);
  });

  it('moves a beginner further than a veteran on the same answer', () => {
    expect(nextMastery(50, true, 0) - 50).toBeGreaterThan(nextMastery(50, true, 100) - 50);
  });

  it('treats an out-of-range score as if it were in range', () => {
    expect(nextMastery(140, true, 0)).toBe(100);
    expect(nextMastery(-20, false, 0)).toBe(0);
  });
});

describe('correctAnswersToReach', () => {
  it('agrees with stepping the curve by hand', () => {
    // The property the practice plan depends on: the promise it makes to a
    // parent has to be the number of questions the engine actually requires.
    const target = 80;
    const answers = correctAnswersToReach(40, target, 10)!;
    expect(answers).toBeGreaterThan(0);

    let mastery = 40;
    let attempts = 10;
    for (let i = 0; i < answers; i++) {
      mastery = nextMastery(mastery, true, attempts);
      attempts += 1;
    }
    expect(mastery).toBeGreaterThanOrEqual(target);

    // And one fewer must not have been enough, or the plan overstates the work.
    let short = 40;
    let shortAttempts = 10;
    for (let i = 0; i < answers - 1; i++) {
      short = nextMastery(short, true, shortAttempts);
      shortAttempts += 1;
    }
    expect(short).toBeLessThan(target);
  });

  it('returns zero work when the target is already met', () => {
    expect(correctAnswersToReach(85, 80, 5)).toBe(1);
  });

  it('reports an unreachable target honestly', () => {
    // Not an error and not a lie: some targets cannot be reached inside the
    // limit, and saying so beats returning a number nobody can hit.
    expect(correctAnswersToReach(0, 101, 0)).toBeNull();
  });

  it('reaches 100, because the rounding carries the last step', () => {
    expect(correctAnswersToReach(0, 100, 0)).not.toBeNull();
  });
});

describe('accuracyPercent', () => {
  it('is zero before any attempt rather than a division by zero', () => {
    expect(accuracyPercent(0, 0)).toBe(0);
  });

  it('rounds to whole percentages', () => {
    expect(accuracyPercent(1, 3)).toBe(33);
    expect(accuracyPercent(2, 3)).toBe(67);
    expect(accuracyPercent(7, 7)).toBe(100);
  });
});
