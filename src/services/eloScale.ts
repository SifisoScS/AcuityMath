/**
 * The one place ability becomes a rating.
 *
 * θ is the measurement; ELO is how it is shown to a child and a teacher. The
 * conversion is arithmetic, and arithmetic duplicated is arithmetic that
 * eventually disagrees — which it had, four ways:
 *
 * - `ARCHITECTURE.md` §4 specified `1000 + 250θ`.
 * - `adaptiveEngine.ts` computed `1200 + 300θ`, in two places.
 * - `adaptiveWorker.ts` computed `1200 + 300θ` again, independently, so the
 *   worker and its own main-thread fallback each carried a copy of the rule.
 * - `ProfileSwitchModal` seeded a new learner at 900, 1200, 1500 or 1800 by
 *   *age tier*, which is not a conversion of anything.
 *
 * The document wins. It is the specification, its anchors are the ones written
 * down for teachers — θ = 0 is grade level, ±2 is a 500-point move — and a
 * benchmark of 1000 is the number a reader can hold.
 *
 * **Changed while it was free.** Every rating a learner has ever seen moves with
 * this, and today the only learners are a demonstration family. The same
 * reasoning as the consent policy bump: the cost of a change like this only
 * rises.
 */

/** θ = 0 — the grade-level benchmark. */
export const ELO_AT_BENCHMARK = 1000;

/** Points per unit of ability. θ = +2 is 500 points above the benchmark. */
export const ELO_PER_THETA = 250;

/**
 * The range θ is reported within.
 *
 * `adaptiveEngine` clamps θ to [-3, +3], so the rating is bounded too. Both the
 * old comments about this were wrong: one claimed `-3 → 700` beside a formula
 * that produced 300, and the interface said "Scaled 600 to 2400" when nothing
 * could reach either end. Derived here rather than asserted, so it cannot drift
 * from the formula again.
 */
export const THETA_MIN = -3;
export const THETA_MAX = 3;
export const ELO_MIN = ELO_AT_BENCHMARK + ELO_PER_THETA * THETA_MIN; // 250
export const ELO_MAX = ELO_AT_BENCHMARK + ELO_PER_THETA * THETA_MAX; // 1750

/**
 * A rating for an ability estimate.
 *
 * Rounded, because a rating with decimals invites a child to read precision the
 * measurement does not have — the standard error is rarely below 0.18, which is
 * 45 points wide.
 */
export function eloForTheta(theta: number): number {
  const bounded = Math.max(THETA_MIN, Math.min(THETA_MAX, theta));
  return Math.round(ELO_AT_BENCHMARK + bounded * ELO_PER_THETA);
}

/**
 * Where a learner starts before anything has been measured.
 *
 * The benchmark, for everybody. A new profile used to be seeded by age tier —
 * a three-year-old at 900, a sixteen-year-old at 1800 — which states an ability
 * estimate derived from a birthday. **Age is not ability**, and inferring one
 * from the other is precisely what the seven-item Placement Quest exists to
 * avoid. The quest moves it; until then the honest value is "not yet measured",
 * and the neutral prior is how that is written.
 */
export const ELO_UNMEASURED = eloForTheta(0);
