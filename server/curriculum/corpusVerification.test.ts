// @vitest-environment node

/**
 * The gate that checks the corpus, checked itself.
 *
 * **A guard with no positive control is a claim** — E8's lesson, and it applies
 * with particular force here. This gate's headline output is a count of
 * failures, and once that count is zero every possible weakening of it is
 * invisible: return `verified` unconditionally, skip the unresolvable cases,
 * compare a number against itself. All of them produce a clean run.
 *
 * So every rule below is exercised against data with a **known** defect in it,
 * and asserted to fail. The first version of the scan that found the twelve
 * defective problems returned a null for anything it could not resolve, and its
 * caller skipped nulls — so it passed silently over exactly the cases it
 * existed to find. That is the failure these tests exist to make impossible.
 */

import { describe, expect, it } from 'vitest';

import {
  POSITION_LIMIT,
  POSITION_MIN_GROUP,
  answerAsNumber,
  closeEnough,
  crossCheck,
  figureAnswerIndex,
  lopsidedTypes,
  modeOf,
  positionCounts,
  verifyFigure,
  worstPositionShare,
  type VerificationInput,
} from './corpusVerification';
import { loadAllStrands } from './sources';

function problem(overrides: Partial<VerificationInput> = {}): VerificationInput {
  return {
    externalId: 'test-01',
    conceptId: 'test-concept',
    problemType: 'symbolic',
    prompt: 'What is 2 + 3?',
    answer: '5',
    choices: null,
    verification: { mode: 'sympy', expression: '2 + 3', expected: 5 },
    promptFigures: null,
    ...overrides,
  };
}

describe('deciding how a problem should be checked', () => {
  it('reads an explicit mode', () => {
    expect(modeOf({ mode: 'figure' })).toBe('figure');
    expect(modeOf({ mode: 'choice' })).toBe('choice');
    expect(modeOf({ mode: 'sympy', expression: '1+1' })).toBe('sympy');
  });

  it('treats an expression with no mode as symbolic', () => {
    /*
     * 500 problems — the whole fractions strand — carry an expression and no
     * `mode` key. Reading those as unverifiable would drop 44% of the corpus
     * out of the gate while the report still said "no failures", which is the
     * shape of silent success this module is most concerned with.
     */
    expect(modeOf({ expression: '1/2 / (1/2)', expected: 1 })).toBe('sympy');
  });

  it('does not invent a mode for a problem with nothing to check', () => {
    expect(modeOf({ mode: 'choice', expression: '', expected: null })).toBe('choice');
    expect(modeOf({})).toBe('choice');
  });
});

describe('reading a written answer as a number', () => {
  it('reads a fraction rather than truncating it', () => {
    /*
     * `parseFloat('3/2')` returns 3. Used here that would compare a correct
     * answer against the wrong value and mark a right answer wrong — in the
     * strand where fractions are the entire subject.
     */
    expect(answerAsNumber('3/2')).toBe(1.5);
    expect(answerAsNumber('1/2')).toBe(0.5);
  });

  it('reads plain and negative numbers', () => {
    expect(answerAsNumber('1386')).toBe(1386);
    expect(answerAsNumber('-7')).toBe(-7);
    expect(answerAsNumber(' 42 ')).toBe(42);
  });

  it('refuses a word, rather than guessing at one', () => {
    expect(answerAsNumber('acute')).toBeNull();
    expect(answerAsNumber('5x + 10')).toBeNull();
    expect(answerAsNumber('')).toBeNull();
  });

  it('refuses a division by zero instead of returning infinity', () => {
    expect(answerAsNumber('1/0')).toBeNull();
  });
});

