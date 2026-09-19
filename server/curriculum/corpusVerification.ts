/**
 * Checking that an authored answer is actually right.
 *
 * ## Why this did not exist
 *
 * The README has claimed since it was written that *"every authored answer is
 * checked by a two-part integrity gate — a structural pass and a symbolic pass
 * using SymPy."* Half of that was true. `scripts/audit-generator.ts` draws its
 * sample from `ProblemGenerator`, so the SymPy pass covers **generated**
 * problems. The authored corpus got structural checks in
 * `importCurriculum.test.ts` and nothing symbolic at all.
 *
 * What makes that worth fixing rather than deleting: **the corpus was authored
 * to be verified.** Every one of the 1,132 problems carries a `verification`
 * object — an expression and its expected value, or the measurements behind a
 * picture question. The fields were written, imported, and never evaluated. The
 * apparatus was built and the runner never was.
 *
 * ## What the structural checks could not catch
 *
 * `importCurriculum.test.ts` asserts `choices.includes(answer)`, and that
 * passes for a problem whose marked answer is **wrong** — the wrong answer is
 * still one of the choices. The check is on the container, not the content. It
 * is necessary and nowhere near sufficient, and twelve problems in
 * `foundations-match-numeral-to-5` lived behind it: a four-year-old shown two
 * squares, asked which number says how many, and offered 5, 4 and 3.
 *
 * ## Three outcomes, and the distinction that matters
 *
 * - **verified** — the data determines an answer and it matches.
 * - **failed** — the data determines an answer and it does not match, *or* the
 *   data says the correct option is not on offer.
 * - **unverifiable** — no rule can decide it. Counted and named, never folded
 *   into a percentage.
 *
 * **"I could not resolve this" is a failure, not an absence.** The first
 * version of this scan returned `null` for an unresolvable target and its
 * caller skipped nulls, so it silently passed over the twelve problems it
 * existed to find and reported zero. A scan hunting for a fail-open bug failed
 * open. That is why `unresolvable` is its own outcome here rather than a
 * missing value.
 */

export type Outcome = 'verified' | 'failed' | 'unverifiable';

export interface VerificationInput {
  /** The problem's own id, so a report names the thing rather than a count. */
  externalId: string;
  conceptId: string;
  problemType: string;
  prompt: string;
  answer: string;
  choices: string[] | null;
  verification: Record<string, unknown>;
  /** `visual.prompt.figures`, when the problem has a picture. */
  promptFigures: Array<Record<string, unknown>> | null;
}

export interface VerificationResult {
  externalId: string;
  conceptId: string;
  outcome: Outcome;
  /** Which rule decided it, for the report's tiering. */
  tier: 'sympy' | 'figure' | 'structural';
  /** Present when the outcome is `failed` or `unverifiable`. */
  reason?: string;
}

/** How a problem declares it should be checked. */
export function modeOf(verification: Record<string, unknown>): 'sympy' | 'figure' | 'choice' {
  const mode = verification.mode;
  if (mode === 'figure') return 'figure';
  if (mode === 'choice') return 'choice';
  /*
   * 500 problems carry an expression with no `mode` key at all — the fractions
   * strand, written before the field was introduced. Treating an absent mode as
   * unverifiable would drop 44% of the corpus out of the gate while the report
   * still read as a success, which is the failure mode this module is most
   * concerned with.
   */
  if (typeof verification.expression === 'string' && verification.expression.trim() !== '') {
    return 'sympy';
  }
  return 'choice';
}

/**
 * A written answer as a number.
 *
 * Answers are strings a child types or taps: `"5"`, `"3/2"`, `"1386"`. A
 * fraction is a real answer in the fractions strand and must not be dropped —
 * `parseFloat('3/2')` returns 3, which would silently mark a correct answer as
 * matching the wrong value.
 */
