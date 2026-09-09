import { describe, expect, it } from 'vitest';

import { AdaptiveEngine } from './adaptiveEngine';
import { approximateAge, baseThetaForAge, TIER_BANDS, tierForAge } from './tiers';
import { determineTierForAge } from '../utils/storage';

describe('tierForAge', () => {
  it('places every age from 3 to 18 in exactly one tier', () => {
    for (let age = 3; age <= 18; age++) {
      const bands = TIER_BANDS.filter(b => age >= b.lowAge && age <= b.highAge);
      expect(bands, `age ${age}`).toHaveLength(1);
      expect(tierForAge(age)).toBe(bands[0].tier);
    }
  });

  it('leaves no gap between the bands', () => {
    for (let i = 1; i < TIER_BANDS.length; i++) {
      expect(TIER_BANDS[i].lowAge).toBe(TIER_BANDS[i - 1].highAge + 1);
    }
  });

  it('answers for ages outside the curriculum rather than throwing', () => {
    // A mistyped birth year must not leave a learner with no content.
    expect(tierForAge(1)).toBe('early');
    expect(tierForAge(40)).toBe('high');
  });

  it('matches the navigation labels a parent reads', () => {
    // "Early Sprouts 3–6", "Math Navigators 7–10", "Algebra Voyagers 11–14",
    // "STEM Pioneers 15–18" in App.tsx.
    expect(tierForAge(6)).toBe('early');
    expect(tierForAge(7)).toBe('elementary');
    expect(tierForAge(10)).toBe('elementary');
    expect(tierForAge(11)).toBe('middle');
    expect(tierForAge(14)).toBe('middle');
    expect(tierForAge(15)).toBe('high');
  });
});

describe('the tier bands have one definition', () => {
  it('agrees with the storage helper at every age', () => {
    for (let age = 3; age <= 18; age++) {
      expect(determineTierForAge(age), `age ${age}`).toBe(tierForAge(age));
    }
  });

  it('gives a learner the starting ability of the tier they are placed in', () => {
    // The defect this module exists to close. `AdaptiveEngine` banded at 5/10/13
    // while the tier placement banded at 6/10/14, so a six-year-old was put in
    // Early Sprouts and seeded with the ability of a seven-to-ten year old —
    // their first questions came out a tier above them. Fourteen had the same
    // problem at the other boundary.
    for (let age = 3; age <= 18; age++) {
      const seeded = AdaptiveEngine.createInitialProfile(age).theta;
      const expected = baseThetaForAge(age);
      expect(seeded, `age ${age}`).toBe(expected);
    }
  });

  it('specifically no longer misplaces a six- or fourteen-year-old', () => {
    expect(AdaptiveEngine.createInitialProfile(6).theta).toBe(baseThetaForAge(6));
    expect(AdaptiveEngine.createInitialProfile(6).theta).toBeLessThan(
      AdaptiveEngine.createInitialProfile(7).theta,
    );

    expect(AdaptiveEngine.createInitialProfile(14).theta).toBe(baseThetaForAge(14));
    expect(AdaptiveEngine.createInitialProfile(14).theta).toBeLessThan(
      AdaptiveEngine.createInitialProfile(15).theta,
    );
  });

  it('starts each tier above the one below it', () => {
    for (let i = 1; i < TIER_BANDS.length; i++) {
      expect(TIER_BANDS[i].baseTheta).toBeGreaterThan(TIER_BANDS[i - 1].baseTheta);
    }
  });
});

describe('approximateAge', () => {
  it('is the difference in years', () => {
    expect(approximateAge(2018, new Date('2026-09-09T00:00:00Z'))).toBe(2026 - 2018);
  });

  it('does not pretend to know a birthday', () => {
    // Same answer in January and December: the schema stores a year, so this is
    // approximate by up to a year and is used to choose a tier, nothing finer.
    const january = approximateAge(2018, new Date('2026-01-02T00:00:00Z'));
    const december = approximateAge(2018, new Date('2026-12-30T00:00:00Z'));
    expect(january).toBe(december);
  });
});
