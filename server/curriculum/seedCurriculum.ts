/**
 * Writing the imported curriculum to the database.
 *
 * Idempotent: running it twice leaves the same rows, and running it after an
 * upstream edit updates what changed. That matters because a seed you are
 * frightened to re-run is a seed that drifts from its source — the donor
 * engine's notes record three defects that its seeds only revealed on first
 * execution, and a hint pool that duplicated itself on every run.
 *
 * The mapping is in `importCurriculum.ts` and is pure; this file only writes.
 */

import { eq, inArray, sql } from 'drizzle-orm';

import * as schema from '../../drizzle/schema';
import type { Database } from '../db/client';
import {
  mapConcepts,
  mapHints,
  mapPrerequisites,
  mapProblems,
  type ProblemRow,
} from './importCurriculum';
import { loadAllStrands } from './sources';

export interface SeedReport {
  concepts: number;
  prerequisites: number;
  problems: number;
  distractors: number;
  hints: number;
  hintErrorModes: number;
}

/**
 * Inserts in batches.
 *
 * A single insert of 1,132 rows exceeds `max_allowed_packet` on a default MySQL
 * once the visual payloads are included — foundations problems carry a drawable
 * figure each — and the failure is an opaque protocol error rather than a
 * useful message.
 */
const BATCH = 200;

async function insertInBatches<T>(rows: T[], write: (batch: T[]) => Promise<unknown>): Promise<number> {
  for (let index = 0; index < rows.length; index += BATCH) {
    await write(rows.slice(index, index + BATCH));
  }
  return rows.length;
}

export async function seedCurriculum(db: Database): Promise<SeedReport> {
  const strands = loadAllStrands();

  // Concepts first: everything else references them.
  const conceptRows = strands.flatMap(({ curriculum }, index) =>
    mapConcepts(curriculum, index * 1_000),
  );

  await insertInBatches(conceptRows, batch =>
    db
      .insert(schema.concepts)
      .values(batch)
      .onDuplicateKeyUpdate({
        set: {
          title: sql`values(title)`,
          description: sql`values(description)`,
          tier: sql`values(tier)`,
          ageBandLow: sql`values(age_band_low)`,
          ageBandHigh: sql`values(age_band_high)`,
          sortOrder: sql`values(sort_order)`,
        },
      }),
  );

  const conceptIds = new Set(conceptRows.map(row => row.id));

  // Prerequisites are edges with no payload, so replacing them wholesale is
  // simpler than reconciling and cannot leave a stale edge behind.
  const prerequisiteRows = strands.flatMap(({ curriculum }) => mapPrerequisites(curriculum));
  await db
    .delete(schema.conceptPrerequisites)
    .where(inArray(schema.conceptPrerequisites.conceptId, [...conceptIds]));
  await insertInBatches(prerequisiteRows, batch =>
    db.insert(schema.conceptPrerequisites).values(batch),
  );

  const problemRows = strands.flatMap(({ curriculum }) => mapProblems(curriculum));
  const distractorCount = await seedProblems(db, problemRows);

  const hintRows = strands.flatMap(({ hints }) => mapHints(hints, conceptIds));
  const hintErrorModeCount = await seedHints(db, hintRows, [...conceptIds]);

  return {
    concepts: conceptRows.length,
    prerequisites: prerequisiteRows.length,
    problems: problemRows.length,
    distractors: distractorCount,
    hints: hintRows.length,
    hintErrorModes: hintErrorModeCount,
  };
}

/**
 * Writes problems, keyed on their source id.
 *
 * `external_id` is what makes this idempotent. Matching on prompt text would
 * break the moment an upstream typo was fixed, and would then insert a second
 * copy of the same question rather than updating the first.
 *
 * Distractors are replaced rather than merged: a rationale removed upstream
 * must disappear here, and an update-only pass would leave it diagnosing an
 * option that no longer exists.
 */
