/**
 * The generator's structural invariants, run over a deterministic sample.
 *
 * This suite and `pnpm audit:generator` share `scripts/generator-invariants.ts`
 * and draw from the same seed, so a failure here reproduces there and vice
 * versa. What this file adds is the regression cases: each `it` below names a
 * defect the gate found on its first run, pinned so it cannot come back
 * quietly.
 *
 * Mathematical correctness is not checked here. `scripts/verify_generated.py`
 * re-derives every answer with SymPy, and CI runs it as its own step.
 */

import { describe, expect, it } from 'vitest';

import { drawSample, TIERS } from '../../scripts/generator-sample';
import {
  DECLARED_KINDS,
  findUncoveredKinds,
  findUndeclaredKinds,
  findViolations,
  summarise,
} from '../../scripts/generator-invariants';
import { ProblemGenerator, assembleOptions } from './problemGenerator';

const sample = drawSample();

describe('generated problems', () => {
  it('draws every declared variant', () => {
    expect(findUncoveredKinds(sample)).toEqual([]);
  });

  it('draws no variant that is not declared', () => {
    expect(findUndeclaredKinds(sample)).toEqual([]);
  });

  it('satisfies every structural invariant', () => {
    const violations = findViolations(sample);
    // Summarised rather than dumped: 6,720 problems can produce thousands of
    // violations from one defect, and the raw list buries the cause.
    expect(summarise(violations)).toEqual([]);
  });

  it('covers all four tiers', () => {
    expect(new Set(sample.map(p => p.tier))).toEqual(new Set(TIERS));
  });

  it('is a sample large enough to reach the corner cases', () => {
    // The rarest defect the gate originally found — 18 x 9 in the multiplication
    // variant — appeared twice in 6,720 draws. A materially smaller sample would
    // pass while the bug was still there.
    expect(sample.length).toBeGreaterThanOrEqual(6_000);
    expect(new Set(sample.map(p => p.kind)).size).toBe(DECLARED_KINDS.length);
  });
});

describe('regressions found by the integrity gate', () => {
  /** Every problem the sample holds for one variant. */
  const of = (kind: string) => sample.filter(p => p.kind === kind);

  it('offers four distinct options for a number bond whose missing part is 1', () => {
    // `Math.max(1, b - 1)` clamped the off-by-one distractor to 1, which is the
    // answer itself when the missing part is 1. The question then showed "1"
    // twice, one of them marked correct.
    const bondsWithPartOne = of('early-bond').filter(p => p.visualData!.target! - p.visualData!.filled! === 1);
    expect(bondsWithPartOne.length).toBeGreaterThan(0);
    for (const problem of bondsWithPartOne) {
      expect(new Set(problem.options).size).toBe(4);
    }
  });

  it('never offers perimeter as a distractor when it equals the area', () => {
    // A 6m by 3m garden has an area of 18 and a perimeter of 18.
    const squareCase = of('elem-geom').filter(
      p => p.visualData!.length! * p.visualData!.width! === 2 * (p.visualData!.length! + p.visualData!.width!),
    );
    expect(squareCase.length).toBeGreaterThan(0);
    for (const problem of squareCase) {
      expect(new Set(problem.options).size).toBe(4);
    }
  });

  it('gives the integer-sum variant three genuinely different wrong answers', () => {
    // `-(|p| + q)` and `p - q` are the same number for every negative p, so
    // every one of these questions used to offer a duplicate.
    for (const problem of of('mid-integers')) {
      expect(new Set(problem.options).size).toBe(4);
    }
  });

  it('writes slopes with the sign on the numerator', () => {
    // `1/-1` and `-1` are the same slope and different strings. Both were
    // offered on the same question, so one of two correct answers was wrong.
    for (const problem of of('mid-slope')) {
      for (const option of problem.options) {
        expect(option).not.toMatch(/\/-/);
      }
    }
  });

  it('spells a solution set one way only', () => {
    // `x = 5, x = -5` and `x = -5, x = 5` name the same pair of roots.
    for (const problem of of('high-quad')) {
      for (const option of problem.options) {
        const roots = option.replace(/x = /g, '').split(',').map(r => Number(r.trim()));
        expect(roots).toEqual([...roots].sort((a, b) => a - b));
      }
    }
  });

  it('offers a linear-equation distractor only when it lands on an integer', () => {
    // The inverted-sign distractor was `Math.round((c + b) / a)`, which turned a
    // non-integer into a whole number no sign rule produces.
    for (const problem of of('mid-linear')) {
      for (const option of problem.options) {
        expect(option).toMatch(/^x = -?\d+$/);
      }
    }
  });

  it('leaves no gap where a coefficient was elided', () => {
    // A zero coefficient left its slot empty and the learner read `x²  - 25 = 0`.
    for (const problem of sample) {
      expect(problem.question).not.toMatch(/ {2}/);
    }
  });
});

