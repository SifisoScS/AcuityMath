/**
 * Choosing and persisting the next question.
 *
 * Two sources of content, and the choice between them is the substance of this
 * file.
 *
 * **Authored** problems come from the imported curriculum: 1,132 items whose
 * answers were verified with SymPy and whose wrong options were written by
 * someone who knew which misconception each represents. They are finite.
 *
 * **Generated** problems come from `ProblemGenerator`: unlimited, parameterised,
 * and verified by the integrity gate rather than by an author. They cover the
 * ages the corpus does not — most of all age 7, where the imported curriculum
 * has nothing at all.
 *
 * Authored content is preferred while any of it is unseen, because a written
 * question is better than a generated one. The generator takes over when the
 * authored well runs dry, which is what stops a learner meeting the same 180
 * foundations problems forever.
 */

import { and, eq, inArray, notInArray, sql } from 'drizzle-orm';

import { AdaptiveEngine } from '../../src/services/adaptiveEngine';
import { ProblemGenerator, type GeneratedMathProblem } from '../../src/services/problemGenerator';
import { approximateAge, tierForAge, type AgeTier } from '../../src/services/tiers';
import * as schema from '../../drizzle/schema';
import type { Database } from '../db/client';
import { conceptRow, GENERATOR_CONCEPTS } from './generatorConcepts';

export interface ServedProblem {
  problemId: number;
  conceptId: string;
  tier: AgeTier;
  prompt: string;
  choices: string[];
  hint: string;
  difficulty: number;
  answerType: 'numeric' | 'multiple_choice' | 'text';
  visual: Record<string, unknown> | null;
  manipulativeHint: string | null;
  standardCode: string | null;
  /** Which well this came from, so the client can label practice honestly. */
  source: 'authored' | 'generated';
}

const GENERATOR_KINDS = new Set(GENERATOR_CONCEPTS.map(concept => concept.id));

/**
 * Ensures every generator concept exists.
 *
 * Idempotent, and cheap enough to call on the serve path. The alternative — a
 * seed step run once by hand — is a step that gets missed, and the failure it
 * produces is a foreign key violation halfway through a child's first session.
 */
export async function ensureGeneratorConcepts(db: Database): Promise<void> {
  // Writes all of them rather than only the absent ones, so that a database
  // seeded before the sort range moved is corrected rather than left with the
  // old values. Cheap: twelve rows.
  await db
    .insert(schema.concepts)
    .values(GENERATOR_CONCEPTS.map(conceptRow))
    .onDuplicateKeyUpdate({
      set: {
        sortOrder: sql`values(sort_order)`,
        tier: sql`values(tier)`,
        ageBandLow: sql`values(age_band_low)`,
        ageBandHigh: sql`values(age_band_high)`,
      },
    });
}

export interface NextProblemOptions {
  conceptId?: string;
}

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

  const conceptId = options.conceptId ?? (await chooseConcept(db, learner.id, age));
  const authored = await takeAuthoredProblem(db, learner.id, conceptId, theta);
  if (authored) return { ...authored, tier };

  return { ...(await generateAndStore(db, conceptId, tier, theta)), tier };
}

/**
 * Which concept to practise.
 *
 * Scoped to the learner's age band, so a three-year-old is never offered
 * fractions and a fourteen-year-old is never sent back to shape sorting. A
 * concept never attempted outranks one attempted badly: an unseen idea is where
 * the most is learned, and a learner who only revisits their worst score never
 * meets anything new.
 */
