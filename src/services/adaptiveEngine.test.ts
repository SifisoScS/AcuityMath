/**
 * The 3PL psychometric core.
 *
 * These are the properties the adaptive loop depends on, rather than a
 * restatement of the arithmetic: a correct answer must not lower ability, the
 * standard error must not grow as evidence accumulates, and theta must stay
 * inside the range every downstream mapping assumes. A regression in any of
 * them mis-sizes the next question a learner sees.
 */

import { describe, expect, it } from 'vitest';

import { AdaptiveEngine, type ItemParameters, type StudentAbilityProfile } from './adaptiveEngine';

const item: ItemParameters = { discrimination: 1.2, difficulty: 0, pseudoGuessing: 0.25 };

const profileAt = (theta: number): StudentAbilityProfile => ({
  ...AdaptiveEngine.createInitialProfile(10),
  theta,
});

describe('calculateProbability', () => {
  it('never falls below the guessing floor', () => {
    // A learner far below the item's difficulty can still guess it.
    expect(AdaptiveEngine.calculateProbability(-3, item)).toBeGreaterThanOrEqual(item.pseudoGuessing);
  });

  it('approaches certainty far above the item difficulty', () => {
    expect(AdaptiveEngine.calculateProbability(3, item)).toBeGreaterThan(0.95);
    expect(AdaptiveEngine.calculateProbability(3, item)).toBeLessThanOrEqual(1);
  });

  it('rises monotonically with ability', () => {
    const thetas = [-3, -2, -1, 0, 1, 2, 3];
    const probabilities = thetas.map(t => AdaptiveEngine.calculateProbability(t, item));
    for (let i = 1; i < probabilities.length; i++) {
      expect(probabilities[i]).toBeGreaterThan(probabilities[i - 1]);
    }
  });

  it('sits halfway between the floor and 1 when ability equals difficulty', () => {
    // At theta = b the logistic term is exactly 0.5, so P = c + (1 - c)/2.
    const expected = item.pseudoGuessing + (1 - item.pseudoGuessing) / 2;
    expect(AdaptiveEngine.calculateProbability(0, item)).toBeCloseTo(expected, 10);
  });
});

describe('calculateItemInformation', () => {
  it('peaks near the item difficulty', () => {
    const atDifficulty = AdaptiveEngine.calculateItemInformation(0, item);
    expect(atDifficulty).toBeGreaterThan(AdaptiveEngine.calculateItemInformation(-2.5, item));
    expect(atDifficulty).toBeGreaterThan(AdaptiveEngine.calculateItemInformation(2.5, item));
  });

  it('is always positive, so it can be divided by', () => {
    for (const theta of [-3, -1, 0, 1, 3]) {
      expect(AdaptiveEngine.calculateItemInformation(theta, item)).toBeGreaterThan(0);
    }
  });
});

describe('updateAbility', () => {
  it('does not lower ability after a correct answer', () => {
    const before = profileAt(0);
    const after = AdaptiveEngine.updateAbility(before, { itemParams: item, isCorrect: true });
    expect(after.theta).toBeGreaterThanOrEqual(before.theta);
  });

  it('does not raise ability after a wrong answer', () => {
    const before = profileAt(0);
    const after = AdaptiveEngine.updateAbility(before, { itemParams: item, isCorrect: false });
    expect(after.theta).toBeLessThanOrEqual(before.theta);
  });

  it('keeps theta inside the range the level and ELO mappings assume', () => {
    let profile = profileAt(2.9);
    for (let i = 0; i < 60; i++) {
      profile = AdaptiveEngine.updateAbility(profile, { itemParams: item, isCorrect: true });
    }
    expect(profile.theta).toBeLessThanOrEqual(3);

    profile = profileAt(-2.9);
    for (let i = 0; i < 60; i++) {
      profile = AdaptiveEngine.updateAbility(profile, { itemParams: item, isCorrect: false });
    }
    expect(profile.theta).toBeGreaterThanOrEqual(-3);
  });

  it('never grows the standard error as evidence accumulates', () => {
    let profile = profileAt(0);
    let previous = profile.standardError;
    for (let i = 0; i < 25; i++) {
      profile = AdaptiveEngine.updateAbility(profile, { itemParams: item, isCorrect: i % 2 === 0 });
      expect(profile.standardError).toBeLessThanOrEqual(previous);
      previous = profile.standardError;
    }
  });

  it('settles: later answers move theta less than the first', () => {
    const first = AdaptiveEngine.updateAbility(profileAt(0), { itemParams: item, isCorrect: true });
    const firstStep = Math.abs(first.theta - 0);

    let profile = profileAt(0);
    for (let i = 0; i < 30; i++) {
      profile = AdaptiveEngine.updateAbility(profile, { itemParams: item, isCorrect: i % 2 === 0 });
    }
    const settled = AdaptiveEngine.updateAbility(profile, { itemParams: item, isCorrect: true });
    expect(Math.abs(settled.theta - profile.theta)).toBeLessThan(firstStep);
  });

  it('counts a misconception only when the answer was wrong', () => {
    const wrong = AdaptiveEngine.updateAbility(profileAt(0), {
      itemParams: item,
      isCorrect: false,
      misconceptionCode: 'SIGN_ERROR',
    });
    expect(wrong.misconceptionsMap.SIGN_ERROR).toBe(1);

    const right = AdaptiveEngine.updateAbility(profileAt(0), {
      itemParams: item,
      isCorrect: true,
      misconceptionCode: 'SIGN_ERROR',
    });
    expect(right.misconceptionsMap.SIGN_ERROR).toBe(0);
  });

  it('keeps the confidence interval around theta and inside the scale', () => {
    const profile = AdaptiveEngine.updateAbility(profileAt(0), { itemParams: item, isCorrect: true });
    const [low, high] = profile.confidenceInterval;
    expect(low).toBeLessThanOrEqual(profile.theta);
    expect(high).toBeGreaterThanOrEqual(profile.theta);
    expect(low).toBeGreaterThanOrEqual(-3);
    expect(high).toBeLessThanOrEqual(3);
  });

  it('advances the history count by exactly one', () => {
    const before = profileAt(0);
    const after = AdaptiveEngine.updateAbility(before, { itemParams: item, isCorrect: true });
    expect(after.historyCount).toBe(before.historyCount + 1);
  });
});

describe('createInitialProfile', () => {
  it('starts younger learners lower on the scale', () => {
    const ages = [4, 8, 12, 16];
    const thetas = ages.map(age => AdaptiveEngine.createInitialProfile(age).theta);
    for (let i = 1; i < thetas.length; i++) {
      expect(thetas[i]).toBeGreaterThan(thetas[i - 1]);
    }
  });

  it('produces a level and ELO consistent with its own theta', () => {
    for (const age of [4, 8, 12, 16]) {
      const profile = AdaptiveEngine.createInitialProfile(age);
      expect(profile.dynamicLevel).toBeGreaterThanOrEqual(1);
      expect(profile.dynamicLevel).toBeLessThanOrEqual(10);
      expect(profile.eloRating).toBe(Math.round(1200 + profile.theta * 300));
    }
  });

  it('starts every misconception at zero', () => {
    const profile = AdaptiveEngine.createInitialProfile(8);
    for (const count of Object.values(profile.misconceptionsMap)) {
      expect(count).toBe(0);
    }
  });
});
