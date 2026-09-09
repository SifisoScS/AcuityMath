/**
 * The schema, against a real MySQL.
 *
 * `schema.test.ts` checks the shape of the definition; this checks that the
 * migration applies and that the constraints behave. Both are needed: a schema
 * can declare a cascade that MySQL then refuses to create, and a `references()`
 * that reads correctly in TypeScript is still only a claim until the storage
 * engine rejects the orphan.
 *
 * ## On skipping
 *
 * This suite needs a database and cannot invent one, so it skips when
 * `DATABASE_URL` is unset — which is most local runs. That is a real hazard: a
 * suite that quietly skips reports green while covering nothing, and the
 * donor engine's notes record exactly that failure mode. So the skip is
 * conditional on `CI` being unset. In CI, an absent `DATABASE_URL` is a hard
 * failure rather than a skip, because there the database is supposed to be
 * there and its absence is the bug.
 */

import { and, eq, sql } from 'drizzle-orm';
import type { MySql2Database } from 'drizzle-orm/mysql2';
import type mysql from 'mysql2/promise';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createTestDatabase, type TestDatabase } from '../server/test-support/database';
import * as schema from './schema';

const DATABASE_URL = process.env.DATABASE_URL;
const IN_CI = Boolean(process.env.CI);

if (IN_CI && !DATABASE_URL) {
  throw new Error(
    'DATABASE_URL is unset in CI. This suite is the only thing that proves the ' +
      'migration applies and the constraints hold; skipping it here would report ' +
      'green while covering nothing.',
  );
}

const describeWithDb = DATABASE_URL ? describe : describe.skip;

