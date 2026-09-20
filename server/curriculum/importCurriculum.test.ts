/**
 * The mapping, run over all 1,154 real problems.
 *
 * No database. The point is to exercise the whole corpus rather than a fixture:
 * a mapping that handles the first problem of each strand proves very little
 * about the other 1,150, and the defects worth catching here are the ones that
 * occur in a handful of rows.
 */

import { describe, expect, it } from 'vitest';

import { bandFor, CONCEPT_AGE_BANDS, coverageByAge, tierFor } from './ageBands';
import { mapConcepts, mapHints, mapPrerequisites, mapProblems } from './importCurriculum';
import { loadAllStrands } from './sources';

const strands = loadAllStrands();

const allConcepts = strands.flatMap(({ curriculum }) => mapConcepts(curriculum));
const allProblems = strands.flatMap(({ curriculum }) => mapProblems(curriculum));
const conceptIds = new Set(allConcepts.map(c => c.id));
const allHints = strands.flatMap(({ hints }) => mapHints(hints, conceptIds));

describe('the corpus is the size it claims to be', () => {
  it('maps 52 concepts', () => {
    // 51, plus `counting-to-20` — the first concept of the age 6-8 bridge band.
    expect(allConcepts).toHaveLength(52);
  });

  it('splits the corpus into numeric and multiple choice as the source does', () => {
    const byType = allProblems.reduce<Record<string, number>>((counts, problem) => {
      counts[problem.answerType] = (counts[problem.answerType] ?? 0) + 1;
      return counts;
    }, {});
    expect(byType).toEqual({ numeric: 784, multiple_choice: 370 });
  });

  it('maps 1,154 problems', () => {
    // 500 fractions-to-algebra + 252 algebra-1 + 200 geometry + 180 foundations
    // + 22 bridge.
    expect(allProblems).toHaveLength(1_154);
  });

  it('maps the five strands and no others', () => {
    expect([...new Set(allConcepts.map(c => c.strand))].sort()).toEqual([
      'algebra-1',
      'bridge',
      'foundations',
      'fractions-to-algebra',
      'geometry',
    ]);
  });

  it('keeps only verified hints', () => {
    expect(allHints.length).toBeGreaterThan(0);
    expect(allHints.every(hint => hint.verified)).toBe(true);
  });
});

describe('age bands', () => {
  it('declares a band for every concept in the corpus', () => {
    // `bandFor` throws on an unknown id, so mapping succeeding above already
    // proves this. Asserted separately because the failure mode — a concept
    // silently placed "somewhere" — is the one that matters most.
    const undeclared = allConcepts.filter(c => !(c.id in CONCEPT_AGE_BANDS));
    expect(undeclared).toEqual([]);
  });

  it('declares no band for a concept that does not exist', () => {
    const orphaned = Object.keys(CONCEPT_AGE_BANDS).filter(id => !conceptIds.has(id));
    expect(orphaned).toEqual([]);
  });

  it('never bands a concept backwards', () => {
    for (const [id, band] of Object.entries(CONCEPT_AGE_BANDS)) {
      expect(band.lowAge, id).toBeLessThanOrEqual(band.highAge);
    }
  });

  it('keeps every band inside the curriculum"s age range', () => {
    for (const [id, band] of Object.entries(CONCEPT_AGE_BANDS)) {
      expect(band.lowAge, id).toBeGreaterThanOrEqual(3);
      expect(band.highAge, id).toBeLessThanOrEqual(18);
    }
  });

  it('starts a concept no earlier than the concept it depends on', () => {
    // A prerequisite banded above the thing that needs it would put a child in
    // a loop they cannot leave: the roadmap sends them back to a concept their
    // age says they are not ready for.
    const bandOf = (id: string) => bandFor(id);
    const violations: string[] = [];

    for (const { curriculum } of strands) {
      for (const concept of curriculum.concepts) {
        for (const prerequisite of concept.prerequisites) {
          if (bandOf(prerequisite).lowAge > bandOf(concept.id).lowAge) {
            violations.push(`${concept.id} (${bandOf(concept.id).lowAge}) requires ${prerequisite} (${bandOf(prerequisite).lowAge})`);
          }
        }
      }
    }

    expect(violations).toEqual([]);
  });

  it('places each concept in the tier its starting age belongs to', () => {
    for (const concept of allConcepts) {
      expect(concept.tier, concept.id).toBe(tierFor(concept.id));
    }
  });
});

