/**
 * How much authored content each age actually has.
 *
 * `ageBands.ts` already counts **concepts** per age and a test asserts the
 * shape. Nobody counted **problems**, and that is the number `docs/ROADMAP.md`
 * publishes — hand-copied, and therefore only as current as the last person to
 * remember it.
 *
 * The roadmap's figure turned out to be right, which was worth finding out the
 * hard way. Counting `problems` rows in a development database says age seven
 * has three; counting the corpus says none. The database is wrong, because
 * those three rows are `source = 'generated'` — generator output that happened
 * to be persisted while somebody used the app. `takeAuthoredProblem` filters on
 * that column for the same reason, and any measurement that does not is
 * counting the generator's work as somebody's authoring.
 *
 * This module exists so that figure is computed rather than remembered. What it
 * guards is narrower and more important than the table, though:
 *
 * **Every concept must be served by something.** A concept with no authored
 * problems is perfectly fine when the generator produces it — that is the design,
 * and twelve concepts are deliberately generator-backed. A concept with neither
 * is a child reaching a topic and being handed nothing, which is the one outcome
 * here that a learner can actually feel.
 *
 * What the numbers say today: **age seven is the only year between three and
 * eighteen with no authored problems at all.** It is served by three generator
 * concepts and nothing else, where a nine-year-old has those plus a hundred and
 * eighty-five written questions. That is not incorrect mathematics — generated
 * problems pass the same integrity gate — but it is a much narrower year, and
 * until now nothing in the build said so.
 */

import { bandForTier } from '../../src/services/tiers';
import { GENERATOR_CONCEPTS } from '../learning/generatorConcepts';
import { bandFor, CONCEPT_AGE_BANDS } from './ageBands';
import { loadAllStrands } from './sources';

/** The youngest and oldest this product claims to teach. */
export const YOUNGEST_AGE = 3;
export const OLDEST_AGE = 18;

const GENERATOR_IDS = new Set<string>(GENERATOR_CONCEPTS.map(concept => concept.id));

export interface ConceptCoverage {
  conceptId: string;
  authoredProblems: number;
  /** Whether the generator can produce this concept without limit. */
  generated: boolean;
  lowAge: number;
  highAge: number;
}

/**
 * Every concept, with how it is served.
 *
 * Read from the corpus on disk rather than from a database, because this is a
 * fact about **what was authored**, not about what happens to be seeded into
 * somebody's development machine. A test that queried a database would pass or
 * fail depending on whether a seed had been run.
 */
export function conceptCoverage(): ConceptCoverage[] {
  const strands = loadAllStrands();

  const authored = new Map<string, number>();
  for (const { curriculum } of strands) {
    for (const problem of curriculum.problems ?? []) {
      authored.set(problem.concept_id, (authored.get(problem.concept_id) ?? 0) + 1);
    }
  }

  const authoredConcepts = Object.keys(CONCEPT_AGE_BANDS).map(conceptId => {
    const band = bandFor(conceptId);
    return {
      conceptId,
      authoredProblems: authored.get(conceptId) ?? 0,
      generated: GENERATOR_IDS.has(conceptId),
      lowAge: band.lowAge,
      highAge: band.highAge,
    };
  });

  /*
   * The generator's concepts are **not in `CONCEPT_AGE_BANDS`** — they are
   * inserted at runtime by `ensureGeneratorConcepts`, with bands taken from
   * their tier. Counting only the authored map made every generator column read
   * zero, and `unservedConcepts` returned an empty list because it was looking
   * at a set that never contained them.
   *
   * That is the guard-that-checks-nothing shape this project keeps finding, and
   * it was found here by the numbers looking wrong rather than by a test. Their
   * bands are derived the same way `conceptRow` derives them, so the two cannot
   * disagree about which ages a generator concept reaches.
   */
  const known = new Set(authoredConcepts.map(concept => concept.conceptId));
  const generatorOnly = GENERATOR_CONCEPTS.filter(
    concept => !known.has(concept.id),
  ).map(concept => {
    const band = bandForTier(concept.tier);
    return {
      conceptId: concept.id,
      authoredProblems: authored.get(concept.id) ?? 0,
      generated: true,
      lowAge: band.lowAge,
      highAge: band.highAge,
    };
  });

  return [...authoredConcepts, ...generatorOnly];
}

/**
 * Concepts a learner could reach and find nothing behind.
 *
 * The invariant this module exists for. Empty is the only acceptable answer,
 * and it is not a tidiness rule: everything else here is a number in a document,
 * while this is a child clicking a topic and being served no question at all.
 */
export function unservedConcepts(): string[] {
  return conceptCoverage()
    .filter(concept => concept.authoredProblems === 0 && !concept.generated)
    .map(concept => concept.conceptId);
}

export interface AgeCoverage {
  age: number;
  concepts: number;
  /** Concepts at this age with at least one authored problem. */
  conceptsWithAuthored: number;
  authoredProblems: number;
  /** Concepts at this age the generator can supply without limit. */
  generatedConcepts: number;
}

/**
 * The table `docs/ROADMAP.md` publishes, computed.
 *
 * Aggregating by age rather than by concept is what hides the real shape — an
 * age looks well served because a concept banded 7–10 counts for all four
 * years, whichever of them it was written for. Both numbers are reported for
 * that reason: `authoredProblems` says how much there is, and
 * `conceptsWithAuthored` says across how much of the curriculum it is spread.
 */
export function coverageByAge(): AgeCoverage[] {
  const coverage = conceptCoverage();
  const ages: AgeCoverage[] = [];

  for (let age = YOUNGEST_AGE; age <= OLDEST_AGE; age += 1) {
    const atAge = coverage.filter(concept => age >= concept.lowAge && age <= concept.highAge);
    ages.push({
      age,
      concepts: atAge.length,
      conceptsWithAuthored: atAge.filter(concept => concept.authoredProblems > 0).length,
      authoredProblems: atAge.reduce((sum, concept) => sum + concept.authoredProblems, 0),
      generatedConcepts: atAge.filter(concept => concept.generated).length,
    });
  }

  return ages;
}

/**
 * The ages carried almost entirely by the generator.
 *
 * Not a failure — a generated problem is verified by the same integrity gate the
 * authored corpus passes, so these children are served correct mathematics. It
 * is narrower, which is a different complaint and worth being able to name: a
 * seven-year-old meets three variants where a nine-year-old meets those plus a
 * hundred and eighty written questions.
 */
export function agesLeaningOnTheGenerator(threshold = 10): number[] {
  return coverageByAge()
    .filter(age => age.authoredProblems < threshold)
    .map(age => age.age);
}
