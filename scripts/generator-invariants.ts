/**
 * The generator's structural invariants, in one place.
 *
 * Two callers run this list:
 *
 *   src/services/problemGenerator.invariants.test.ts   every `pnpm test`
 *   scripts/audit-generator.mjs                        on demand, and in CI
 *
 * Keeping one list is what stops the two from drifting apart — the same reason
 * the donor engine keeps `data-integrity-checks.mjs` shared between its
 * integration test and its audit script.
 *
 * These are the checks that need no mathematics. Whether an answer is *correct*
 * is decided by `scripts/verify_generated.py`, which re-derives it with SymPy
 * from the problem's own parameters rather than trusting the TypeScript that
 * produced it. A structural check cannot catch a wrong answer, and a CAS cannot
 * catch a duplicated option; both gates are needed.
 */

import type { SampledProblem } from './generator-sample';
import type { MisconceptionCode } from '../src/services/adaptiveEngine';

export const MISCONCEPTION_CODES: readonly MisconceptionCode[] = [
  'SIGN_ERROR',
  'ORDER_OF_OPERATIONS',
  'INVERTED_FRACTION',
  'ADDITIVE_INSTEAD_OF_MULTIPLICATIVE',
  'OFF_BY_ONE_COUNTING',
  'RECIPROCAL_MISAPPLIED',
  'DISTRIBUTIVE_OMISSION',
  'UNIT_CONVERSION_CONFUSION',
  'COORDINATE_AXIS_SWAP',
  'GENERAL_CALCULATION_SLIP',
];

/**
 * Every variant the generator can produce, by the id prefix it stamps.
 *
 * Declared rather than discovered: if a variant stops being reachable — a
 * `pickRandom` list loses an entry, a branch becomes unreachable — the
 * coverage check below fails instead of the gate quietly testing less than it
 * did yesterday.
 */
export const DECLARED_KINDS = [
  'early-bond',
  'early-add',
  'early-pat',
  'elem-frac',
  'elem-mult',
  'elem-geom',
  'mid-linear',
  'mid-integers',
  'mid-slope',
  'high-quad',
  'high-calc',
  'high-trig',
] as const;

export interface Violation {
  check: string;
  kind: string;
  problemId: string;
  detail: string;
}

type ProblemCheck = {
  name: string;
  /** Returns a description of the failure, or null when the problem passes. */
  run: (p: SampledProblem) => string | null;
};

