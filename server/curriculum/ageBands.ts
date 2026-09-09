/**
 * What age each imported concept is for.
 *
 * ## Why this file is hand-written
 *
 * The donor engine's curriculum carries **no grade or age metadata at all**. A
 * concept has an id, a title, a description, prerequisites, problem types and
 * error types — and nothing that says who it is for. AcuityMath's whole
 * structure is age tiers, and `concepts.age_band_low/high` is what stops a
 * three-year-old's parent being shown a map of fractions.
 *
 * So the bands below are authored, not derived. They are one person's reading of
 * where each idea sits in a standard progression, and they are in a single
 * reviewable table precisely because they are judgements rather than facts. A
 * teacher disagreeing with a row should change the row.
 *
 * The prerequisite depth in the source data is a sanity check rather than a
 * source: it orders concepts within a strand but says nothing about the age the
 * strand starts at.
 *
 * ## The gap this exposes
 *
 * Assigning these turns "ages 6-10 are thin" from an impression into a number.
 * Concepts available per age:
 *
 *     3:5  4:9  5:9  6:6  7:0  8:3  9:8  10:7
 *     11:6  12:14  13:25  14:20  15:13  16:8  17:3  18:1
 *
 * **Age 7 has nothing.** Foundations stops at 6 and the fractions strand starts
 * at 8. Ages 8-11 have between three and eight concepts each, against
 * twenty-five at 13. A seven-year-old is served entirely by the generator until
 * content is written for them.
 *
 * `coverageByAge()` is asserted by the import test, so this shape cannot change
 * without someone being told.
 *
 * ## Where these disagree with a conventional syllabus
 *
 * A few concepts sit later here than a textbook would put them, because this
 * corpus's own prerequisite graph chains them that way — triangle
 * classification behind the angle sum, expressions behind proportionality. The
 * graph wins: it describes what the questions were written to assume, and
 * banding a concept earlier than its prerequisites would send a child to a
 * roadmap step their age says they cannot take.
 */

import { tierForAge, type AgeTier } from '../../src/services/tiers';

export interface ConceptBand {
  lowAge: number;
  highAge: number;
}

/**
 * Ages are the UK/US school-year convention: a concept taught in Grade 3 is
 * banded 8–9, Grade 6 is 11–12, and so on. Bands overlap deliberately, because
 * a child meets an idea over a range rather than in a year.
 */