describe('a picture problem, checked against its own measurements', () => {
  const figure = (verification: Record<string, unknown>, answer: string, choices: string[]) =>
    verifyFigure(problem({ verification: { mode: 'figure', ...verification }, answer, choices }));

  it('passes the biggest, smallest and one-hot cases', () => {
    expect(
      figure({ direction: 'high', measures: [90, 50, 28] }, 'circle', ['circle', 'square', 'star'])
        .outcome,
    ).toBe('verified');
    expect(
      figure({ direction: 'low', measures: [84, 44, 24] }, 'circle', ['square', 'star', 'circle'])
        .outcome,
    ).toBe('verified');
    expect(
      figure({ direction: 'same', measures: [0, 1, 0] }, 'b', ['a', 'b', 'c']).outcome,
    ).toBe('verified');
  });

  it('fails when the measurements name a different option', () => {
    // The positive control for the whole figure tier. Without it, returning
    // `verified` unconditionally passes every other assertion here.
    const result = figure({ direction: 'high', measures: [90, 50, 28] }, 'star', [
      'circle',
      'square',
      'star',
    ]);
    expect(result.outcome).toBe('failed');
    expect(result.reason).toMatch(/point at "circle" and the answer is "star"/);
  });

  it('fails when the correct option is not on offer at all', () => {
    /*
     * **The twelve.** A child is shown two squares and asked which number says
     * how many; the numerals offered are 5, 4 and 3. There is no right answer
     * to pick, and the marked one is 4.
     *
     * The structural check in `importCurriculum.test.ts` passes on this,
     * because the *marked* answer is among the choices. It checks the
     * container, not the content.
     */
    const result = verifyFigure(
      problem({
        verification: { mode: 'figure', direction: 'match', measures: [5, 4, 3] },
        promptFigures: [{ shape: 'square', count: 2 }],
        answer: '4',
        choices: ['5', '4', '3'],
      }),
    );
    expect(result.outcome).toBe('failed');
    expect(result.reason).toMatch(/not among the choices/);
  });

  it('separates "cannot resolve" from "nothing to check"', () => {
    /*
     * The distinction the first scan collapsed, and the reason it reported zero
     * failures while the twelve sat in front of it.
     *
     * `match` with an absent target is **unresolvable** — a rule applies and
     * the data fails it. `odd` is **unverifiable** — no rule applies at all.
     */
    expect(
      figureAnswerIndex({ direction: 'match', measures: [5, 4, 3] }, [{ count: 2 }]),
    ).toBe('unresolvable');
    expect(figureAnswerIndex({ direction: 'odd', measures: [0, 2, 3] }, null)).toBeNull();
  });

  it('refuses to guess a rule for a direction it has none for', () => {
    /*
     * Every one of the twenty `odd` problems happens to have its answer first.
     * That is a fact about the authoring, not a rule — inferring one from a
     * coincidence is what F3 refused to do with standards alignment, and the
     * same restraint applies.
     */
    const result = figure({ direction: 'odd', measures: [0, 2, 3] }, 'a', ['a', 'b', 'c']);
    expect(result.outcome).toBe('unverifiable');
    expect(result.reason).toMatch(/no rule decides/);
  });

  it('fails a one-hot vector that names two answers or none', () => {
    expect(figureAnswerIndex({ direction: 'same', measures: [1, 1, 0] }, null)).toBe('unresolvable');
    expect(figureAnswerIndex({ direction: 'same', measures: [0, 0, 0] }, null)).toBe('unresolvable');
  });
});

describe('the three-way cross-check', () => {
  it('passes when the answer, the expression and the expected value agree', () => {
    expect(crossCheck(problem(), 5).outcome).toBe('verified');
  });

  it('fails when the mathematics disagrees with the expected value', () => {
    // A computation error in the source data: the author wrote the expression
    // correctly and recorded the wrong result.
    const result = crossCheck(problem({ verification: { expression: '2 + 3', expected: 6 } }), 5);
    expect(result.outcome).toBe('failed');
    expect(result.reason).toMatch(/evaluates to 5.*expected value says 6/);
  });

  it('fails when the string a child sees disagrees with the mathematics', () => {
    /*
     * **The defect no pair of fields catches.** The expression is right, the
     * expected value is right, and somebody mistyped the answer. Arithmetic
     * verified; child marked wrong.
     */
    const result = crossCheck(problem({ answer: '6' }), 5);
    expect(result.outcome).toBe('failed');
    expect(result.reason).toMatch(/answer says 6 and the mathematics says 5/);
  });

  it('fails an expression SymPy could not evaluate, rather than skipping it', () => {
    const result = crossCheck(problem(), null, 'unbound symbol(s): x');
    expect(result.outcome).toBe('failed');
    expect(result.reason).toMatch(/could not be evaluated: unbound symbol/);
  });

  it('names a non-numeric answer instead of counting it as verified', () => {
    const result = crossCheck(problem({ answer: '5x + 10' }), 5);
    expect(result.outcome).toBe('unverifiable');
    expect(result.reason).toMatch(/is not a number/);
  });

  it('accepts a fraction answer against a decimal expectation', () => {
    const result = crossCheck(
      problem({ answer: '3/2', verification: { expression: '6/4', expected: 1.5 } }),
      1.5,
    );
    expect(result.outcome).toBe('verified');
  });

  it('tolerates floating point without tolerating a wrong answer', () => {
    expect(closeEnough(0.1 + 0.2, 0.3)).toBe(true);
    expect(closeEnough(5, 5.01)).toBe(false);
  });
});

