/**
 * Choosing and persisting the next question.
 *
 * The generator produces an unlimited supply, but an attempt has to reference a
 * stored problem: a parent reviewing a session needs to see the question their
 * child actually answered, and a teacher looking at a misconception needs the
 * item that produced it. So a generated problem is written to the database at
 * the moment it is served, and the attempt points at that row.
 *
 * This also means the corpus grows as it is used, and the items accumulate real
 * response data — which is what a future calibration pass would need to replace
 * the generator's declared IRT parameters with observed ones.
 */

import { and, desc, eq, inArray, notInArray, sql } from 'drizzle-orm';

import { AdaptiveEngine } from '../../src/services/adaptiveEngine';
import { ProblemGenerator, type GeneratedMathProblem } from '../../src/services/problemGenerator';
import { approximateAge, tierForAge, type AgeTier } from '../../src/services/tiers';
import * as schema from '../../drizzle/schema';
import type { Database } from '../db/client';
import { conceptRow, conceptsForTier, GENERATOR_CONCEPTS } from './generatorConcepts';

export interface ServedProblem {
  problemId: number;
  conceptId: string;
  tier: AgeTier;
  prompt: string;
  choices: string[];
  hint: string;
  difficulty: number;
  visualType: string | null;
  visual: Record<string, unknown> | null;
  manipulativeHint: string | null;
  standardCode: string | null;
}

/**
 * Ensures every generator concept exists.
 *
 * Idempotent, and cheap enough to call on the serve path. The alternative —
 * a seed step run once by hand — is a step that gets missed, and the failure it
 * produces is a foreign key violation halfway through a child's first session.
 */
export async function ensureGeneratorConcepts(db: Database): Promise<void> {
  const ids = GENERATOR_CONCEPTS.map(concept => concept.id);
  const present = await db
    .select({ id: schema.concepts.id })
    .from(schema.concepts)
    .where(inArray(schema.concepts.id, ids));

  const missing = GENERATOR_CONCEPTS.filter(
    concept => !present.some(row => row.id === concept.id),
  );
  if (missing.length === 0) return;

  await db.insert(schema.concepts).values(missing.map(conceptRow)).onDuplicateKeyUpdate({
    // Nothing to change — the insert exists to fill gaps, and a concurrent
    // request that won the race has already written the same row.
    set: { id: sql`id` },
  });
}

export interface NextProblemOptions {
  /**
   * Concept to practise. Omitted means "whatever the tier offers", chosen by
   * weakest mastery so a session works on what is least secure.
   */
  conceptId?: string;
}

/**
 * Generates, stores and returns the next question for a learner.
 *
 * Difficulty follows the learner's current ability estimate rather than their
 * age alone, which is the whole point of holding a theta. A learner with no
 * ability row yet is seeded from their tier.
 */
export async function serveNextProblem(
  db: Database,
  learner: typeof schema.learners.$inferSelect,
  options: NextProblemOptions = {},
): Promise<ServedProblem> {
  await ensureGeneratorConcepts(db);

  const age = approximateAge(learner.birthYear);
  const tier = tierForAge(age);

  const [ability] = await db
    .select()
    .from(schema.learnerAbility)
    .where(eq(schema.learnerAbility.learnerId, learner.id))
    .limit(1);

  const theta = ability ? Number(ability.theta) : AdaptiveEngine.createInitialProfile(age).theta;

  const conceptId = options.conceptId ?? (await weakestConceptForTier(db, learner.id, tier));
  const concept = GENERATOR_CONCEPTS.find(c => c.id === conceptId);
  if (!concept) throw new Error(`No generator concept ${conceptId}`);

  const generated = generateForConcept(concept.id, tier, theta);
  const problemId = await persist(db, generated, concept.id);

  return {
    problemId,
    conceptId: concept.id,
    tier,
    prompt: generated.question,
    choices: generated.options,
    hint: generated.hint,
    difficulty: generated.difficulty ?? 5,
    visualType: (generated.visualType as string) ?? null,
    visual: (generated.visualData as Record<string, unknown>) ?? null,
    manipulativeHint: generated.manipulativeHint ?? null,
    standardCode: generated.standardCode ?? null,
  };
}

