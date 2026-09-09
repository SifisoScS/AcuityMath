/**
 * The seed, and the practice loop running on what it wrote.
 *
 * The mapping is covered exhaustively without a database in
 * `importCurriculum.test.ts`. What is left to prove is that the rows survive
 * contact with MySQL, that re-running does not duplicate them, and — the point
 * of the whole exercise — that a learner is served a written question rather
 * than a generated one when written questions exist for them.
 */

import { and, eq, sql } from 'drizzle-orm';
import type { MySql2Database } from 'drizzle-orm/mysql2';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import * as schema from '../../drizzle/schema';
import { recordAttempt } from '../learning/recordAttempt';
import { serveNextProblem } from '../learning/serveProblem';
import { createTestDatabase, type TestDatabase } from '../test-support/database';
import { curriculumCounts, seedCurriculum } from './seedCurriculum';

const DATABASE_URL = process.env.DATABASE_URL;
if (process.env.CI && !DATABASE_URL) {
  throw new Error('DATABASE_URL is unset in CI; this suite would skip while covering nothing.');
}
const describeWithDb = DATABASE_URL ? describe : describe.skip;

describeWithDb('curriculum seed', () => {
  let harness: TestDatabase;
  let db: MySql2Database<typeof schema>;
  let guardianId: number;

  beforeAll(async () => {
    harness = await createTestDatabase('curriculum');
    db = harness.db;
    await harness.reset();
    await seedCurriculum(db);

    const [guardian] = await db
      .insert(schema.users)
      .values({ email: 'seed@example.test', name: 'Seed', role: 'parent' })
      .$returningId();
    guardianId = guardian.id;
  }, 120_000);

  afterAll(async () => {
    await harness?.close();
  });

  /** A learner of a given age, born the right number of years ago. */
  async function learnerAged(age: number, name = `Aged ${age}`) {
    const birthYear = new Date().getFullYear() - age;
    const [row] = await db
      .insert(schema.learners)
      .values({ guardianId, displayName: name, birthYear })
      .$returningId();
    const [learner] = await db.select().from(schema.learners).where(eq(schema.learners.id, row.id));
    return learner;
  }

  describe('what it wrote', () => {
    it('writes all 51 concepts and 1,132 problems', async () => {
      const counts = await curriculumCounts(db);
      expect(counts.authoredProblems).toBe(1_132);
      // 51 imported plus the 12 the generator needs, created on the serve path.
      expect(counts.concepts).toBeGreaterThanOrEqual(51);
    });

    it('writes the 572-item hint library with its retrieval dimensions', async () => {
      const [{ n }] = await db.select({ n: sql<number>`count(*)` }).from(schema.hints);
      expect(Number(n)).toBe(572);

      const [{ withState }] = await db
        .select({ withState: sql<number>`count(*)` })
        .from(schema.hints)
        .where(sql`${schema.hints.cognitiveState} is not null`);
      expect(Number(withState)).toBe(572);

      // A hint commonly targets two error modes; the join table is what keeps
      // the second one.
      const [{ tags }] = await db.select({ tags: sql<number>`count(*)` }).from(schema.hintErrorModes);
      expect(Number(tags)).toBeGreaterThan(572);
    });

    it('keeps the source"s own misconception vocabulary', async () => {
      const [distractor] = await db
        .select()
        .from(schema.problemDistractors)
        .innerJoin(schema.problems, eq(schema.problems.id, schema.problemDistractors.problemId))
        .where(eq(schema.problems.externalId, 'foundations-compare-size-01'))
        .limit(1);

      // Not one of the generator's ten generic codes. Mapping it onto
      // SIGN_ERROR would have discarded the diagnosis worth having.
      expect(distractor.problem_distractors.misconceptionCode).toMatch(/^size-/);
    });

    it('stores a picture as data rather than markup', async () => {
      const [problem] = await db
        .select()
        .from(schema.problems)
        .where(eq(schema.problems.externalId, 'foundations-compare-size-01'));

      expect(problem.visual).toBeTruthy();
      expect(typeof problem.visual).toBe('object');
      expect(JSON.stringify(problem.visual)).not.toMatch(/<svg|<script/i);
    });

    it('orders concepts so a prerequisite never sorts after what needs it', async () => {
      const concepts = await db.select().from(schema.concepts);
      const order = new Map(concepts.map(c => [c.id, c.sortOrder]));
      const edges = await db.select().from(schema.conceptPrerequisites);

      expect(edges.length).toBeGreaterThan(0);
      for (const edge of edges) {
        expect(order.get(edge.prerequisiteId)!, `${edge.conceptId} after ${edge.prerequisiteId}`).toBeLessThan(
          order.get(edge.conceptId)!,
        );
      }
    });
  });

  describe('running it again', () => {
    it('changes nothing', async () => {
      const before = await curriculumCounts(db);
      await seedCurriculum(db);
      const after = await curriculumCounts(db);

      // The donor engine shipped a hint pool that duplicated itself on every
      // seed. A seed people are frightened to re-run is one that drifts.
      expect(after).toEqual(before);
    });

    it('does not disturb a learner"s work', async () => {
      const learner = await learnerAged(9, 'Re-seed survivor');
      const problem = await serveNextProblem(db, learner);
      const [stored] = await db
        .select({ answer: schema.problems.answer })
        .from(schema.problems)
        .where(eq(schema.problems.id, problem.problemId));
      await recordAttempt(db, {
        learnerId: learner.id,
        problemId: problem.problemId,
        submittedAnswer: stored.answer,
      });

      await seedCurriculum(db);

      const attempts = await db
        .select()
        .from(schema.attempts)
        .where(eq(schema.attempts.learnerId, learner.id));
      expect(attempts).toHaveLength(1);
    });
  });

  describe('the practice loop, on real content', () => {
    it('serves a written question to a nine-year-old', async () => {
      const learner = await learnerAged(9);
      const problem = await serveNextProblem(db, learner);

      expect(problem.source).toBe('authored');
      expect(problem.prompt).toBeTruthy();
      expect(problem.tier).toBe('elementary');
    });

    it('serves a written question to a three-year-old', async () => {
      const learner = await learnerAged(3);
      const problem = await serveNextProblem(db, learner);

      expect(problem.source).toBe('authored');
      expect(problem.conceptId).toMatch(/^foundations-/);
      // Foundations items are pictures; a three-year-old cannot read a prompt.
      expect(problem.visual).toBeTruthy();
    });

    it('falls back to the generator for a seven-year-old, who has no written content', async () => {
      // The gap the age banding exposed: foundations stops at 6 and the
      // fractions strand starts at 8. A seven-year-old must still get a session.
      const learner = await learnerAged(7);
      const problem = await serveNextProblem(db, learner);

      expect(problem.source).toBe('generated');
      expect(problem.choices.length).toBe(4);
    });

    it('never offers a three-year-old a fraction', async () => {
      const learner = await learnerAged(3, 'Not fractions');
      const concepts = new Set<string>();
      for (let i = 0; i < 12; i++) {
        const problem = await serveNextProblem(db, learner);
        concepts.add(problem.conceptId);
        const [stored] = await db
          .select({ answer: schema.problems.answer })
          .from(schema.problems)
          .where(eq(schema.problems.id, problem.problemId));
        await recordAttempt(db, {
          learnerId: learner.id,
          problemId: problem.problemId,
          submittedAnswer: stored.answer,
        });
      }

      for (const conceptId of concepts) {
        const [concept] = await db.select().from(schema.concepts).where(eq(schema.concepts.id, conceptId));
        expect(concept.ageBandLow, conceptId).toBeLessThanOrEqual(3);
        expect(concept.ageBandHigh, conceptId).toBeGreaterThanOrEqual(3);
      }
    });

    it('marks a numeric answer correct on a written problem', async () => {
      // The fractions strand is entirely numeric — no choices, a typed answer.
      // The whole pipeline has only ever been exercised on multiple choice.
      const learner = await learnerAged(11, 'Numeric');
      const [problem] = await db
        .select()
        .from(schema.problems)
        .where(and(eq(schema.problems.source, 'authored'), eq(schema.problems.answerType, 'numeric')))
        .limit(1);

      const result = await recordAttempt(db, {
        learnerId: learner.id,
        problemId: problem.id,
        submittedAnswer: problem.answer,
      });

      expect(result.isCorrect).toBe(true);
      expect(result.mastery).toBeGreaterThan(0);
    });

    it('does not repeat a written question the learner has answered', async () => {
      const learner = await learnerAged(9, 'No repeats');
      const served: number[] = [];

      for (let i = 0; i < 15; i++) {
        const problem = await serveNextProblem(db, learner, { conceptId: 'angle-basics' });
        served.push(problem.problemId);
        const [stored] = await db
          .select({ answer: schema.problems.answer })
          .from(schema.problems)
          .where(eq(schema.problems.id, problem.problemId));
        await recordAttempt(db, {
          learnerId: learner.id,
          problemId: problem.problemId,
          submittedAnswer: stored.answer,
        });
      }

      // Every authored problem for the concept is distinct; once they run out
      // the generator supplies more, and those are fresh rows each time.
      expect(new Set(served).size).toBe(served.length);
    });

    it('keeps working after a concept"s written problems are exhausted', async () => {
      const learner = await learnerAged(9, 'Exhauster');
      const [{ available }] = await db
        .select({ available: sql<number>`count(*)` })
        .from(schema.problems)
        .where(and(eq(schema.problems.conceptId, 'angle-basics'), eq(schema.problems.source, 'authored')));

      const sources: string[] = [];
      for (let i = 0; i < Number(available) + 3; i++) {
        const problem = await serveNextProblem(db, learner, { conceptId: 'angle-basics' });
        sources.push(problem.source);
        const [stored] = await db
          .select({ answer: schema.problems.answer })
          .from(schema.problems)
          .where(eq(schema.problems.id, problem.problemId));
        await recordAttempt(db, {
          learnerId: learner.id,
          problemId: problem.problemId,
          submittedAnswer: stored.answer,
        });
      }

      expect(sources.filter(s => s === 'authored').length).toBe(Number(available));
      expect(sources.slice(-3).every(s => s === 'generated')).toBe(true);
    });
  });
});