describe('where the answers sit', () => {
  const at = (index: number, size = 3) =>
    problem({
      choices: Array.from({ length: size }, (_, i) => `option-${i}`),
      answer: `option-${index}`,
    });

  it('counts the position of each answer', () => {
    expect(positionCounts([at(0), at(0), at(2)])).toEqual([2, 0, 1]);
  });

  it('reports a group that never varies as entirely lopsided', () => {
    /*
     * The positive control for the position invariant. `conceptual` sits at 48
     * of 48 in the real corpus: a child who always taps the first option scores
     * full marks on it without doing any mathematics, and the 3PL engine reads
     * that as ability.
     */
    expect(worstPositionShare([at(0), at(0), at(0), at(0)])).toBe(1);
  });

  it('reports a balanced group as unremarkable', () => {
    expect(worstPositionShare([at(0), at(1), at(2)])).toBeCloseTo(1 / 3);
  });

  it('ignores a problem whose answer is not among its choices', () => {
    // Those are a different defect, caught by the structural checks, and
    // counting them here would move a number nobody could act on.
    expect(positionCounts([problem({ choices: ['a', 'b'], answer: 'z' })])).toEqual([]);
  });

  it('says nothing about an empty group rather than dividing by zero', () => {
    expect(worstPositionShare([])).toBe(0);
  });
});

describe('the position invariant, against the real corpus', () => {
  /*
   * **A check that reports nothing is a check whose every weakening is
   * invisible.** The corpus is balanced now, so `lopsidedTypes` returns an
   * empty list — and it would return an empty list just as happily if the
   * minimum group size were 999, or the limit above 1, or the grouping keyed on
   * a field that does not exist. `audit:corpus` would print OK for all of them.
   *
   * So these run against the actual corpus, with one type deliberately
   * collapsed. That exercises the real grouping and the real thresholds rather
   * than a four-element array, which is where the earlier synthetic controls
   * stopped.
   */
  const corpus: VerificationInput[] = loadAllStrands()
    .flatMap(strand => strand.curriculum.problems ?? [])
    .map(problem => {
      const raw = problem as unknown as Record<string, unknown>;
      return {
        externalId: String(raw.id),
        conceptId: String(raw.concept_id),
        problemType: String(raw.problem_type ?? 'unknown'),
        prompt: String(raw.prompt ?? ''),
        answer: String(raw.answer ?? ''),
        choices: Array.isArray(raw.choices) ? (raw.choices as string[]) : null,
        verification: (raw.verification ?? {}) as Record<string, unknown>,
        promptFigures: null,
      };
    });

  it('reads a corpus large enough to be worth checking', () => {
    // If the loader ever returns nothing, every assertion below passes while
    // testing nothing at all — the failure mode this whole file guards against.
    expect(corpus.length).toBeGreaterThan(1000);
    expect(corpus.filter(p => p.choices && p.choices.length >= 2).length).toBeGreaterThan(300);
  });

  it('finds nothing lopsided today', () => {
    expect(lopsidedTypes(corpus)).toEqual([]);
  });

  it('still catches a type that stops varying', () => {
    /*
     * **The positive control against real data.** `conceptual` is the type that
     * was 48 of 48 before F0b; collapsing it back is the defect this invariant
     * was built for, reproduced against the corpus's own shape.
     */
    const collapsed = corpus.map(problem =>
      problem.problemType === 'conceptual' && problem.choices
        ? { ...problem, answer: problem.choices[0] }
        : problem,
    );

    const found = lopsidedTypes(collapsed);
    expect(found.map(entry => entry.type)).toContain('conceptual');
    expect(found.find(entry => entry.type === 'conceptual')?.share).toBe(1);
  });

  it('does not fire on a group too small to mean anything', () => {
    // Four problems landing in the same place is luck, not a pattern. Without
    // the floor, every small type would be reported and the signal would be
    // buried in noise nobody could act on.
    const tiny: VerificationInput[] = Array.from({ length: POSITION_MIN_GROUP - 1 }, (_, i) => ({
      externalId: `tiny-${i}`,
      conceptId: 'tiny',
      problemType: 'tiny-type',
      prompt: '',
      answer: 'a',
      choices: ['a', 'b', 'c'],
      verification: {},
      promptFigures: null,
    }));

    expect(lopsidedTypes(tiny)).toEqual([]);
    expect(lopsidedTypes(tiny, { minGroup: 3 }).map(e => e.type)).toEqual(['tiny-type']);
  });

  it('uses a limit that a balanced group clears and a fixed one does not', () => {
    expect(POSITION_LIMIT).toBeGreaterThan(0.5);
    expect(POSITION_LIMIT).toBeLessThan(1);
  });
});
