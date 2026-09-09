/**
 * A concept for each variant the problem generator can produce.
 *
 * Generated problems carry a `topicDomain` and a `standardCode` but no concept
 * identity, and the schema requires one — mastery is tracked per concept, and a
 * problem that belongs to nothing cannot move a learner's progress anywhere.
 *
 * The mapping is one concept per generator variant, keyed by the same id prefix
 * the integrity gate declares in `DECLARED_KINDS`. That keeps the two lists
 * aligned by construction rather than by convention, and the test beside this
 * file asserts the titles and standards here are the ones the generator actually
 * emits — so a change to either side fails rather than drifting.
 *
 * These are not the whole curriculum. The imported corpus brings 51 concepts of
 * its own, and these sit alongside them rather than replacing them: generated
 * content gives unlimited practice at a variant, authored content gives depth.
 *
 * Their `sortOrder` starts at 9000, past every imported strand, so that a
 * learner meets written questions before generated ones. The two ranges
 * overlapped at first, and a nine-year-old was offered a generated fraction
 * before ever seeing `unit-fractions` — the corpus was seeded and invisible.
 */

import type { AgeTier } from '../../src/services/tiers';
import { bandForTier } from '../../src/services/tiers';

export interface GeneratorConcept {
  /** Matches the generator's id prefix, e.g. `mid-linear`. */
  id: string;
  title: string;
  strand: string;
  tier: AgeTier;
  standardCode: string;
  sortOrder: number;
}

export const GENERATOR_CONCEPTS: readonly GeneratorConcept[] = [
  { id: 'early-bond', title: 'Number Bonds & Compositions', strand: 'foundations', tier: 'early', standardCode: 'CCSS.MATH.PK.OA.1', sortOrder: 9010 },
  { id: 'early-add', title: 'Early Addition Concepts', strand: 'foundations', tier: 'early', standardCode: 'CCSS.MATH.K.OA.2', sortOrder: 9020 },
  { id: 'early-pat', title: 'Algebraic Thinking & Patterns', strand: 'foundations', tier: 'early', standardCode: 'CCSS.MATH.PK.G.1', sortOrder: 9030 },

  { id: 'elem-frac', title: 'Fractions & Equivalence', strand: 'fractions-to-algebra', tier: 'elementary', standardCode: 'CCSS.MATH.4.NF.1', sortOrder: 9040 },
  { id: 'elem-mult', title: 'Multi-Digit Operations & Place Value', strand: 'number-and-operations', tier: 'elementary', standardCode: 'CCSS.MATH.4.NBT.5', sortOrder: 9050 },
  { id: 'elem-geom', title: 'Geometric Measurement & Area', strand: 'geometry', tier: 'elementary', standardCode: 'CCSS.MATH.3.MD.7', sortOrder: 9060 },

  { id: 'mid-linear', title: 'Linear Equations & Expressions', strand: 'algebra-1', tier: 'middle', standardCode: 'CCSS.MATH.7.EE.4', sortOrder: 9070 },
  { id: 'mid-integers', title: 'The Number System & Integers', strand: 'number-and-operations', tier: 'middle', standardCode: 'CCSS.MATH.7.NS.1', sortOrder: 9080 },
  { id: 'mid-slope', title: 'Linear Functions & Slope', strand: 'algebra-1', tier: 'middle', standardCode: 'CCSS.MATH.8.EE.6', sortOrder: 9090 },

  { id: 'high-quad', title: 'Quadratic Equations & Roots', strand: 'algebra-1', tier: 'high', standardCode: 'CCSS.MATH.HSA.REI.4', sortOrder: 9100 },
  { id: 'high-calc', title: 'Calculus & Instantaneous Rates', strand: 'calculus', tier: 'high', standardCode: 'AP.CALC.CHA.2', sortOrder: 9110 },
  { id: 'high-trig', title: 'Trigonometric Functions & Unit Circle', strand: 'trigonometry', tier: 'high', standardCode: 'CCSS.MATH.HSF.TF.3', sortOrder: 9120 },
];

const BY_ID = new Map(GENERATOR_CONCEPTS.map(concept => [concept.id, concept]));

export function generatorConcept(id: string): GeneratorConcept | undefined {
  return BY_ID.get(id);
}

export function conceptsForTier(tier: AgeTier): GeneratorConcept[] {
  return GENERATOR_CONCEPTS.filter(concept => concept.tier === tier);
}

/**
 * The row shape the `concepts` table wants.
 *
 * Age bands are taken from the tier rather than restated, so a change to the
 * bands moves the content with it instead of leaving the two a year apart.
 */
export function conceptRow(concept: GeneratorConcept) {
  const band = bandForTier(concept.tier);
  return {
    id: concept.id,
    strand: concept.strand,
    title: concept.title,
    description: `Adaptive practice generated for ${concept.title.toLowerCase()}.`,
    tier: concept.tier,
    ageBandLow: band.lowAge,
    ageBandHigh: band.highAge,
    standardCode: concept.standardCode,
    sortOrder: concept.sortOrder,
  };
}