/**
 * The concept in this tier the learner is weakest at.
 *
 * A concept never attempted outranks one attempted badly: an unseen idea is
 * where the most is learned, and a learner who only ever revisits their worst
 * score never meets anything new. Ties break on the declared order, so a fresh
 * learner starts at the beginning of the tier rather than somewhere arbitrary.
 */
async function weakestConceptForTier(db: Database, learnerId: number, tier: AgeTier): Promise<string> {
  const candidates = conceptsForTier(tier);
  if (candidates.length === 0) throw new Error(`No generator concepts for tier ${tier}`);

  const ids = candidates.map(c => c.id);
  const mastery = await db
    .select()
    .from(schema.learnerConceptMastery)
    .where(
      and(
        eq(schema.learnerConceptMastery.learnerId, learnerId),
        inArray(schema.learnerConceptMastery.conceptId, ids),
      ),
    );

  const unseen = candidates.find(c => !mastery.some(m => m.conceptId === c.id));
  if (unseen) return unseen.id;

  const weakest = [...mastery].sort((a, b) => a.masteryScore - b.masteryScore)[0];
  return weakest.conceptId;
}

/**
 * Draws a problem of a specific variant.
 *
 * `ProblemGenerator.generate` picks a variant at random within a tier, so
 * hitting a requested concept means asking repeatedly. Bounded, because an
 * unbounded loop on a generator that could never produce the variant would hang
 * a request rather than fail it; the fallback is an honest problem of the wrong
 * variant rather than an error page mid-session.
 */
function generateForConcept(conceptId: string, tier: AgeTier, theta: number): GeneratedMathProblem {
  let fallback: GeneratedMathProblem | null = null;

  for (let attempt = 0; attempt < 40; attempt++) {
    const problem = ProblemGenerator.generate(tier, theta);
    fallback ??= problem;
    const [, tierPart, variantPart] = problem.id.split('-');
    if (`${tierPart}-${variantPart}` === conceptId) return problem;
  }

  return fallback!;
}

/** Writes the problem and its diagnosed distractors as one unit. */
async function persist(db: Database, generated: GeneratedMathProblem, conceptId: string): Promise<number> {
  return db.transaction(async tx => {
    const [inserted] = await tx
      .insert(schema.problems)
      .values({
        conceptId,
        source: 'generated',
        generatorKind: conceptId,
        prompt: generated.question,
        answer: generated.correctAnswer,
        answerType: 'multiple_choice',
        choices: generated.options,
        explanation: generated.explanation,
        hint: generated.hint,
        difficulty: generated.difficulty ?? 5,
        visual: (generated.visualData as Record<string, unknown>) ?? null,
        irtDiscrimination: String(generated.irtParameters.discrimination),
        irtDifficulty: String(generated.irtParameters.difficulty),
        irtPseudoGuessing: String(generated.irtParameters.pseudoGuessing),
      })
      .$returningId();

    const distractors = Object.entries(generated.distractorDiagnostics)
      // The correct answer never carries a misconception. The generator gate
      // asserts this too; the filter is here because a violation should not
      // become a database row while the two are being kept in step.
      .filter(([value]) => value !== generated.correctAnswer)
      .map(([value, code]) => ({ problemId: inserted.id, value, misconceptionCode: String(code) }));

    if (distractors.length > 0) {
      await tx.insert(schema.problemDistractors).values(distractors);
    }

    return inserted.id;
  });
}

/**
 * Problems this learner has already answered in this session.
 *
 * Used to avoid serving the same generated item twice in one sitting — the
 * generator can repeat itself, and a child who sees the identical question back
 * to back reasonably concludes the app is broken.
 */
export async function problemsSeenInSession(db: Database, sessionId: number): Promise<number[]> {
  const rows = await db
    .select({ problemId: schema.attempts.problemId })
    .from(schema.attempts)
    .where(eq(schema.attempts.sessionId, sessionId))
    .orderBy(desc(schema.attempts.id));
  return rows.map(row => row.problemId);
}

export { notInArray };