describeWithDb('schema against MySQL', () => {
  let harness: TestDatabase;
  let connection: mysql.Connection;
  let db: MySql2Database<typeof schema>;

  beforeAll(async () => {
    // Its own database, so a fixture seeded by another suite running in
    // parallel cannot appear in these assertions.
    harness = await createTestDatabase('schema');
    connection = harness.connection;
    db = harness.db;
    await harness.reset();
  }, 60_000);

  afterAll(async () => {
    await harness?.close();
  });

  /** A guardian with four children, mirroring the profiles the app ships with. */
  async function seedFamily(email: string) {
    const [guardian] = await db.insert(schema.users).values({ email, name: 'Sarah Jenkins', role: 'parent' }).$returningId();

    const children = [
      { displayName: 'Maya', birthYear: 2022, avatar: '🌱' },
      { displayName: 'Leo', birthYear: 2018, avatar: '🚀' },
      { displayName: 'Sophia', birthYear: 2014, avatar: '⚡' },
      { displayName: 'Alexander', birthYear: 2010, avatar: '🌌' },
    ];

    const learnerIds: number[] = [];
    for (const child of children) {
      const [row] = await db.insert(schema.learners).values({ ...child, guardianId: guardian.id }).$returningId();
      learnerIds.push(row.id);
    }

    return { guardianId: guardian.id, learnerIds };
  }

  it('applies the migration', async () => {
    const [rows] = await connection.query<mysql.RowDataPacket[]>(
      'SELECT COUNT(*) AS n FROM information_schema.tables WHERE table_schema = DATABASE()',
    );
    // 21 tables plus drizzle's own migrations bookkeeping table.
    expect(Number(rows[0].n)).toBeGreaterThanOrEqual(21);
  });

  it('lets one guardian hold four learners', async () => {
    // The single assertion this whole graft exists for. Against the donor
    // engine's schema the second insert would violate a unique constraint.
    const { guardianId, learnerIds } = await seedFamily('many-learners@example.test');
    expect(learnerIds).toHaveLength(4);

    const held = await db.select().from(schema.learners).where(eq(schema.learners.guardianId, guardianId));
    expect(held).toHaveLength(4);
    expect(held.map(l => l.displayName).sort()).toEqual(['Alexander', 'Leo', 'Maya', 'Sophia']);
  });

  it('keeps each learner"s attempts to themselves', async () => {
    const { learnerIds } = await seedFamily('scoping@example.test');
    const [maya, leo] = learnerIds;

    await db.insert(schema.concepts).values({
      id: 'counting-to-five',
      strand: 'foundations',
      title: 'Counting to five',
      tier: 'early',
      ageBandLow: 3,
      ageBandHigh: 5,
    });

    const [problem] = await db
      .insert(schema.problems)
      .values({
        conceptId: 'counting-to-five',
        source: 'generated',
        generatorKind: 'early-bond',
        prompt: 'How many more to make 5?',
        answer: '2',
        choices: ['1', '2', '3', '5'],
        explanation: '3 + 2 = 5.',
        hint: 'Count on from three.',
      })
      .$returningId();

    for (const learnerId of [maya, maya, leo]) {
      await db.insert(schema.attempts).values({
        learnerId,
        problemId: problem.id,
        conceptId: 'counting-to-five',
        submittedAnswer: '2',
        isCorrect: true,
      });
    }

    const mayaAttempts = await db.select().from(schema.attempts).where(eq(schema.attempts.learnerId, maya));
    const leoAttempts = await db.select().from(schema.attempts).where(eq(schema.attempts.learnerId, leo));

    expect(mayaAttempts).toHaveLength(2);
    expect(leoAttempts).toHaveLength(1);
  });

  it('refuses an attempt for a learner who does not exist', async () => {
    // The constraint the donor engine has no equivalent of: with no foreign
    // keys, this insert succeeds and the orphan is found later by an audit.
    const [problem] = await db
      .select({ id: schema.problems.id })
      .from(schema.problems)
      .limit(1);

    await expect(
      db.insert(schema.attempts).values({
        learnerId: 999_999,
        problemId: problem.id,
        conceptId: 'counting-to-five',
        submittedAnswer: '2',
        isCorrect: true,
      }),
    ).rejects.toThrow();
  });

  it('erases a child"s data when the child is erased', async () => {
    const { learnerIds } = await seedFamily('erasure@example.test');
    const [target] = learnerIds;

    await db.insert(schema.learnerAbility).values({ learnerId: target, theta: '0.4', eloRating: 1320 });
    await db.insert(schema.screenTimeRules).values({ learnerId: target, dailyLimitMinutes: 30 });
    await db.insert(schema.learnerRewards).values({ learnerId: target, coins: 240 });

    await db.delete(schema.learners).where(eq(schema.learners.id, target));

    // A COPPA deletion request has to leave nothing behind.
    for (const table of [schema.learnerAbility, schema.screenTimeRules, schema.learnerRewards] as const) {
      const remaining = await db.select().from(table).where(eq(table.learnerId, target));
      expect(remaining).toHaveLength(0);
    }
  });

  it('refuses to delete a problem that attempts still reference', async () => {
    // Cascading here would erase a learner's history in order to tidy content.
    const [problem] = await db.select({ id: schema.problems.id }).from(schema.problems).limit(1);
    await expect(db.delete(schema.problems).where(eq(schema.problems.id, problem.id))).rejects.toThrow();
  });

  it('records consent as a sequence, not a flag', async () => {
    const { guardianId, learnerIds } = await seedFamily('consent@example.test');
    const [child] = learnerIds;

    await db.insert(schema.consentEvents).values({
      learnerId: child,
      grantedByUserId: guardianId,
      decision: 'granted',
      method: 'email_plus_verification',
      evidence: 'Sarah Jenkins',
    });
    await db.insert(schema.consentEvents).values({
      learnerId: child,
      grantedByUserId: guardianId,
      decision: 'withdrawn',
      method: 'email_plus_verification',
    });

    const events = await db
      .select()
      .from(schema.consentEvents)
      .where(eq(schema.consentEvents.learnerId, child))
      .orderBy(schema.consentEvents.recordedAt, schema.consentEvents.id);

    expect(events.map(e => e.decision)).toEqual(['granted', 'withdrawn']);
  });

  it('allows one row per learner per day of screen time, and no more', async () => {
    const { learnerIds } = await seedFamily('screentime@example.test');
    const [child] = learnerIds;

    await db.insert(schema.screenTimeUsage).values({ learnerId: child, day: '2026-09-08', minutesSpent: 12 });
    await expect(
      db.insert(schema.screenTimeUsage).values({ learnerId: child, day: '2026-09-08', minutesSpent: 30 }),
    ).rejects.toThrow();

    // The heartbeat's real write is an upsert onto that unique key.
    await db
      .insert(schema.screenTimeUsage)
      .values({ learnerId: child, day: '2026-09-08', minutesSpent: 30 })
      .onDuplicateKeyUpdate({ set: { minutesSpent: 30 } });

    const [usage] = await db
      .select()
      .from(schema.screenTimeUsage)
      .where(and(eq(schema.screenTimeUsage.learnerId, child), eq(schema.screenTimeUsage.day, '2026-09-08')));
    expect(usage.minutesSpent).toBe(30);
  });

  it('bands concepts so a three-year-old is not shown fractions', async () => {
    await db.insert(schema.concepts).values({
      id: 'equivalent-fractions',
      strand: 'fractions-to-algebra',
      title: 'Equivalent fractions',
      tier: 'elementary',
      ageBandLow: 9,
      ageBandHigh: 11,
    });

    const forThreeYearOld = await db
      .select()
      .from(schema.concepts)
      .where(and(sql`${schema.concepts.ageBandLow} <= 3`, sql`${schema.concepts.ageBandHigh} >= 3`));

    expect(forThreeYearOld.map(c => c.id)).toEqual(['counting-to-five']);
  });
});