export function answerAsNumber(answer: string): number | null {
  const text = answer.trim();
  if (text === '') return null;

  const fraction = /^(-?\d+(?:\.\d+)?)\s*\/\s*(-?\d+(?:\.\d+)?)$/.exec(text);
  if (fraction) {
    const denominator = Number(fraction[2]);
    if (denominator === 0) return null;
    return Number(fraction[1]) / denominator;
  }

  if (!/^-?\d+(?:\.\d+)?$/.test(text)) return null;
  return Number(text);
}

/** Tolerance for comparing a written answer against a computed one. */
const EPSILON = 1e-6;

export function closeEnough(left: number, right: number): boolean {
  return Math.abs(left - right) <= EPSILON * Math.max(1, Math.abs(left), Math.abs(right));
}

/**
 * Where a figure problem's answer must sit, given its own measurements.
 *
 * `null` means no rule applies — the problem is unverifiable and says so.
 * `'unresolvable'` means a rule applies and **the data does not support any
 * answer**, which is a defect rather than an absence — `match` with a target
 * count that is not among the numerals on offer, say.
 *
 * No problem in the corpus is in that state. Twelve were once reported as
 * such and none of them were; see `drawnCount` for what actually happened.
 */
/**
 * How many shapes a prompt picture draws — **across every row of it**.
 *
 * ## Why this is a sum and not `figures[0].count`
 *
 * It read the first row only, and that was wrong in a way that took a second
 * defect to expose. A picture is a list of figure rows; 112 of the corpus's
 * prompts have more than one. Reading row zero as *the* count is correct
 * exactly when a picture happens to be one row, which is true of most of them
 * and was true of every `match` prompt the first version ever saw succeed.
 *
 * It was not true of `foundations-match-numeral-to-5`, whose twelve problems
 * drew four as `[2, 2]` — two rows of two, which is four shapes and a perfectly
 * good picture of four. The gate saw `2`, called the problems unanswerable, and
 * the repair that followed set row zero to `4`, leaving `[4, 2]`: six shapes
 * against an answer of four. **The gate manufactured the defect it reported,
 * then certified the corruption as a fix** — F0b shipped it, and F0e reverted
 * all twelve pictures to `[2, 2]` and rewrote this to sum.
 *
 * The lesson is narrower than "read intent, not rendering", which F0b already
 * knew and still got wrong. It is that a *reading* of the rendering can be the
 * thing that disagrees, and a checker's own view of the evidence is evidence
 * that deserves the same suspicion as the fields it judges. Summing is not more
 * lenient than reading row zero — it is the same number for every single-row
 * picture, and the right one for the rest.
 */
export function drawnCount(
  promptFigures: Array<Record<string, unknown>> | null,
): number | null {
  if (!promptFigures || promptFigures.length === 0) return null;

  let total = 0;
  let sawOne = false;
  for (const figure of promptFigures) {
    if (typeof figure?.count !== 'number') continue;
    total += figure.count;
    sawOne = true;
  }

  return sawOne ? total : null;
}

export function figureAnswerIndex(
  verification: Record<string, unknown>,
  promptFigures: Array<Record<string, unknown>> | null,
): number | null | 'unresolvable' {
  const measures = Array.isArray(verification.measures)
    ? (verification.measures as number[])
    : null;
  if (!measures || measures.length === 0) return null;

  switch (verification.direction) {
    case 'high':
      return measures.indexOf(Math.max(...measures));
    case 'low':
      return measures.indexOf(Math.min(...measures));

    /*
     * A one-hot vector: exactly one candidate is the match. Two ones or none
     * means the data cannot say which, and that is unresolvable rather than
     * unverifiable — the rule applies, the data fails it.
     */
    case 'same':
    case 'next': {
      const hits = measures.filter(value => value === 1).length;
      return hits === 1 ? measures.indexOf(1) : 'unresolvable';
    }

    case 'match': {
      /*
       * **Two sources, and they are not interchangeable.**
       *
       * `verification.target` is what the author said the problem is about;
       * `drawnCount` is how many shapes the picture actually draws. The first
       * is intent, the second is what a child sees, and the target is the
       * authored one where it exists.
       */
      const authored = typeof verification.target === 'number' ? verification.target : null;
      const target = authored ?? drawnCount(promptFigures);
      if (target === null) return null;
      return measures.includes(target) ? measures.indexOf(target) : 'unresolvable';
    }

    /*
     * `odd` has no rule here, deliberately. Its `measures` are attribute codes
     * and no reading of them picks the odd one out reliably — every one of the
     * twenty happens to have its answer first, which is a fact about the
     * authoring rather than a rule to verify against. Guessing a rule from a
     * coincidence is what F3 refused to do with standards, and the same applies.
     */
    default:
      return null;
  }
}