async function chooseConcept(db: Database, learnerId: number, age: number): Promise<string> {
  const available = await db
    .select({ id: schema.concepts.id, sortOrder: schema.concepts.sortOrder })
    .from(schema.concepts)
    .where(and(sql`${schema.concepts.ageBandLow} <= ${age}`, sql`${schema.concepts.ageBandHigh} >= ${age}`))
    .orderBy(schema.concepts.sortOrder);

  if (available.length === 0) {
    throw new Error(
      `No concept is banded for age ${age}. Every age from 3 to 18 should be reachable — ` +
        'check the generator concepts were seeded and the age bands cover this year.',
    );
  }

  const ids = available.map(row => row.id);
  const mastery = await db
    .select()
    .from(schema.learnerConceptMastery)
    .where(
      and(
        eq(schema.learnerConceptMastery.learnerId, learnerId),
        inArray(schema.learnerConceptMastery.conceptId, ids),
      ),
    );

  const unseen = available.find(row => !mastery.some(m => m.conceptId === row.id));
  if (unseen) return unseen.id;

  return [...mastery].sort((a, b) => a.masteryScore - b.masteryScore)[0].conceptId;
}

/**
 * An authored problem the learner has not answered, closest to their ability.
 *
 * Returns null when the concept has no authored content left — either because
 * it is a generator-only concept, or because the learner has worked through all
 * of it. Both cases fall through to generation.
 *
 * Difficulty is matched to theta rather than taken in order: the corpus is
 * authored in a sensible sequence, but a learner well above or below the middle
 * of a concept should not start at its first item.
 */
async function takeAuthoredProblem(
  db: Database,
  learnerId: number,
  conceptId: string,
  theta: number,
): Promise<Omit<ServedProblem, 'tier'> | null> {
  const answered = await db
    .select({ problemId: schema.attempts.problemId })
    .from(schema.attempts)
    .where(and(eq(schema.attempts.learnerId, learnerId), eq(schema.attempts.conceptId, conceptId)));

  const seen = answered.map(row => row.problemId);

  // The 1-10 difficulty scale mapped from theta, the same mapping the generator
  // uses, so a learner meets comparable difficulty from either source.
  const targetDifficulty = Math.min(10, Math.max(1, Math.round(5.5 + theta * 1.5)));

  const conditions = [
    eq(schema.problems.conceptId, conceptId),
    eq(schema.problems.source, 'authored'),
  ];
  if (seen.length > 0) conditions.push(notInArray(schema.problems.id, seen));

  const [candidate] = await db
    .select()
    .from(schema.problems)
    .where(and(...conditions))
    .orderBy(sql`abs(${schema.problems.difficulty} - ${targetDifficulty})`, schema.problems.id)
    .limit(1);

  if (!candidate) return null;

  return {
    problemId: candidate.id,
    conceptId: candidate.conceptId,
    prompt: candidate.prompt,
    // A numeric problem has no choices; the client renders an input instead.
    choices: (candidate.choices as string[] | null) ?? [],
    hint: candidate.hint,
    difficulty: candidate.difficulty,
    answerType: candidate.answerType,
    visual: (candidate.visual as Record<string, unknown> | null) ?? null,
    manipulativeHint: null,
    standardCode: null,
    source: 'authored',
  };
}

/**
 * Generates a problem for a concept and stores it.
 *
 * Storing it is what lets an attempt reference a question that can be shown
 * again in a review, and lets generated items accumulate the response data a
 * future calibration pass would need.
 */
async function generateAndStore(
  db: Database,
  conceptId: string,
  tier: AgeTier,
  theta: number,
): Promise<Omit<ServedProblem, 'tier'>> {
  if (!GENERATOR_KINDS.has(conceptId)) {
    // An authored concept whose problems are exhausted. Rather than fail the
    // session, fall back to the tier's generated content — the learner keeps
    // practising at the right level even though the concept has run out.
    const fallback = GENERATOR_CONCEPTS.find(concept => concept.tier === tier);
    if (!fallback) throw new Error(`No generator content for tier ${tier}`);
    conceptId = fallback.id;
  }

  const generated = generateForConcept(conceptId, tier, theta);
  const problemId = await persist(db, generated, conceptId);

  return {
    problemId,
    conceptId,
    prompt: generated.question,
    choices: generated.options,
    hint: generated.hint,
    difficulty: generated.difficulty ?? 5,
    answerType: 'multiple_choice',
    visual: (generated.visualData as Record<string, unknown>) ?? null,
    manipulativeHint: generated.manipulativeHint ?? null,
    standardCode: generated.standardCode ?? null,
    source: 'generated',
  };
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
