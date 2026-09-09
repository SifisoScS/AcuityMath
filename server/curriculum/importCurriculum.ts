/**
 * Turning the donor engine's curriculum exports into rows.
 *
 * Kept pure: JSON in, row objects out, no database. The seed script does the
 * writing. That separation is what lets the mapping be tested exhaustively over
 * all 1,132 problems in milliseconds, rather than a handful of them against a
 * server.
 *
 * ## Two misconception vocabularies
 *
 * The engine names errors per concept and in the concept's own language —
 * `denominator-as-value`, `angle-size-by-ray-length`, `size-inverted`. The
 * generator names them from a fixed list of ten — `SIGN_ERROR`,
 * `OFF_BY_ONE_COUNTING`. They are not the same vocabulary and neither is a
 * subset of the other.
 *
 * They are kept as written. Mapping `denominator-as-value` onto
 * `INVERTED_FRACTION` would discard the specific diagnosis that makes the
 * imported content worth having, and inventing a merged vocabulary would mean
 * re-authoring 1,132 problems' worth of pedagogy. `problems.source` already
 * distinguishes the two, so anything grouping by code can group by origin too.
 */

import type { AgeTier } from '../../src/services/tiers';
import { bandFor, tierFor } from './ageBands';

// ---------------------------------------------------------------------------
// The shape of the source files
// ---------------------------------------------------------------------------

export interface SourceConcept {
  id: string;
  title: string;
  description: string;
  prerequisites: string[];
  problem_types?: string[];
  error_types?: string[];
}

export interface SourceProblem {
  id: string;
  concept_id: string;
  prompt: string;
  answer: string;
  answer_type?: string;
  choices?: string[];
  distractor_rationales?: Record<string, string>;
  visual?: Record<string, unknown>;
  verification?: { mode?: string; expression?: string; expected?: unknown };
  explanation: string;
  hint: string;
  expected_error_modes?: string[];
  cognitive_load_level?: number;
  difficulty?: number;
  problem_type?: string;
  context?: string;
  variant_index?: number;
  interleaved?: boolean;
}

export interface SourceCurriculum {
  schema_version: string;
  strand: string;
  concepts: SourceConcept[];
  problems: SourceProblem[];
}

export interface SourceHint {
  id: string;
  concept_id: string;
  error_types?: string[];
  cognitive_state?: string;
  difficulty_level?: number;
  hint_style?: string;
  scaffold_level?: number;
  content: string;
  verified: boolean;
}

export interface SourceHintPool {
  hints: SourceHint[];
}

// ---------------------------------------------------------------------------
// The rows we produce
// ---------------------------------------------------------------------------

export interface ConceptRow {
  id: string;
  strand: string;
  title: string;
  description: string;
  tier: AgeTier;
  ageBandLow: number;
  ageBandHigh: number;
  standardCode: null;
  sortOrder: number;
}

export interface PrerequisiteRow {
  conceptId: string;
  prerequisiteId: string;
}

export interface ProblemRow {
  /** The source id, kept so a re-import can recognise what it already wrote. */
  externalId: string;
  conceptId: string;
  prompt: string;
  answer: string;
  answerType: 'numeric' | 'multiple_choice' | 'text';
  choices: string[] | null;
  explanation: string;
  hint: string;
  difficulty: number;
  visual: Record<string, unknown> | null;
  problemType: string | null;
  cognitiveLoad: number | null;
  contextLabel: string | null;
  variantIndex: number | null;
  interleaved: boolean;
  verificationExpression: string | null;
  distractors: { value: string; misconceptionCode: string }[];
}

export interface HintRow {
  conceptId: string;
  body: string;
  misconceptionCode: string | null;
  scaffoldLevel: number;
  cognitiveState: string | null;
  hintStyle: string | null;
  difficultyLevel: number | null;
  verified: boolean;
  errorModes: string[];
}

export class ImportError extends Error {}

// ---------------------------------------------------------------------------
// Mapping
// ---------------------------------------------------------------------------

/**
 * Concepts, ordered by prerequisite depth.
 *
 * `sortOrder` matters: without it the database returns concepts arbitrarily and
 * a knowledge map puts "Compare fractions" above the unit fractions it depends
 * on. Depth is computed from the prerequisite graph rather than the file order,
 * which is not guaranteed to be topological.
 */
export function mapConcepts(source: SourceCurriculum, sortBase = 0): ConceptRow[] {
  const byId = new Map(source.concepts.map(concept => [concept.id, concept]));

  const depthOf = (id: string, seen: ReadonlySet<string> = new Set()): number => {
    if (seen.has(id)) return 0; // a cycle; the validator below reports it
    const concept = byId.get(id);
    if (!concept || concept.prerequisites.length === 0) return 0;
    const nextSeen = new Set(seen).add(id);
    return (
      1 +
      Math.max(
        ...concept.prerequisites.filter(p => byId.has(p)).map(p => depthOf(p, nextSeen)),
        0,
      )
    );
  };

  return source.concepts
    .map(concept => ({ concept, depth: depthOf(concept.id) }))
    .sort((a, b) => a.depth - b.depth || a.concept.id.localeCompare(b.concept.id))
    .map(({ concept }, index) => {
      const band = bandFor(concept.id);
      return {
        id: concept.id,
        strand: source.strand,
        title: concept.title,
        description: concept.description,
        tier: tierFor(concept.id),
        ageBandLow: band.lowAge,
        ageBandHigh: band.highAge,
        // The source has no standards alignment. Left null rather than guessed:
        // a wrong CCSS code on a district compliance report is worse than none.
        standardCode: null,
        sortOrder: sortBase + index * 10,
      };
    });
}

