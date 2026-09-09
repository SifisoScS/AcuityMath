/**
 * How an answer becomes a mastery score.
 *
 * Kept pure and separate from the database write so the curve can be reasoned
 * about and tested without a server. `recordAttempt` composes this with the
 * 3PL ability update; neither knows about the other.
 */

/** Mastery is a percentage, held as an integer because that is how it is shown. */
export const MASTERY_MIN = 0;
export const MASTERY_MAX = 100;

/**
 * How far a single answer moves mastery.
 *
 * Falls with the square root of experience, so the first answers on a concept
 * move the score decisively and the hundredth barely does. The floor stops it
 * reaching zero: a learner who has regressed must still be able to demonstrate
 * it, which a curve that has stopped responding cannot show.
 */
export function learningRate(priorAttempts: number): number {
  return Math.max(0.08, 0.4 / Math.sqrt(priorAttempts + 1));
}

/**
 * Wrong answers cost less than right answers earn.
 *
 * Not sentimentality — a slip, a mis-tap and a genuine gap are indistinguishable
 * from one attempt, and a symmetric curve lets a single bad afternoon erase a
 * fortnight of evidence. The asymmetry means a real regression still shows,
 * because it takes several wrong answers rather than one.
 */
const REGRESSION_DAMPING = 0.6;

/**
 * The mastery score after one attempt.
 *
 * Rounds outward — up on a correct answer, down on a wrong one — so that
 * progress is never invisible. With `Math.round`, a learner at 97 answering
 * correctly at a low learning rate would compute 97.4 and be shown 97 again,
 * which reads as "that did not count".
 *
 * A consequence worth knowing: mastery converges on but never reaches 100 by
 * the multiplicative term alone, and the outward rounding is what carries it
 * the last step. `correctAnswersToReach` below depends on this exact behaviour,
 * which is why it steps the function rather than inverting it.
 */
export function nextMastery(current: number, isCorrect: boolean, priorAttempts: number): number {
  const rate = learningRate(priorAttempts);
  const bounded = clamp(current);

  if (isCorrect) {
    const gain = (MASTERY_MAX - bounded) * rate;
    return clamp(Math.ceil(bounded + gain));
  }

  const loss = bounded * rate * REGRESSION_DAMPING;
  return clamp(Math.floor(bounded - loss));
}

/**
 * How many consecutive correct answers take a learner from here to a target.
 *
 * Steps `nextMastery` forward rather than solving it. The closed form for the
 * same curve is out by an answer once the outward rounding accumulates, and a
 * practice plan that promises four questions and needs five is worse than no
 * plan. Returns `null` when the target cannot be reached — asking for 100 from
 * a standing start is a fair question with an honest negative answer.
 */
export function correctAnswersToReach(
  current: number,
  target: number,
  priorAttempts: number,
  limit = 200,
): number | null {
  let mastery = clamp(current);
  let attempts = priorAttempts;

  for (let answered = 1; answered <= limit; answered++) {
    const stepped = nextMastery(mastery, true, attempts);
    if (stepped === mastery) return null; // the curve has stalled below target
    mastery = stepped;
    attempts += 1;
    if (mastery >= target) return answered;
  }

  return null;
}

/** Accuracy as a whole percentage. Zero attempts is 0, not a division by zero. */
export function accuracyPercent(correct: number, total: number): number {
  if (total <= 0) return 0;
  return Math.round((correct / total) * 100);
}

function clamp(value: number): number {
  return Math.min(MASTERY_MAX, Math.max(MASTERY_MIN, value));
}
