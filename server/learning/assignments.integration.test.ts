// @vitest-environment node

/**
 * Who may set work for whom, against a real MySQL.
 *
 * The rule this covers does not exist anywhere else. `learnerProcedure` is
 * guardian-or-admin and deliberately refuses to know about teachers, so
 * `assignableLearnerIds` is the only thing standing between a teacher and every
 * child in the database. Most of these tests are about what it refuses.
 */

import { eq } from 'drizzle-orm';
import type { MySql2Database } from 'drizzle-orm/mysql2';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import * as schema from '../../drizzle/schema';
import { issueElevation, ELEVATION_COOKIE } from '../auth/session';
import { ensureGeneratorConcepts } from './serveProblem';
import { appRouter } from '../trpc/routers';
import type { Context } from '../trpc';
import { createTestDatabase, type TestDatabase } from '../test-support/database';

const DATABASE_URL = process.env.DATABASE_URL;
if (process.env.CI && !DATABASE_URL) {
  throw new Error('DATABASE_URL is unset in CI; this suite would skip while covering nothing.');
}
const describeWithDb = DATABASE_URL ? describe : describe.skip;

type Adult = { id: number; email: string; name: string | null; role: 'parent' | 'teacher' | 'admin' };

describeWithDb('assignments', () => {
  let harness: TestDatabase;
  let db: MySql2Database<typeof schema>;

  let sarah: Adult; // a parent, with two children
  let henderson: Adult; // a teacher, with a classroom
  let stranger: Adult; // another parent
  let district: Adult; // an administrator

  let maya: number; // Sarah's, and in Henderson's classroom
  let leo: number; // Sarah's, in no classroom
  let outsider: number; // the other family's child
  let conceptId: string;

  beforeAll(async () => {
    harness = await createTestDatabase('assignments');
    db = harness.db;
  }, 60_000);

  afterAll(async () => {
    await harness?.close();
  });

  async function adult(email: string, role: Adult['role']): Promise<Adult> {
    await db.insert(schema.users).values({ email, role });
    const [row] = await db.select().from(schema.users).where(eq(schema.users.email, email));
    return { id: row.id, email: row.email, name: row.name, role };
  }

  async function childOf(guardianId: number, displayName: string): Promise<number> {
    await db.insert(schema.learners).values({ guardianId, displayName, birthYear: 2016 });
    const mine = await db
      .select()
      .from(schema.learners)
      .where(eq(schema.learners.guardianId, guardianId));
    return mine.find(row => row.displayName === displayName)!.id;
  }

  beforeEach(async () => {
    await harness.reset();
    process.env.JWT_SECRET = 'a-test-secret-that-is-comfortably-long-enough-to-pass';
    await ensureGeneratorConcepts(db);

    const [concept] = await db.select({ id: schema.concepts.id }).from(schema.concepts).limit(1);
    conceptId = concept.id;

    sarah = await adult('sarah@example.test', 'parent');
    henderson = await adult('henderson@example.test', 'teacher');
    stranger = await adult('stranger@example.test', 'parent');
    district = await adult('district@example.test', 'admin');

    maya = await childOf(sarah.id, 'Maya');
    leo = await childOf(sarah.id, 'Leo');
    outsider = await childOf(stranger.id, 'Outsider');

    await db.insert(schema.classrooms).values({ teacherId: henderson.id, name: 'Room 4' });
    const [room] = await db
      .select()
      .from(schema.classrooms)
      .where(eq(schema.classrooms.teacherId, henderson.id));
    await db.insert(schema.classroomLearners).values({ classroomId: room.id, learnerId: maya });
  }, 40_000);

  const callerFor = (user: Adult | null, elevation?: string) =>
    appRouter.createCaller({
      db,
      user,
      headers: elevation ? { cookie: `${ELEVATION_COOKIE}=${elevation}` } : {},
      setCookie: () => {},
    } satisfies Context);

  const elevated = async (user: Adult) => callerFor(user, await issueElevation(user.id));

  const newAssignment = (learnerIds: number[]) => ({
    title: 'Ten minutes of number bonds',
    instructions: 'Use the scratchpad.',
    conceptId,
    learnerIds,
    rewardCoins: 5,
  });

  describe('who may set work', () => {
    it('lets a guardian set work for their own children', async () => {
      const caller = await elevated(sarah);
      const result = await caller.assignments.create(newAssignment([maya, leo]));
      expect(result.assigned).toBe(2);
    });

    it('lets a teacher set work for a child in their classroom', async () => {
      const caller = await elevated(henderson);
      await expect(caller.assignments.create(newAssignment([maya]))).resolves.toBeTruthy();
    });

    it('refuses a teacher a child who is not in their classroom', async () => {
      // Leo belongs to Sarah and to no classroom. A teacher reaching him would
      // make the classroom decoration.
      const caller = await elevated(henderson);
      await expect(caller.assignments.create(newAssignment([leo]))).rejects.toThrow(
        /cannot set work/i,
      );
    });

    it('refuses a guardian a child from another family', async () => {
      const caller = await elevated(sarah);
      await expect(caller.assignments.create(newAssignment([outsider]))).rejects.toThrow(
        /cannot set work/i,
      );
    });

    it('gives an administrator no bypass', async () => {
      // The admin role bypasses `learnerProcedure` by design. Setting homework
      // is not an administrative act, and a silent power over every child in
      // the database is how an access rule stops being one.
      const caller = await elevated(district);
      await expect(caller.assignments.create(newAssignment([maya]))).rejects.toThrow(
        /cannot set work/i,
      );
    });

    it('refuses the whole batch when one target is not theirs', async () => {
      // Partial success would assign to the permitted children and quietly drop
      // the rest, which reads as success to the caller.
      const caller = await elevated(sarah);
      await expect(caller.assignments.create(newAssignment([maya, outsider]))).rejects.toThrow();

      expect(await db.select().from(schema.assignments)).toHaveLength(0);
      expect(await db.select().from(schema.assignmentTargets)).toHaveLength(0);
    });

    it('requires the adult to have stepped up', async () => {
      await expect(callerFor(sarah).assignments.create(newAssignment([maya]))).rejects.toThrow(
        /STEP_UP_REQUIRED/,
      );
    });

    it('refuses a signed-out caller', async () => {
      await expect(callerFor(null).assignments.create(newAssignment([maya]))).rejects.toThrow();
    });

    it('refuses a concept that does not exist', async () => {
      const caller = await elevated(sarah);
      await expect(
        caller.assignments.create({ ...newAssignment([maya]), conceptId: 'not-a-concept' }),
      ).rejects.toThrow(/No such concept/i);
    });
  });

  describe('what an author sees', () => {
    it('counts targets from the rows rather than a stored total', async () => {
      const caller = await elevated(sarah);
      await caller.assignments.create(newAssignment([maya, leo]));

      const [assignment] = await caller.assignments.authored();
      expect(assignment.totalAssigned).toBe(2);
      expect(assignment.completedCount).toBe(0);
    });

    it('reads the topic and tier from the concept, not from the form', async () => {
      const caller = await elevated(sarah);
      await caller.assignments.create(newAssignment([maya]));

      const [assignment] = await caller.assignments.authored();
      const [concept] = await db
        .select()
        .from(schema.concepts)
        .where(eq(schema.concepts.id, conceptId));
      expect(assignment.conceptTitle).toBe(concept.title);
      expect(assignment.tier).toBe(concept.tier);
    });

    it('shows only their own', async () => {
      await (await elevated(sarah)).assignments.create(newAssignment([maya]));
      await (await elevated(henderson)).assignments.create(newAssignment([maya]));

      expect(await (await elevated(sarah)).assignments.authored()).toHaveLength(1);
      expect(await (await elevated(stranger)).assignments.authored()).toHaveLength(0);
    });
  });

  describe('what a learner sees', () => {
    it('lists the work they were set', async () => {
      const author = await elevated(sarah);
      await author.assignments.create(newAssignment([maya]));

      const list = await author.assignments.forLearner({ learnerId: maya });
      expect(list).toHaveLength(1);
      expect(list[0].status).toBe('pending');
    });

    it('does not list work set to a sibling', async () => {
      const author = await elevated(sarah);
      await author.assignments.create(newAssignment([maya]));
      expect(await author.assignments.forLearner({ learnerId: leo })).toHaveLength(0);
    });

    it('refuses a child from another family', async () => {
      const author = await elevated(sarah);
      await expect(author.assignments.forLearner({ learnerId: outsider })).rejects.toThrow(
        /No such learner/,
      );
    });
  });

  describe('marking work done', () => {
    it('completes one child copy only', async () => {
      const author = await elevated(sarah);
      await author.assignments.create(newAssignment([maya, leo]));
      const [assignment] = await author.assignments.authored();

      await author.assignments.markComplete({ learnerId: maya, assignmentId: assignment.id });

      const [after] = await author.assignments.authored();
      expect(after.completedCount).toBe(1);
      expect(after.totalAssigned).toBe(2);

      const forLeo = await author.assignments.forLearner({ learnerId: leo });
      expect(forLeo[0].status).toBe('pending');
    });

    it('refuses to complete work the learner was never set', async () => {
      const author = await elevated(sarah);
      await author.assignments.create(newAssignment([maya]));
      const [assignment] = await author.assignments.authored();

      await expect(
        author.assignments.markComplete({ learnerId: leo, assignmentId: assignment.id }),
      ).rejects.toThrow(/was not set this work/i);
    });
  });

  describe('who may be assigned to', () => {
    it('offers a guardian their own children', async () => {
      const ids = (await (await elevated(sarah)).assignments.assignableLearners()).map(l => l.id);
      expect(ids.sort()).toEqual([maya, leo].sort());
    });

    it('offers a teacher their classroom, and nobody else', async () => {
      const ids = (await (await elevated(henderson)).assignments.assignableLearners()).map(
        l => l.id,
      );
      expect(ids).toEqual([maya]);
    });

    it('carries each learner progress, because this is also the teacher roster', async () => {
      /*
       * `learners.list` is guardian-scoped, so a teacher signing in saw an empty
       * class and a form with nobody in it. The roster is this same list, which
       * is why it carries the summary rather than just ids and names.
       */
      const [row] = await (await elevated(henderson)).assignments.assignableLearners();
      expect(row.displayName).toBe('Maya');
      expect(row).toHaveProperty('accuracyRate');
      expect(row).toHaveProperty('dynamicLevel');
      expect(row).toHaveProperty('tier');
    });

    it('offers an administrator nobody', async () => {
      expect(await (await elevated(district)).assignments.assignableLearners()).toEqual([]);
    });
  });
});