export const CONCEPT_AGE_BANDS: Readonly<Record<string, ConceptBand>> = {
  // --- foundations: pre-numeracy -------------------------------------------
  'foundations-compare-size': { lowAge: 3, highAge: 5 },
  'foundations-match-identical': { lowAge: 3, highAge: 5 },
  'foundations-subitise-to-3': { lowAge: 3, highAge: 5 },
  'foundations-compare-length': { lowAge: 3, highAge: 6 },
  'foundations-odd-one-out': { lowAge: 3, highAge: 6 },
  'foundations-compare-quantity': { lowAge: 4, highAge: 6 },
  'foundations-count-to-5': { lowAge: 4, highAge: 6 },
  'foundations-match-numeral-to-5': { lowAge: 4, highAge: 6 },
  'foundations-pattern-abab': { lowAge: 4, highAge: 6 },

  // --- fractions to algebra ------------------------------------------------
  'unit-fractions': { lowAge: 8, highAge: 9 },
  'equivalent-fractions': { lowAge: 9, highAge: 10 },
  'compare-fractions': { lowAge: 9, highAge: 10 },
  'add-fractions': { lowAge: 9, highAge: 11 },
  'subtract-fractions': { lowAge: 9, highAge: 11 },
  'multiply-fractions': { lowAge: 10, highAge: 11 },
  'divide-fractions': { lowAge: 11, highAge: 12 },
  'ratios': { lowAge: 11, highAge: 12 },
  'rates': { lowAge: 11, highAge: 13 },
  'proportionality': { lowAge: 12, highAge: 13 },
  'percent': { lowAge: 12, highAge: 13 },
  'like-terms': { lowAge: 12, highAge: 13 },
  'two-step-equations': { lowAge: 12, highAge: 13 },
  'inequalities': { lowAge: 12, highAge: 14 },
  // Raised to sit after `proportionality`, which this corpus makes its
  // prerequisite. Conventionally expressions come first; here the problems were
  // written assuming proportional reasoning, so the source ordering wins.
  'expressions': { lowAge: 12, highAge: 13 },
  'one-step-equations': { lowAge: 12, highAge: 13 },
  'coordinate-patterns': { lowAge: 12, highAge: 13 },
  'distributive-property': { lowAge: 12, highAge: 14 },
  'linear-tables': { lowAge: 13, highAge: 14 },
  'linear-models': { lowAge: 13, highAge: 14 },

  // --- geometry ------------------------------------------------------------
  'polygon-perimeter': { lowAge: 8, highAge: 9 },
  'rectangle-area': { lowAge: 8, highAge: 10 },
  'angle-basics': { lowAge: 9, highAge: 10 },
  'angle-pairs': { lowAge: 12, highAge: 13 },
  'circle-measures': { lowAge: 12, highAge: 13 },
  'triangle-angle-sum': { lowAge: 13, highAge: 14 },
  'pythagorean-theorem': { lowAge: 13, highAge: 14 },
  // These three are later than a conventional syllabus would place them,
  // because this corpus chains them behind `triangle-angle-sum`: classification
  // and area both require the sum here, and composite area requires triangle
  // area. Placing them earlier would hand a ten-year-old problems that assume a
  // result their own roadmap says they have not met.
  'triangle-classification': { lowAge: 13, highAge: 14 },
  'triangle-area': { lowAge: 13, highAge: 14 },
  'composite-area': { lowAge: 13, highAge: 15 },

  // --- Algebra I -----------------------------------------------------------
  'algebra-variables-expressions': { lowAge: 13, highAge: 15 },
  'algebra-one-step-equations': { lowAge: 13, highAge: 15 },
  'algebra-combining-like-terms': { lowAge: 13, highAge: 15 },
  'algebra-exponent-rules': { lowAge: 13, highAge: 15 },
  'algebra-two-step-equations': { lowAge: 13, highAge: 16 },
  'algebra-distributive-property': { lowAge: 13, highAge: 16 },
  'algebra-multi-step-equations': { lowAge: 14, highAge: 16 },
  'algebra-inequalities-intro': { lowAge: 14, highAge: 16 },
  'algebra-polynomial-arithmetic': { lowAge: 14, highAge: 16 },
  'algebra-slope-intercept': { lowAge: 14, highAge: 17 },
  'algebra-graphing-linear': { lowAge: 14, highAge: 17 },
  'algebra-systems-substitution': { lowAge: 15, highAge: 18 },
};

/**
 * The band for a concept.
 *
 * Throws on an unknown id rather than guessing. A concept added to the source
 * data and not banded here would otherwise be silently placed somewhere, and
 * "somewhere" for a child's curriculum is not an acceptable default.
 */
export function bandFor(conceptId: string): ConceptBand {
  const band = CONCEPT_AGE_BANDS[conceptId];
  if (!band) {
    throw new Error(
      `No age band declared for concept "${conceptId}". Add it to CONCEPT_AGE_BANDS — ` +
        'the source curriculum carries no age metadata, so this cannot be derived.',
    );
  }
  return band;
}

/**
 * The tier a concept belongs to, taken from the age it starts at.
 *
 * The lower bound rather than the midpoint: a concept banded 13–16 is first met
 * by a thirteen-year-old, and placing it in the tier of its oldest learner would
 * hide it from the children who need it first.
 */
export function tierFor(conceptId: string): AgeTier {
  return tierForAge(bandFor(conceptId).lowAge);
}

/** How many concepts a learner of each age can be offered. Used by the tests. */
export function coverageByAge(): Record<number, number> {
  const coverage: Record<number, number> = {};
  for (let age = 3; age <= 18; age++) {
    coverage[age] = Object.values(CONCEPT_AGE_BANDS).filter(
      band => age >= band.lowAge && age <= band.highAge,
    ).length;
  }
  return coverage;
}
