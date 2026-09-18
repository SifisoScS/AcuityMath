/**
 * Which curriculum standards this product can honestly claim to cover.
 *
 * **The answer today is almost none, and that is the finding rather than a
 * defect in this module.**
 *
 * `docs/ROADMAP.md` §8 has listed a CCSS coverage audit since it was written,
 * on the reasonable assumption that the corpus carried standard codes and
 * somebody only had to count them. It does not. The authored corpus — fifty-one
 * concepts across four strands in `data/curriculum/` — carries **no standard
 * codes at all**, and `SourceConcept` has no field to put one in, so this is not
 * a matter of nulls waiting to be filled.
 *
 * The twelve concepts that *do* carry a code are the generator's, declared in
 * `generatorConcepts.ts`. They are exactly the concepts with **no authored
 * problems**. So the only part of this product mapped to a standard is the part
 * nobody wrote questions for, which is the precise inverse of what an alignment
 * report is for.
 *
 * This module therefore reports the gap rather than a matrix. Two things follow
 * from that choice and both are deliberate:
 *
 * **It does not invent an alignment.** Mapping a concept to a standard is a
 * curriculum judgement somebody has to stand behind, and a district reading a
 * fabricated alignment claim is the failure this codebase has spent several
 * steps deleting — an invented campus dashboard, a handshake that always
 * succeeded, endpoints that were never routes.
 *
 * **It does not report zero coverage.** A matrix of zeros reads as *"this
 * product covers no standards"*. The truth is *"nothing has been mapped"*, and
 * those are different sentences to a district deciding whether to buy.
 *
 * When the mapping is authored, `mappingIsOutstanding` stops being true and the
 * test asserting it fails — which is the point. The claim in the roadmap cannot
 * drift away from the data in either direction without something going red.
 */

import { GENERATOR_CONCEPTS } from '../learning/generatorConcepts';
import { CONCEPT_AGE_BANDS } from './ageBands';
import { loadAllStrands } from './sources';

export interface ConceptStandard {
  conceptId: string;
  /** The standard this concept claims, or null when none has been authored. */
  standardCode: string | null;
  /** Whether any authored problem exists for it. */
  authored: boolean;
  /** Whether the generator can produce it. */
  generated: boolean;
}

const GENERATOR_BY_ID = new Map(GENERATOR_CONCEPTS.map(concept => [concept.id, concept]));

/**
 * Every concept, and the standard it claims.
 *
 * Read from the corpus on disk and from the generator's own declaration, never
 * from a database — the same rule `contentCoverage.ts` follows and for the same
 * reason. This is a fact about **what was authored**, and a query would answer
 * differently depending on whether somebody had run a seed.
 */
export function conceptStandards(): ConceptStandard[] {
  const strands = loadAllStrands();

  const authored = new Set<string>();
  for (const { curriculum } of strands) {
    for (const problem of curriculum.problems ?? []) {
      authored.add(problem.concept_id);
    }
  }

  const fromCorpus = Object.keys(CONCEPT_AGE_BANDS).map(conceptId => ({
    conceptId,
    /*
     * Always null, and not because the data is missing. `SourceConcept` has no
     * field for a standard, and `importCurriculum` writes `standardCode: null`
     * for every authored concept. Read through the same accessor anyway, so
     * that adding the field later is one change here rather than a new code
     * path somebody has to remember to write.
     */
    standardCode: GENERATOR_BY_ID.get(conceptId)?.standardCode ?? null,
    authored: authored.has(conceptId),
    generated: GENERATOR_BY_ID.has(conceptId),
  }));

  /*
   * Generator concepts are not in `CONCEPT_AGE_BANDS` — they are inserted at
   * runtime by `ensureGeneratorConcepts`. Omitting them here would report that
   * nothing at all carries a standard, which is wrong in the direction that
   * flatters nobody but is still wrong. The same omission was a live defect in
   * `contentCoverage` until F1 found it.
   */
  const known = new Set(fromCorpus.map(concept => concept.conceptId));
  const generatorOnly = GENERATOR_CONCEPTS.filter(concept => !known.has(concept.id)).map(
    concept => ({
      conceptId: concept.id,
      standardCode: concept.standardCode ?? null,
      authored: authored.has(concept.id),
      generated: true,
    }),
  );

  return [...fromCorpus, ...generatorOnly];
}

/**
 * Concepts with no standard against them.
 *
 * The number this module exists to publish. Every one of these is a topic this
 * product teaches and cannot say which standard it satisfies — which is the
 * question every district procurement form asks first.
 */
export function unmappedConcepts(): string[] {
  return conceptStandards()
    .filter(concept => concept.standardCode === null)
    .map(concept => concept.conceptId)
    .sort();
}

/** The distinct standards claimed anywhere, in order. */
export function claimedStandards(): string[] {
  return [
    ...new Set(
      conceptStandards()
        .map(concept => concept.standardCode)
        .filter((code): code is string => code !== null),
    ),
  ].sort();
}

export interface StandardsSummary {
  concepts: number;
  mapped: number;
  unmapped: number;
  /**
   * Mapped concepts that have **no authored problems**.
   *
   * The number that makes the current state legible. Today it equals `mapped`
   * exactly: every standard this product names is attached to a concept the
   * generator serves and nobody wrote a question for.
   */
  mappedWithoutAuthoredProblems: number;
  /** Authored concepts carrying a standard. Today: none. */
  mappedWithAuthoredProblems: number;
}

export function standardsSummary(): StandardsSummary {
  const concepts = conceptStandards();
  const mapped = concepts.filter(concept => concept.standardCode !== null);

  return {
    concepts: concepts.length,
    mapped: mapped.length,
    unmapped: concepts.length - mapped.length,
    mappedWithoutAuthoredProblems: mapped.filter(concept => !concept.authored).length,
    mappedWithAuthoredProblems: mapped.filter(concept => concept.authored).length,
  };
}

/**
 * Whether a standards alignment still has to be authored before this product
 * can answer a district's alignment question.
 *
 * True today. It becomes false when some authored concept carries a standard —
 * at which point the test asserting this goes red and whoever did the authoring
 * is told to update what the roadmap claims. That is the whole mechanism: the
 * documented position cannot drift from the corpus in either direction.
 */
export function mappingIsOutstanding(): boolean {
  return standardsSummary().mappedWithAuthoredProblems === 0;
}