describe('assembleOptions', () => {
  it('skips a candidate that duplicates the correct answer', () => {
    const { options, distractorDiagnostics } = assembleOptions('4', [
      { value: '4', code: 'SIGN_ERROR' },
      { value: '5', code: 'OFF_BY_ONE_COUNTING' },
      { value: '3', code: 'OFF_BY_ONE_COUNTING' },
      { value: '8', code: 'ADDITIVE_INSTEAD_OF_MULTIPLICATIVE' },
    ]);

    expect(new Set(options)).toEqual(new Set(['4', '5', '3', '8']));
    expect(distractorDiagnostics['4']).toBeUndefined();
  });

  it('skips a candidate that duplicates one already taken', () => {
    const { options } = assembleOptions('10', [
      { value: '11', code: 'OFF_BY_ONE_COUNTING' },
      { value: '11', code: 'SIGN_ERROR' },
      { value: '9', code: 'OFF_BY_ONE_COUNTING' },
      { value: '20', code: 'ADDITIVE_INSTEAD_OF_MULTIPLICATIVE' },
    ]);

    expect(options).toHaveLength(4);
    expect(new Set(options).size).toBe(4);
  });

  it('refuses to build a question with fewer than four options', () => {
    // Silently returning three would put a malformed question in front of a
    // learner; the caller is expected to supply enough candidates that this
    // cannot happen, and the integrity gate is what proves it across the whole
    // parameter space.
    expect(() =>
      assembleOptions('7', [
        { value: '7', code: 'SIGN_ERROR' },
        { value: '8', code: 'OFF_BY_ONE_COUNTING' },
      ]),
    ).toThrow(/only find 1 distinct distractor/);
  });

  it('tags every distractor it returns', () => {
    const { options, distractorDiagnostics } = assembleOptions('1/2', [
      { value: '2/1', code: 'INVERTED_FRACTION' },
      { value: '1/3', code: 'OFF_BY_ONE_COUNTING' },
      { value: '2/4', code: 'DISTRIBUTIVE_OMISSION' },
    ]);

    for (const option of options.filter(o => o !== '1/2')) {
      expect(distractorDiagnostics[option]).toBeDefined();
    }
  });
});

describe('ProblemGenerator.generate', () => {
  it('returns a problem for every tier', () => {
    for (const tier of TIERS) {
      const problem = ProblemGenerator.generate(tier, 0);
      expect(problem.tier).toBe(tier);
      expect(problem.options).toHaveLength(4);
      expect(problem.options).toContain(problem.correctAnswer);
    }
  });

  it('scales difficulty with the requested ability', () => {
    const low = ProblemGenerator.generate('middle', -2.5).difficulty!;
    const high = ProblemGenerator.generate('middle', 2.5).difficulty!;
    expect(low).toBeLessThan(high);
  });

  it('keeps difficulty on the 1-10 scale at the extremes of theta', () => {
    for (const theta of [-10, -3, 3, 10]) {
      const { difficulty } = ProblemGenerator.generate('high', theta);
      expect(difficulty).toBeGreaterThanOrEqual(1);
      expect(difficulty).toBeLessThanOrEqual(10);
    }
  });
});
