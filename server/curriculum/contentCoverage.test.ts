/**
 * What the curriculum actually contains, asserted rather than remembered.
 *
 * `docs/ROADMAP.md` publishes a table of authored problems per age. It was
 * hand-copied, which means it was only ever as current as the last person to
 * think about it — and this project has a recorded trap for exactly that shape:
 * **prose has no test suite, so a number in it is checked by nobody.**
 *
 * These are that check. The invariant matters more than the table: an age with
 * thin content is a complaint, while a concept served by nothing is a child
 * clicking a topic and being handed no question at all.
 */

import { describe, expect, it } from 'vitest';

import {
  agesLeaningOnTheGenerator,
  conceptCoverage,
  coverageByAge,
  OLDEST_AGE,
  unservedConcepts,
  YOUNGEST_AGE,
} from './contentCoverage';

describe('every concept is served by something', () => {
  it('leaves no concept with neither authored problems nor a generator', () => {
    /*
     * **The one that would be felt by a learner.** Everything else here is a
     * number in a document; this is a child reaching a topic and finding
     * nothing behind it.
     */
    expect(unservedConcepts()).toEqual([]);
  });

  it('counts the generator concepts, which are not in the authored band map', () => {
    /*
     * They are inserted at runtime by `ensureGeneratorConcepts` rather than
     * living in `CONCEPT_AGE_BANDS`. The first version of `conceptCoverage`
     * read only the authored map, so every generator column was zero and
     * `unservedConcepts` was scanning a set that could never contain them — an
     * empty answer from a check that was looking in the wrong place.
     */
    const generated = conceptCoverage().filter(concept => concept.generated);
    expect(generated).toHaveLength(12);
    expect(generated.every(concept => concept.highAge > concept.lowAge)).toBe(true);
  });
});

describe('what each age actually has', () => {
  const byAge = new Map(coverageByAge().map(age => [age.age, age]));

  it('covers every year this product claims to teach', () => {
    for (let age = YOUNGEST_AGE; age <= OLDEST_AGE; age += 1) {
      expect(byAge.get(age)?.concepts, `age ${age}`).toBeGreaterThan(0);
    }
  });

  it('has no authored problems at all for a seven-year-old', () => {
    /*
     * **Asserted so it cannot quietly change in either direction.** This is the
     * only year between three and eighteen with nothing authored, and it is the
     * single sharpest gap in the product — a seven-year-old meets three
     * generator variants where a nine-year-old meets those plus a hundred and
     * eighty-five written questions.
     *
     * When somebody authors for age seven, this test fails. That is the point:
     * the gap stops being true, the roadmap has to be rewritten, and the failure
     * is what makes anyone do it.
     */
    expect(byAge.get(7)?.authoredProblems).toBe(0);
    expect(byAge.get(7)?.conceptsWithAuthored).toBe(0);
    expect(byAge.get(7)?.generatedConcepts).toBe(3);
  });

  it('names age seven as the only year leaning entirely on the generator', () => {
    expect(agesLeaningOnTheGenerator()).toEqual([7]);
  });

  it('matches the figures the roadmap publishes', () => {
    /*
     * The roadmap's table, as data. It drifting from this is the failure — and
     * a test is the only thing that can notice, because the document itself is
     * read by people who have no way to check it.
     */
    const published: Record<number, number> = {
      3: 100, 4: 180, 5: 180, 6: 120, 7: 0, 8: 65,
      9: 185, 10: 165, 11: 150, 12: 340, 13: 566, 14: 431,
      15: 272, 16: 168, 17: 63, 18: 21,
    };

    const measured = Object.fromEntries(
      coverageByAge().map(age => [age.age, age.authoredProblems]),
    );
    expect(measured).toEqual(published);
  });

  it('counts only authored problems, never the generator’s own output', () => {
    /*
     * The mistake that nearly went into the roadmap. Counting `problems` rows in
     * a development database says age seven has three; they are
     * `source = 'generated'`, persisted while somebody used the app.
     * `takeAuthoredProblem` filters on that column for the same reason, and a
     * measurement that does not is counting the generator's work as authoring.
     *
     * Reading the corpus rather than a database is what makes that impossible
     * here — and is also why this test needs no database at all.
     */
    const total = coverageByAge().reduce((sum, age) => sum + age.authoredProblems, 0);
    // Every authored problem counted once per year of its band, so the total is
    // far larger than the corpus. What matters is that it is derived, not typed.
    expect(total).toBeGreaterThan(0);
    expect(
      conceptCoverage().filter(concept => concept.authoredProblems > 0).length,
    ).toBeGreaterThan(40);
  });
});
