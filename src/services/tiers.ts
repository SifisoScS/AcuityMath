/**
 * Which developmental tier an age belongs to, in one place.
 *
 * There were two answers to this before, and they disagreed. `determineTierForAge`
 * in `utils/storage.ts` banded at 6 / 10 / 14, matching the navigation labels
 * ("Early Sprouts 3–6", "Math Navigators 7–10") and `AGE_PROFILES`.
 * `AdaptiveEngine.createInitialProfile` banded at 5 / 10 / 13 when seeding a new
 * learner's starting ability.
 *
 * The consequence was quiet and real: a six-year-old was placed in Early Sprouts
 * and given the starting ability of a seven-to-ten year old, so their very first
 * questions were pitched a tier above them. The same happened at fourteen. A
 * child meeting material two years ahead on their first session is the outcome
 * adaptive difficulty exists to prevent.
 *
 * The navigation's bands win, because they are what a parent reads and what the
 * curriculum content is organised by. The engine now shares them.
 */

export type AgeTier = 'early' | 'elementary' | 'middle' | 'high';

export interface TierBand {
  tier: AgeTier;
  label: string;
  /** Inclusive. `high` has no upper bound in practice; 18 is where content stops. */
  lowAge: number;
  highAge: number;
  /**
   * Where a learner of this tier starts on the latent ability scale, before any
   * evidence. Negative means "expect the easier end of the item bank".
   */
  baseTheta: number;
}

export const TIER_BANDS: readonly TierBand[] = [
  { tier: 'early', label: 'Early Sprouts', lowAge: 3, highAge: 6, baseTheta: -1.2 },
  { tier: 'elementary', label: 'Math Navigators', lowAge: 7, highAge: 10, baseTheta: -0.3 },
  { tier: 'middle', label: 'Algebra Voyagers', lowAge: 11, highAge: 14, baseTheta: 0.4 },
  { tier: 'high', label: 'STEM Pioneers', lowAge: 15, highAge: 18, baseTheta: 1.0 },
];

/**
 * The tier for an age.
 *
 * Ages below the youngest band resolve to `early` and ages above the oldest to
 * `high` rather than throwing: a learner is never left without content because
 * their birth year was mistyped, and the tiers at each end are the closest
 * honest answer.
 */
export function tierForAge(age: number): AgeTier {
  for (const band of TIER_BANDS) {
    if (age <= band.highAge) return band.tier;
  }
  return 'high';
}

export function bandForTier(tier: AgeTier): TierBand {
  const band = TIER_BANDS.find(b => b.tier === tier);
  if (!band) throw new Error(`Unknown tier ${tier}`);
  return band;
}

/** The starting ability for a learner of this age, before any evidence. */
export function baseThetaForAge(age: number): number {
  return bandForTier(tierForAge(age)).baseTheta;
}

/**
 * A learner's age from their birth year.
 *
 * The schema stores the year rather than an age, because an age column is wrong
 * within a year of being written. This is approximate by exactly that much — it
 * does not know a birthday — which is close enough to choose a tier and not
 * close enough to print on anything.
 */
export function approximateAge(birthYear: number, now: Date = new Date()): number {
  return now.getFullYear() - birthYear;
}