export function mapPrerequisites(source: SourceCurriculum): PrerequisiteRow[] {
  const known = new Set(source.concepts.map(c => c.id));
  const rows: PrerequisiteRow[] = [];

  for (const concept of source.concepts) {
    for (const prerequisite of concept.prerequisites) {
      if (!known.has(prerequisite)) {
        throw new ImportError(
          `Concept "${concept.id}" requires "${prerequisite}", which is not in strand "${source.strand}". ` +
            'Cross-strand prerequisites are not supported by this import.',
        );
      }
      rows.push({ conceptId: concept.id, prerequisiteId: prerequisite });
    }
  }
  return rows;
}

/**
 * Problems, with their distractors resolved.
 *
 * A multiple-choice problem whose correct answer is missing from its own
 * choices, or whose choices repeat, is rejected rather than imported. The
 * generator gate exists because unreviewed content reaches learners; content
 * arriving from another repository deserves the same suspicion.
 */
export function mapProblems(source: SourceCurriculum): ProblemRow[] {
  const conceptIds = new Set(source.concepts.map(c => c.id));

  return source.problems.map(problem => {
    if (!conceptIds.has(problem.concept_id)) {
      throw new ImportError(`Problem "${problem.id}" points at absent concept "${problem.concept_id}".`);
    }

    // `answer_type` is authoritative where the source states it. A numeric
    // problem carries `choices: []` rather than omitting the key, so testing
    // `Array.isArray` alone reads every one of the 784 numeric items as
    // multiple choice with nothing to choose from.
    const hasChoices = Array.isArray(problem.choices) && problem.choices.length > 0;
    const isChoice = problem.answer_type
      ? problem.answer_type === 'multiple_choice'
      : hasChoices;
    const choices = hasChoices ? problem.choices! : null;

    if (isChoice) {
      if (!choices || choices.length < 2) {
        throw new ImportError(`Problem "${problem.id}" is multiple choice with ${choices?.length ?? 0} choices.`);
      }
      if (!choices.includes(problem.answer)) {
        throw new ImportError(
          `Problem "${problem.id}" has answer ${JSON.stringify(problem.answer)}, absent from its choices.`,
        );
      }
      if (new Set(choices).size !== choices.length) {
        throw new ImportError(`Problem "${problem.id}" repeats a choice.`);
      }
    }

    const rationales = problem.distractor_rationales ?? {};
    const distractors = Object.entries(rationales)
      // A rationale naming the correct answer would tag the right answer as an
      // error; the generator gate checks the same thing on its own output.
      .filter(([value]) => value !== problem.answer)
      .map(([value, misconceptionCode]) => ({ value, misconceptionCode }));

    for (const { value } of distractors) {
      if (choices && !choices.includes(value)) {
        throw new ImportError(
          `Problem "${problem.id}" diagnoses ${JSON.stringify(value)}, which is not one of its choices.`,
        );
      }
    }

    return {
      externalId: problem.id,
      conceptId: problem.concept_id,
      prompt: problem.prompt,
      answer: problem.answer,
      answerType: isChoice ? 'multiple_choice' : 'numeric',
      choices,
      explanation: problem.explanation,
      hint: problem.hint,
      // The source difficulty is a small ordinal; the column is 1-10.
      difficulty: clamp(problem.difficulty ?? 5, 1, 10),
      visual: problem.visual ?? null,
      problemType: problem.problem_type ?? null,
      cognitiveLoad: problem.cognitive_load_level ?? null,
      contextLabel: problem.context ?? null,
      variantIndex: problem.variant_index ?? null,
      interleaved: problem.interleaved ?? false,
      verificationExpression: problem.verification?.expression || null,
      distractors,
    };
  });
}

/**
 * Hints, with their error modes.
 *
 * Unverified hints are dropped rather than imported and filtered later. The
 * `verified` column is the gate, and a library that carries unverified rows
 * relies on every future query remembering to check it.
 */
export function mapHints(pool: SourceHintPool, knownConceptIds: ReadonlySet<string>): HintRow[] {
  return pool.hints
    .filter(hint => hint.verified)
    .map(hint => {
      if (!knownConceptIds.has(hint.concept_id)) {
        throw new ImportError(`Hint "${hint.id}" points at absent concept "${hint.concept_id}".`);
      }
      const errorModes = hint.error_types ?? [];
      return {
        conceptId: hint.concept_id,
        body: hint.content,
        // The first error mode is denormalised onto the row for the common
        // single-target lookup; the full set lives in `hint_error_modes`.
        misconceptionCode: errorModes[0] ?? null,
        scaffoldLevel: clamp(hint.scaffold_level ?? 1, 1, 4),
        cognitiveState: hint.cognitive_state ?? null,
        hintStyle: hint.hint_style ?? null,
        difficultyLevel: hint.difficulty_level ?? null,
        verified: true,
        errorModes,
      };
    });
}

function clamp(value: number, low: number, high: number): number {
  return Math.min(high, Math.max(low, Math.round(value)));
}