async function seedProblems(db: Database, rows: ProblemRow[]): Promise<number> {
  await insertInBatches(rows, batch =>
    db
      .insert(schema.problems)
      .values(
        batch.map(row => ({
          externalId: row.externalId,
          conceptId: row.conceptId,
          source: 'authored' as const,
          prompt: row.prompt,
          answer: row.answer,
          answerType: row.answerType,
          choices: row.choices,
          explanation: row.explanation,
          hint: row.hint,
          difficulty: row.difficulty,
          visual: row.visual,
          problemType: row.problemType,
          cognitiveLoad: row.cognitiveLoad,
          contextLabel: row.contextLabel,
          variantIndex: row.variantIndex,
          interleaved: row.interleaved,
          verificationExpression: row.verificationExpression,
        })),
      )
      .onDuplicateKeyUpdate({
        set: {
          prompt: sql`values(prompt)`,
          answer: sql`values(answer)`,
          answerType: sql`values(answer_type)`,
          choices: sql`values(choices)`,
          explanation: sql`values(explanation)`,
          hint: sql`values(hint)`,
          difficulty: sql`values(difficulty)`,
          visual: sql`values(visual)`,
          problemType: sql`values(problem_type)`,
          cognitiveLoad: sql`values(cognitive_load)`,
          contextLabel: sql`values(context_label)`,
          variantIndex: sql`values(variant_index)`,
          interleaved: sql`values(interleaved)`,
          verificationExpression: sql`values(verification_expression)`,
        },
      }),
  );

  // Read the ids back: a bulk upsert cannot report them, and matching on the
  // source id is the only stable link between a mapped row and its database id.
  const externalIds = rows.map(row => row.externalId);
  const idByExternal = new Map<string, number>();
  for (let index = 0; index < externalIds.length; index += BATCH) {
    const found = await db
      .select({ id: schema.problems.id, externalId: schema.problems.externalId })
      .from(schema.problems)
      .where(inArray(schema.problems.externalId, externalIds.slice(index, index + BATCH)));
    for (const row of found) if (row.externalId) idByExternal.set(row.externalId, row.id);
  }

  const problemIds = [...idByExternal.values()];
  for (let index = 0; index < problemIds.length; index += BATCH) {
    await db
      .delete(schema.problemDistractors)
      .where(inArray(schema.problemDistractors.problemId, problemIds.slice(index, index + BATCH)));
  }

  const distractorRows = rows.flatMap(row => {
    const problemId = idByExternal.get(row.externalId);
    if (!problemId) throw new Error(`Problem ${row.externalId} was written but could not be read back.`);
    return row.distractors.map(distractor => ({
      problemId,
      value: distractor.value,
      misconceptionCode: distractor.misconceptionCode,
    }));
  });

  await insertInBatches(distractorRows, batch => db.insert(schema.problemDistractors).values(batch));
  return distractorRows.length;
}

/**
 * Writes hints.
 *
 * Replaced wholesale for the concepts being seeded, because the source hints
 * carry no stable id that survives regeneration — the donor engine's own notes
 * record a hint pool that duplicated itself on every seed, which is what
 * inserting without a key does.
 */
async function seedHints(
  db: Database,
  rows: ReturnType<typeof mapHints>,
  conceptIds: string[],
): Promise<number> {
  for (let index = 0; index < conceptIds.length; index += BATCH) {
    // hint_error_modes cascades from hints, so deleting the hints is enough.
    await db.delete(schema.hints).where(inArray(schema.hints.conceptId, conceptIds.slice(index, index + BATCH)));
  }

  let errorModeCount = 0;

  for (let index = 0; index < rows.length; index += BATCH) {
    const batch = rows.slice(index, index + BATCH);
    await db.insert(schema.hints).values(
      batch.map(row => ({
        conceptId: row.conceptId,
        body: row.body,
        misconceptionCode: row.misconceptionCode,
        scaffoldLevel: row.scaffoldLevel,
        cognitiveState: row.cognitiveState,
        hintStyle: row.hintStyle,
        difficultyLevel: row.difficultyLevel,
        verified: row.verified,
      })),
    );
  }

  // The error modes need the hint ids, and a bulk insert does not return them.
  // Reading back by concept and matching on body is safe here because the pool
  // is deduplicated upstream and the rows were just deleted and rewritten.
  const written = await db
    .select({ id: schema.hints.id, conceptId: schema.hints.conceptId, body: schema.hints.body })
    .from(schema.hints)
    .where(inArray(schema.hints.conceptId, conceptIds));

  const idByKey = new Map(written.map(row => [`${row.conceptId} ${row.body}`, row.id]));
  const errorModeRows = rows.flatMap(row => {
    const hintId = idByKey.get(`${row.conceptId} ${row.body}`);
    if (!hintId) return [];
    return [...new Set(row.errorModes)].map(errorMode => ({ hintId, errorMode }));
  });

  errorModeCount = await insertInBatches(errorModeRows, batch =>
    db.insert(schema.hintErrorModes).values(batch).onDuplicateKeyUpdate({ set: { hintId: sql`hint_id` } }),
  );

  return errorModeCount;
}

/** Row counts, for the audit script and the tests. */
export async function curriculumCounts(db: Database) {
  const [concepts] = await db.select({ n: sql<number>`count(*)` }).from(schema.concepts);
  const [problems] = await db
    .select({ n: sql<number>`count(*)` })
    .from(schema.problems)
    .where(eq(schema.problems.source, 'authored'));
  const [distractors] = await db.select({ n: sql<number>`count(*)` }).from(schema.problemDistractors);
  const [hints] = await db.select({ n: sql<number>`count(*)` }).from(schema.hints);

  return {
    concepts: Number(concepts.n),
    authoredProblems: Number(problems.n),
    distractors: Number(distractors.n),
    hints: Number(hints.n),
  };
}
