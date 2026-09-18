// @vitest-environment node

/**
 * What this product can honestly say about curriculum standards.
 *
 * Every number here is computed from the corpus rather than stated, for the
 * reason F1 gave about the roadmap's content table: a figure somebody
 * hand-copied is only as current as the last person who remembered it.
 *
 * The assertions are deliberately **two-sided**. They fail if the gap gets
 * worse and they also fail the day somebody authors a mapping — because at that
 * point the roadmap's position becomes stale, and a green suite would let it
 * stay stale.
 */

import { describe, expect, it } from 'vitest';

import { GENERATOR_CONCEPTS } from '../learning/generatorConcepts';
import {
  claimedStandards,
  conceptStandards,
  mappingIsOutstanding,
  standardsSummary,
  unmappedConcepts,
} from './standardsCoverage';

describe('the standards this product claims', () => {
  it('counts every concept, authored and generated alike', () => {
    /*
     * Generator concepts are not in `CONCEPT_AGE_BANDS`; they are inserted at
     * runtime. Omitting them here would report that nothing at all carries a
     * standard — wrong in a direction that flatters nobody, and still wrong.
     * The same omission was a live defect in `contentCoverage` until F1.
     */
    const summary = standardsSummary();
    const ids = new Set(conceptStandards().map(concept => concept.conceptId));

    expect(summary.concepts).toBe(ids.size);
    for (const concept of GENERATOR_CONCEPTS) {
      expect(ids.has(concept.id), concept.id).toBe(true);
    }
  });

  it('finds a standard on every generator concept and on nothing else', () => {
    /*
     * **The finding this module was written to record.** The only concepts
     * carrying a standard are the twelve the generator serves — which are
     * exactly the concepts with no authored problems. The one part of this
     * product mapped to a standard is the part nobody wrote questions for,
     * which is the precise inverse of what an alignment report is for.
     */
    const mapped = conceptStandards().filter(concept => concept.standardCode !== null);

    expect(mapped).toHaveLength(GENERATOR_CONCEPTS.length);
    expect(mapped.every(concept => concept.generated)).toBe(true);
  });

  it('reports that the alignment is still to be authored', () => {
    /*
     * **Two-sided on purpose.** This goes red the day an authored concept
     * carries a standard, which is not a failure — it is the signal that
     * `docs/ROADMAP.md` now says something untrue and whoever did the authoring
     * should say so there.
     */
    expect(mappingIsOutstanding()).toBe(true);
    expect(standardsSummary().mappedWithAuthoredProblems).toBe(0);
  });

  it('does not report the gap as zero coverage', () => {
    /*
     * The distinction that matters to a district reading it. A matrix of zeros
     * says "this product covers no standards"; the truth is "nothing has been
     * mapped", and a procurement officer acts differently on those two
     * sentences.
     */
    const summary = standardsSummary();

    expect(summary.mapped).toBeGreaterThan(0);
    expect(summary.unmapped).toBeGreaterThan(0);
    expect(summary.mapped + summary.unmapped).toBe(summary.concepts);
  });

  it('names the concepts nobody can answer a standards question about', () => {
    // The number this module exists to publish. Every one is a topic taught
    // here that cannot say which standard it satisfies — the first question on
    // every district procurement form.
    const unmapped = unmappedConcepts();

    expect(unmapped.length).toBe(standardsSummary().unmapped);
    expect([...unmapped].sort()).toEqual(unmapped);
    expect(new Set(unmapped).size).toBe(unmapped.length);
  });

  it('lists the standards it does claim, without duplicates', () => {
    const claimed = claimedStandards();

    expect(claimed.length).toBeGreaterThan(0);
    expect(new Set(claimed).size).toBe(claimed.length);
    expect([...claimed].sort()).toEqual(claimed);
  });

  it('does not invent a standard for an authored concept', () => {
    /*
     * The guard against the thing this step refused to do. Mapping a concept to
     * a standard is a curriculum judgement somebody has to stand behind, and a
     * district reading a fabricated alignment is the failure this codebase has
     * spent several steps deleting.
     */
    const authored = conceptStandards().filter(concept => concept.authored);

    expect(authored.length).toBeGreaterThan(0);
    expect(authored.every(concept => concept.standardCode === null)).toBe(true);
  });
});