describe('coverage, including where there is none', () => {
  const coverage = coverageByAge();

  it('has the coverage shape this corpus actually has', () => {
    // Pinned exactly, because the number is the point. "Ages 6-10 are thin" was
    // an impression carried over from the donor engine's own notes; this is the
    // measurement. Age 13 has twenty-five concepts available and age 7 has one.
    //
    // Changing the bands changes these numbers, which is fine — the test exists
    // so that it happens deliberately and somebody sees the new shape.
    expect(coverage).toEqual({
      3: 5,
      4: 9,
      5: 9,
      6: 7,
      7: 1,
      8: 3,
      9: 8,
      10: 7,
      11: 6,
      12: 14,
      13: 25,
      14: 20,
      15: 13,
      16: 8,
      17: 3,
      18: 1,
    });
  });

  it('no longer leaves age 7 with nothing at all', () => {
    /*
     * This test used to read `expect(coverage[7]).toBe(0)` and its name was
     * `leaves age 7 with nothing at all`. Foundations stopped at 6, the
     * fractions strand started at 8, and a seven-year-old met the generator and
     * nothing else. Making it fail was the stated deliverable of the age-7
     * band — see `docs/curriculum/age-7-bridge.md` §7.
     *
     * It is kept rather than deleted, inverted rather than loosened, and it
     * asserts **exactly one** concept in both directions. `toBeGreaterThan(0)`
     * would go green for the six concepts still unauthored and stay green
     * however many arrive, which would make the one number nobody should lose
     * track of the one number nothing watches.
     */
    expect(coverage[7]).toBe(1);

    const [concept] = Object.entries(CONCEPT_AGE_BANDS)
      .filter(([, band]) => band.lowAge <= 7 && band.highAge >= 7)
      .map(([id]) => id);
    expect(concept).toBe('counting-to-20');
  });

  it('is thin either side of the middle years', () => {
    // The primary years and the senior years both depend on the generator.
    const primary = [8, 9, 10, 11].map(age => coverage[age]);
    expect(Math.max(...primary)).toBeLessThan(coverage[13] / 2);
    expect(coverage[17] + coverage[18]).toBeLessThan(coverage[13] / 4);
  });
});