/** Checks applied to every problem in the sample, one at a time. */
export const PROBLEM_CHECKS: ProblemCheck[] = [
  {
    name: 'four options',
    run: p => (p.options.length === 4 ? null : `has ${p.options.length} options, expected 4`),
  },
  {
    name: 'correct answer is on offer',
    run: p =>
      p.options.includes(p.correctAnswer)
        ? null
        : `correctAnswer ${JSON.stringify(p.correctAnswer)} is absent from options ${JSON.stringify(p.options)}`,
  },
  {
    name: 'options are distinct',
    run: p => {
      const seen = new Map<string, number>();
      for (const option of p.options) seen.set(option, (seen.get(option) ?? 0) + 1);
      const repeated = [...seen.entries()].filter(([, n]) => n > 1);
      if (repeated.length === 0) return null;
      return `option ${repeated.map(([o, n]) => `${JSON.stringify(o)} x${n}`).join(', ')} in ${JSON.stringify(p.options)}`;
    },
  },
  {
    name: 'every distractor is diagnosed',
    run: p => {
      const distractors = p.options.filter(o => o !== p.correctAnswer);
      const undiagnosed = distractors.filter(o => !(o in p.distractorDiagnostics));
      return undiagnosed.length === 0
        ? null
        : `no misconception tagged for ${undiagnosed.map(o => JSON.stringify(o)).join(', ')}`;
    },
  },
  {
    name: 'the correct answer is not diagnosed as an error',
    run: p =>
      p.correctAnswer in p.distractorDiagnostics
        ? `correctAnswer ${JSON.stringify(p.correctAnswer)} carries misconception ${p.distractorDiagnostics[p.correctAnswer]}`
        : null,
  },
  {
    name: 'diagnostics use declared misconception codes',
    run: p => {
      const bad = Object.entries(p.distractorDiagnostics).filter(
        ([, code]) => !MISCONCEPTION_CODES.includes(code as MisconceptionCode),
      );
      return bad.length === 0 ? null : `unknown code ${bad.map(([o, c]) => `${c} on ${JSON.stringify(o)}`).join(', ')}`;
    },
  },
  {
    name: 'IRT parameters are in range',
    run: p => {
      const { discrimination: a, difficulty: b, pseudoGuessing: c } = p.irtParameters;
      const faults: string[] = [];
      // Below ~0.2 an item carries almost no information; above ~3.0 the 3PL
      // curve is a step function and a single response would swing theta.
      if (!(a >= 0.2 && a <= 3.0)) faults.push(`discrimination ${a} outside [0.2, 3.0]`);
      // AdaptiveEngine clamps theta to this range, so an item outside it can
      // never sit at a learner's ability.
      if (!(b >= -3.0 && b <= 3.0)) faults.push(`difficulty ${b} outside [-3.0, 3.0]`);
      // A four-option item guesses at 0.25; above 0.5 the item is noise.
      if (!(c >= 0 && c <= 0.5)) faults.push(`pseudoGuessing ${c} outside [0, 0.5]`);
      return faults.length === 0 ? null : faults.join('; ');
    },
  },
  {
    name: 'difficulty is on the 1-10 scale',
    run: p =>
      Number.isInteger(p.difficulty) && p.difficulty! >= 1 && p.difficulty! <= 10
        ? null
        : `difficulty ${p.difficulty} is not an integer in [1, 10]`,
  },
  {
    name: 'learner-facing text is present',
    run: p => {
      const empty = (['question', 'hint', 'explanation'] as const).filter(f => !p[f] || !String(p[f]).trim());
      return empty.length === 0 ? null : `empty ${empty.join(', ')}`;
    },
  },
  {
    name: 'question text is free of doubled spaces',
    // Not cosmetic pedantry: every occurrence found so far came from a template
    // interpolating an empty string where a term was meant to be, which means a
    // coefficient silently vanished from the question a learner is reading.
    run: p => (/ {2}/.test(p.question) ? `doubled space in ${JSON.stringify(p.question)}` : null),
  },
  {
    name: 'a standards code is attached',
    run: p => (p.standardCode && p.standardCode.trim() ? null : 'missing standardCode'),
  },
];

/** Runs every per-problem check across the sample. */
export function findViolations(sample: SampledProblem[]): Violation[] {
  const violations: Violation[] = [];
  for (const problem of sample) {
    for (const check of PROBLEM_CHECKS) {
      const detail = check.run(problem);
      if (detail !== null) {
        violations.push({ check: check.name, kind: problem.kind, problemId: problem.id, detail });
      }
    }
  }
  return violations;
}

/** Variants declared above but never drawn — the gate testing less than it claims. */
export function findUncoveredKinds(sample: SampledProblem[]): string[] {
  const drawn = new Set(sample.map(p => p.kind));
  return DECLARED_KINDS.filter(kind => !drawn.has(kind));
}

/** Variants drawn but not declared — a new branch that no one added to the list. */
export function findUndeclaredKinds(sample: SampledProblem[]): string[] {
  const declared = new Set<string>(DECLARED_KINDS);
  return [...new Set(sample.map(p => p.kind))].filter(kind => !declared.has(kind));
}

/** Collapses many violations of one check into one line per (check, kind). */
export function summarise(violations: Violation[]): string[] {
  const grouped = new Map<string, { count: number; example: Violation }>();
  for (const v of violations) {
    const key = `${v.check} :: ${v.kind}`;
    const entry = grouped.get(key);
    if (entry) entry.count++;
    else grouped.set(key, { count: 1, example: v });
  }
  return [...grouped.entries()]
    .sort((a, b) => b[1].count - a[1].count)
    .map(([key, { count, example }]) => `${key} — ${count} occurrence(s), e.g. ${example.detail}`);
}