/** Checks a picture problem against its own measurements. */
export function verifyFigure(input: VerificationInput): VerificationResult {
  const base = {
    externalId: input.externalId,
    conceptId: input.conceptId,
    tier: 'figure' as const,
  };

  /*
   * Checked before the answer, because it is the defect that hides behind a
   * correct answer. A `match` problem whose picture draws a different number
   * from the one it is about is unanswerable even though its answer, choices,
   * distractors and label all agree — the child counts what is in front of them
   * and no option says that.
   */
  const authoredTarget = typeof input.verification.target === 'number'
    ? input.verification.target
    : null;
  const drawn = drawnCount(input.promptFigures);

  if (authoredTarget !== null && drawn !== null && authoredTarget !== drawn) {
    return {
      ...base,
      outcome: 'failed',
      reason:
        `the picture draws ${drawn} but the problem is about ${authoredTarget} — ` +
        'a child counting what they can see has no correct option',
    };
  }

  const expected = figureAnswerIndex(input.verification, input.promptFigures);

  if (expected === 'unresolvable') {
    return {
      ...base,
      outcome: 'failed',
      reason:
        'the correct option is not among the choices — the measurements name an ' +
        'answer this problem does not offer',
    };
  }
  if (expected === null) {
    return {
      ...base,
      outcome: 'unverifiable',
      reason: `no rule decides direction "${String(input.verification.direction)}"`,
    };
  }

  if (!input.choices || input.choices.length === 0) {
    return { ...base, outcome: 'unverifiable', reason: 'a picture problem with no choices' };
  }
  if (expected < 0 || expected >= input.choices.length) {
    return {
      ...base,
      outcome: 'failed',
      reason: `the measurements point at option ${expected + 1}, which does not exist`,
    };
  }

  const actual = input.choices.indexOf(input.answer);
  if (actual === expected) return { ...base, outcome: 'verified' };

  return {
    ...base,
    outcome: 'failed',
    reason:
      `the measurements point at "${input.choices[expected]}" and the answer is ` +
      `"${input.answer}"`,
  };
}

/**
 * The three-way cross-check for a problem with an expression.
 *
 * Each such problem states its answer **three times**: `answer` is what a child
 * is marked against, `expression` is the mathematics, and `expected` is the
 * value the author computed. Comparing all three catches a defect no pair does
 * — most usefully the case where the mathematics is right, the expected value
 * is right, and the string the child actually sees was mistyped.
 *
 * `evaluated` comes from SymPy; `null` means SymPy could not evaluate it, which
 * is a failure and not a skip.
 */
export function crossCheck(
  input: VerificationInput,
  evaluated: number | null,
  evaluationError?: string,
): VerificationResult {
  const base = {
    externalId: input.externalId,
    conceptId: input.conceptId,
    tier: 'sympy' as const,
  };

  if (evaluated === null) {
    return {
      ...base,
      outcome: 'failed',
      reason: `the expression could not be evaluated${evaluationError ? `: ${evaluationError}` : ''}`,
    };
  }

  const expected = typeof input.verification.expected === 'number'
    ? (input.verification.expected as number)
    : null;
  if (expected === null) {
    return { ...base, outcome: 'failed', reason: 'the problem carries an expression but no expected value' };
  }

  if (!closeEnough(evaluated, expected)) {
    return {
      ...base,
      outcome: 'failed',
      reason: `the expression evaluates to ${evaluated} and the expected value says ${expected}`,
    };
  }

  const answer = answerAsNumber(input.answer);
  if (answer === null) {
    /*
     * A numeric expectation with a non-numeric answer. Not automatically wrong
     * — `"5x + 10"` is a real answer to a real question — but nothing here can
     * confirm it, so it is named rather than counted as verified.
     */
    return {
      ...base,
      outcome: 'unverifiable',
      reason: `the answer "${input.answer}" is not a number, so it cannot be compared to ${expected}`,
    };
  }

  if (!closeEnough(answer, expected)) {
    return {
      ...base,
      outcome: 'failed',
      reason: `the answer says ${input.answer} and the mathematics says ${expected}`,
    };
  }

  return { ...base, outcome: 'verified' };
}