describe('problems', () => {
  it('gives every problem a concept that exists', () => {
    for (const problem of allProblems) {
      expect(conceptIds.has(problem.conceptId), problem.externalId).toBe(true);
    }
  });

  it('gives every problem a unique id', () => {
    const ids = allProblems.map(p => p.externalId);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('offers the correct answer among the choices of every multiple-choice item', () => {
    // 180 foundations + 96 algebra-1 + 72 geometry + 22 bridge. The remaining
    // 784 are numeric: the fractions strand is entirely so.
    const choiceProblems = allProblems.filter(p => p.answerType === 'multiple_choice');
    expect(choiceProblems).toHaveLength(370);

    for (const problem of choiceProblems) {
      expect(problem.choices, problem.externalId).not.toBeNull();
      expect(problem.choices!, problem.externalId).toContain(problem.answer);
    }
  });

  it('never repeats a choice', () => {
    for (const problem of allProblems) {
      if (!problem.choices) continue;
      expect(new Set(problem.choices).size, problem.externalId).toBe(problem.choices.length);
    }
  });

  it('never diagnoses the correct answer as an error', () => {
    for (const problem of allProblems) {
      const values = problem.distractors.map(d => d.value);
      expect(values, problem.externalId).not.toContain(problem.answer);
    }
  });

  it('only diagnoses answers that are actually on offer', () => {
    for (const problem of allProblems) {
      if (!problem.choices) continue;
      for (const distractor of problem.distractors) {
        expect(problem.choices, problem.externalId).toContain(distractor.value);
      }
    }
  });

  it('keeps difficulty on the 1-10 scale the column expects', () => {
    for (const problem of allProblems) {
      expect(problem.difficulty, problem.externalId).toBeGreaterThanOrEqual(1);
      expect(problem.difficulty, problem.externalId).toBeLessThanOrEqual(10);
    }
  });

  it('carries a prompt, an answer, an explanation and a hint on every item', () => {
    for (const problem of allProblems) {
      for (const field of ['prompt', 'answer', 'explanation', 'hint'] as const) {
        expect(String(problem[field]).trim(), `${problem.externalId}.${field}`).not.toBe('');
      }
    }
  });

  it('keeps a picture as data rather than markup', () => {
    // Raw SVG would mean dangerouslySetInnerHTML in an app used by children.
    const withVisuals = allProblems.filter(p => p.visual !== null);
    expect(withVisuals.length).toBeGreaterThan(0);
    for (const problem of withVisuals) {
      expect(typeof problem.visual, problem.externalId).toBe('object');
      expect(JSON.stringify(problem.visual)).not.toMatch(/<svg|<script/i);
    }
  });

  it('keeps the verification expression that proved a numeric answer', () => {
    const numeric = allProblems.filter(p => p.answerType === 'numeric');
    expect(numeric.length).toBeGreaterThan(0);
    const traceable = numeric.filter(p => p.verificationExpression);
    // Not all of them — structurally verified items carry no expression — but
    // an answer nobody can trace back to a check is what this project stopped
    // trusting, so the majority should be traceable.
    expect(traceable.length / numeric.length).toBeGreaterThan(0.9);
  });
});

describe('prerequisites', () => {
  it('resolves every prerequisite in its own strand or an earlier one', () => {
    const seen = new Set<string>();
    for (const { curriculum } of strands) {
      expect(() => mapPrerequisites(curriculum, seen), curriculum.strand).not.toThrow();
      for (const concept of curriculum.concepts) seen.add(concept.id);
    }
  });

  it('still refuses a prerequisite no strand has defined yet', () => {
    /*
     * **The positive control, and it is load-ordered rather than absolute.**
     * Relaxing the within-strand rule for the `bridge` band would be worth
     * nothing if it had quietly become "accept anything": the check that
     * matters is that a strand cannot reach *forwards*.
     *
     * `bridge` depends on `foundations`, which loads first. Asking it to resolve
     * against an empty set is exactly the situation of a strand that had been
     * registered before the one it needs, and it must still throw.
     */
    const bridge = strands.find(({ curriculum }) => curriculum.strand === 'bridge')!;
    expect(() => mapPrerequisites(bridge.curriculum, new Set())).toThrow(
      /requires "foundations-count-to-5", which is in neither strand/,
    );

    expect(() =>
      mapPrerequisites({
        ...bridge.curriculum,
        concepts: [{ ...bridge.curriculum.concepts[0], prerequisites: ['no-such-concept'] }],
      }),
    ).toThrow(/no-such-concept/);
  });

  it('orders a concept after everything it depends on', () => {
    // Sort order is assigned per strand from a base of `index * 1_000`, which is
    // what `seedCurriculum` passes, so a cross-strand prerequisite is ordered by
    // the load order of the two strands rather than by position within a file.
    const orderOf = new Map<string, number>();
    strands.forEach(({ curriculum }, index) => {
      for (const row of mapConcepts(curriculum, index * 1_000)) orderOf.set(row.id, row.sortOrder);
    });

    for (const { curriculum } of strands) {
      for (const concept of curriculum.concepts) {
        for (const prerequisite of concept.prerequisites) {
          expect(orderOf.get(prerequisite)!, `${concept.id} after ${prerequisite}`).toBeLessThan(
            orderOf.get(concept.id)!,
          );
        }
      }
    }
  });
});

describe('hints', () => {
  it('attaches every hint to a concept that exists', () => {
    for (const hint of allHints) {
      expect(conceptIds.has(hint.conceptId)).toBe(true);
    }
  });

  it('keeps the scaffold level inside 1 to 4', () => {
    for (const hint of allHints) {
      expect(hint.scaffoldLevel).toBeGreaterThanOrEqual(1);
      expect(hint.scaffoldLevel).toBeLessThanOrEqual(4);
    }
  });

  it('preserves the cognitive state the library is retrieved on', () => {
    // Importing without this would land a library nothing can select between.
    const withState = allHints.filter(hint => hint.cognitiveState);
    expect(withState.length).toBe(allHints.length);
    expect(new Set(allHints.map(h => h.cognitiveState)).size).toBeGreaterThan(1);
  });

  it('preserves every error mode a hint targets, not just the first', () => {
    const multiTarget = allHints.filter(hint => hint.errorModes.length > 1);
    expect(multiTarget.length).toBeGreaterThan(0);
    for (const hint of multiTarget) {
      expect(hint.errorModes[0]).toBe(hint.misconceptionCode);
    }
  });

  it('carries a body on every hint', () => {
    for (const hint of allHints) {
      expect(hint.body.trim()).not.toBe('');
    }
  });
});