/**
 * How often the correct option sits in each position, for one group.
 *
 * **A separate property from correctness, and a separate defect.** Every answer
 * in a group can be right while the group is still broken: `conceptual` has its
 * answer first in 48 of 48, so a child who always taps the first option scores
 * full marks on it without doing any mathematics — and the 3PL engine reads
 * that as ability and raises their θ.
 *
 * Measured on the stored data rather than on what a child sees, deliberately.
 * If the serve path shuffles, the presentation is fair and this still reports
 * the truth about the corpus; checking the rendered output instead would let
 * new authoring skew accumulate invisibly behind the shuffle.
 */
export function positionCounts(problems: VerificationInput[]): number[] {
  const counts: number[] = [];
  for (const problem of problems) {
    if (!problem.choices) continue;
    const index = problem.choices.indexOf(problem.answer);
    if (index < 0) continue;
    while (counts.length <= index) counts.push(0);
    counts[index] += 1;
  }
  return counts;
}

/**
 * How lopsided one problem type's answer positions may be before it is a defect.
 *
 * Not a statistical threshold. Three choices land near 33% by chance and cluster
 * well above that in a small group, so this is a *"somebody never varied it"*
 * line: `conceptual` sat at 100% across 48 problems, which no amount of chance
 * produces.
 */
export const POSITION_LIMIT = 0.9;

/** Below this, a run of one position says nothing. Four problems in four is luck. */
export const POSITION_MIN_GROUP = 12;

export interface LopsidedGroup {
  type: string;
  problems: number;
  share: number;
}

/**
 * Problem types that barely vary where the answer sits.
 *
 * **Lives here rather than in the script, because the script cannot be tested.**
 * The corpus is clean now, so this returns nothing — and a check that returns
 * nothing is one whose every weakening is invisible. Raise the minimum group
 * size to 999, or the limit above 1, and `audit:corpus` still prints OK.
 *
 * The test for it takes the real corpus, collapses one type's positions, and
 * asserts this reports it — a positive control against the actual shape of the
 * data rather than against a four-element array.
 */
export function lopsidedTypes(
  problems: VerificationInput[],
  options: { limit?: number; minGroup?: number } = {},
): LopsidedGroup[] {
  const limit = options.limit ?? POSITION_LIMIT;
  const minGroup = options.minGroup ?? POSITION_MIN_GROUP;

  const byType = new Map<string, VerificationInput[]>();
  for (const problem of problems) {
    // Fewer than two options cannot have a position worth measuring.
    if (!problem.choices || problem.choices.length < 2) continue;
    const group = byType.get(problem.problemType) ?? [];
    group.push(problem);
    byType.set(problem.problemType, group);
  }

  return [...byType.entries()]
    .filter(([, group]) => group.length >= minGroup)
    .map(([type, group]) => ({ type, problems: group.length, share: worstPositionShare(group) }))
    .filter(entry => entry.share >= limit)
    .sort((a, b) => b.share - a.share);
}

/** The share of a group whose answer sits in its most common position. */
export function worstPositionShare(problems: VerificationInput[]): number {
  const counts = positionCounts(problems);
  const total = counts.reduce((sum, n) => sum + n, 0);
  if (total === 0) return 0;
  return Math.max(...counts) / total;
}
