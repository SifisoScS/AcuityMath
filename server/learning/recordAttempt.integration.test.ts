/**
 * The answer pipeline, against a real MySQL.
 *
 * The criterion this graft is measured against: a parent account holds four
 * learners, each with independent attempts and mastery history, surviving a
 * restart. The last clause is why these assertions read state back out of the
 * database rather than from the return value — a pipeline that returns the
 * right numbers and persists the wrong ones passes any test that trusts itself.
 */

import { and, eq } from 'drizzle-orm';
import type { MySql2Database } from 'drizzle-orm/mysql2';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import * as schema from '../../drizzle/schema';
import { createTestDatabase, type TestDatabase } from '../test-support/database';
import { grantConsentForAllFamilies } from '../test-support/consent';
import { recordAttempt } from './recordAttempt';

const DATABASE_URL = process.env.DATABASE_URL;
const IN_CI = Boolean(process.env.CI);

if (IN_CI && !DATABASE_URL) {
  throw new Error('DATABASE_URL is unset in CI; this suite would skip while covering nothing.');
}

const describeWithDb = DATABASE_URL ? describe : describe.skip;

describeWithDb('recordAttempt', () => {
  let harness: TestDatabase;
  let db: MySql2Database<typeof schema>;
  let guardianId: number;
  let learnerIds: number[];
  let problemId: number;

  beforeAll(async () => {
    // Its own database. These suites run in parallel and both seed concepts.
    harness = await createTestDatabase('pipeline');
    db = harness.db;
  }, 60_000);

  afterAll(async () => {
    await harness?.close();
  });

  beforeEach(async () => {
    await harness.reset();

    const [guardian] = await db
      .insert(schema.users)
      .values({ email: 'sarah@example.test', name: 'Sarah Jenkins', role: 'parent' })
      .$returningId();
    guardianId = guardian.id;

    learnerIds = [];
    for (const child of [
      { displayName: 'Maya', birthYear: 2022 },
      { displayName: 'Leo', birthYear: 2018 },
      { displayName: 'Sophia', birthYear: 2014 },
      { displayName: 'Alexander', birthYear: 2010 },
    ]) {
      const [row] = await db.insert(schema.learners).values({ ...child, guardianId }).$returningId();
      learnerIds.push(row.id);
    }

    await db.insert(schema.concepts).values({
      id: 'number-bonds',
      strand: 'foundations',
      title: 'Number bonds to ten',
      tier: 'early',
      ageBandLow: 3,
      ageBandHigh: 6,
    });

    const [problem] = await db
      .insert(schema.problems)
      .values({
        conceptId: 'number-bonds',
        source: 'generated',
        generatorKind: 'early-bond',
        prompt: 'You have 7 stars. How many more to make 10?',
        answer: '3',
        choices: ['3', '4', '2', '10'],
        explanation: '7 + 3 = 10.',
        hint: 'Count on from seven.',
        irtDiscrimination: '1.1',
        irtDifficulty: '-0.8',
        irtPseudoGuessing: '0.25',
      })
      .$returningId();
    problemId = problem.id;

    await db.insert(schema.problemDistractors).values([
      { problemId, value: '4', misconceptionCode: 'OFF_BY_ONE_COUNTING' },
      { problemId, value: '2', misconceptionCode: 'OFF_BY_ONE_COUNTING' },
      { problemId, value: '10', misconceptionCode: 'GENERAL_CALCULATION_SLIP' },
    ]);
  
    // Graft E1b refuses to record an under-13's practice without consent.
    // The learners exist by here, so this covers them.
    await grantConsentForAllFamilies(db);
}, 30_000);

  it('decides correctness from the stored problem, not the client', async () => {
    const result = await recordAttempt(db, { learnerId: learnerIds[0], problemId, submittedAnswer: '3' });
    expect(result.isCorrect).toBe(true);

    const [persisted] = await db.select().from(schema.attempts).where(eq(schema.attempts.id, result.attemptId));
    expect(persisted.isCorrect).toBe(true);
    expect(persisted.conceptId).toBe('number-bonds');
  });

  it('forgives whitespace and case, but nothing else', async () => {
    const forgiven = await recordAttempt(db, { learnerId: learnerIds[0], problemId, submittedAnswer: '  3 ' });
    expect(forgiven.isCorrect).toBe(true);

    const wrong = await recordAttempt(db, { learnerId: learnerIds[0], problemId, submittedAnswer: '4' });
    expect(wrong.isCorrect).toBe(false);
  });

  it('diagnoses a wrong answer the generator predicted', async () => {
    const result = await recordAttempt(db, { learnerId: learnerIds[0], problemId, submittedAnswer: '4' });
    expect(result.misconceptionCode).toBe('OFF_BY_ONE_COUNTING');

    const [tally] = await db
      .select()
      .from(schema.learnerMisconceptions)
      .where(eq(schema.learnerMisconceptions.learnerId, learnerIds[0]));
    expect(tally.observedCount).toBe(1);
  });

  it('leaves an unpredicted wrong answer undiagnosed rather than inventing one', async () => {
    // A typed number nobody anticipated is simply wrong. Guessing a
    // misconception would put a false diagnosis in front of a teacher.
    const result = await recordAttempt(db, { learnerId: learnerIds[0], problemId, submittedAnswer: '87' });
    expect(result.isCorrect).toBe(false);
    expect(result.misconceptionCode).toBeNull();

    const tallies = await db
      .select()
      .from(schema.learnerMisconceptions)
      .where(eq(schema.learnerMisconceptions.learnerId, learnerIds[0]));
    expect(tallies).toHaveLength(0);
  });

  it('counts a repeated misconception rather than duplicating the row', async () => {
    for (let i = 0; i < 3; i++) {
      await recordAttempt(db, { learnerId: learnerIds[0], problemId, submittedAnswer: '4' });
    }
    const tallies = await db
      .select()
      .from(schema.learnerMisconceptions)
      .where(eq(schema.learnerMisconceptions.learnerId, learnerIds[0]));

    expect(tallies).toHaveLength(1);
    expect(tallies[0].observedCount).toBe(3);
  });

  it('moves mastery and records a history point per answer', async () => {
    await recordAttempt(db, { learnerId: learnerIds[0], problemId, submittedAnswer: '3' });
    await recordAttempt(db, { learnerId: learnerIds[0], problemId, submittedAnswer: '3' });

    const [mastery] = await db
      .select()
      .from(schema.learnerConceptMastery)
      .where(eq(schema.learnerConceptMastery.learnerId, learnerIds[0]));

    expect(mastery.attemptCount).toBe(2);
    expect(mastery.accuracy).toBe(100);
    expect(mastery.masteryScore).toBeGreaterThan(0);

    const history = await db
      .select()
      .from(schema.conceptMasteryHistory)
      .where(eq(schema.conceptMasteryHistory.learnerId, learnerIds[0]));
    expect(history).toHaveLength(2);
    expect(history[1].masteryScore).toBeGreaterThan(history[0].masteryScore);
  });

  it('starts a learner at their own age, not a default one', async () => {
    // This returned `createInitialProfile(10)` for everybody, so a
    // four-year-old's first answer put her on a ten-year-old's curve — her
    // level jumped from 2.0 to 4.3 on a question she got wrong.
    const [maya] = learnerIds; // born 2022
    const [alexander] = learnerIds.slice(3); // born 2010

    const young = await recordAttempt(db, { learnerId: maya, problemId, submittedAnswer: '3' });
    const older = await recordAttempt(db, { learnerId: alexander, problemId, submittedAnswer: '3' });

    expect(young.ability.theta).toBeLessThan(older.ability.theta);
  });

  it('advances the ability estimate and its history', async () => {
    const first = await recordAttempt(db, { learnerId: learnerIds[0], problemId, submittedAnswer: '3' });
    const second = await recordAttempt(db, { learnerId: learnerIds[0], problemId, submittedAnswer: '3' });

    expect(second.ability.theta).toBeGreaterThanOrEqual(first.ability.theta);
    expect(second.ability.historyCount).toBe(2);

    const [persisted] = await db
      .select()
      .from(schema.learnerAbility)
      .where(eq(schema.learnerAbility.learnerId, learnerIds[0]));

    // Read back as a string on purpose: the column is a string so the value
    // cannot drift through binary floating point between writes.
    expect(Number(persisted.theta)).toBeCloseTo(second.ability.theta, 6);
    expect(persisted.historyCount).toBe(2);

    const history = await db
      .select()
      .from(schema.learnerAbilityHistory)
      .where(eq(schema.learnerAbilityHistory.learnerId, learnerIds[0]));
    expect(history).toHaveLength(2);
  });

  it('keeps four siblings independent', async () => {
    // The criterion this graft is measured against.
    const [maya, leo, sophia, alexander] = learnerIds;

    await recordAttempt(db, { learnerId: maya, problemId, submittedAnswer: '3' });
    await recordAttempt(db, { learnerId: maya, problemId, submittedAnswer: '3' });
    await recordAttempt(db, { learnerId: leo, problemId, submittedAnswer: '4' });
    await recordAttempt(db, { learnerId: sophia, problemId, submittedAnswer: '3' });

    const counts = await Promise.all(
      learnerIds.map(async id =>
        (await db.select().from(schema.attempts).where(eq(schema.attempts.learnerId, id))).length,
      ),
    );
    expect(counts).toEqual([2, 1, 1, 0]);

    const [mayaMastery] = await db
      .select()
      .from(schema.learnerConceptMastery)
      .where(
        and(
          eq(schema.learnerConceptMastery.learnerId, maya),
          eq(schema.learnerConceptMastery.conceptId, 'number-bonds'),
        ),
      );
    const [leoMastery] = await db
      .select()
      .from(schema.learnerConceptMastery)
      .where(
        and(
          eq(schema.learnerConceptMastery.learnerId, leo),
          eq(schema.learnerConceptMastery.conceptId, 'number-bonds'),
        ),
      );

    expect(mayaMastery.accuracy).toBe(100);
    expect(leoMastery.accuracy).toBe(0);
    expect(mayaMastery.masteryScore).toBeGreaterThan(leoMastery.masteryScore);

    // Alexander never answered, so he has no mastery row at all — an absent row
    // and a zero mean different things and should not be conflated.
    const alexanderMastery = await db
      .select()
      .from(schema.learnerConceptMastery)
      .where(eq(schema.learnerConceptMastery.learnerId, alexander));
    expect(alexanderMastery).toHaveLength(0);
  });

  it('survives a restart', async () => {
    // The clause that separates this from the JSON-file storage it replaces.
    const [maya] = learnerIds;
    await recordAttempt(db, { learnerId: maya, problemId, submittedAnswer: '3' });
    await recordAttempt(db, { learnerId: maya, problemId, submittedAnswer: '3' });

    db = await harness.reconnect();

    const attempts = await db.select().from(schema.attempts).where(eq(schema.attempts.learnerId, maya));
    const [ability] = await db
      .select()
      .from(schema.learnerAbility)
      .where(eq(schema.learnerAbility.learnerId, maya));

    expect(attempts).toHaveLength(2);
    expect(ability.historyCount).toBe(2);
  });

  it('writes nothing when the problem does not exist', async () => {
    await expect(
      recordAttempt(db, { learnerId: learnerIds[0], problemId: 999_999, submittedAnswer: '3' }),
    ).rejects.toThrow(/No problem/);

    const attempts = await db.select().from(schema.attempts);
    expect(attempts).toHaveLength(0);
  });

  it('rolls the whole answer back when any part of it fails', async () => {
    // An attempt row without its mastery row would be a learner whose history
    // says they practised and whose dashboard says they did not.
    await expect(
      recordAttempt(db, { learnerId: 999_999, problemId, submittedAnswer: '3' }),
    ).rejects.toThrow();

    expect(await db.select().from(schema.attempts)).toHaveLength(0);
    expect(await db.select().from(schema.learnerConceptMastery)).toHaveLength(0);
    expect(await db.select().from(schema.learnerAbility)).toHaveLength(0);
    expect(await db.select().from(schema.conceptMasteryHistory)).toHaveLength(0);
  });

  it('marks a reconciled offline attempt as one', async () => {
    const result = await recordAttempt(db, {
      learnerId: learnerIds[0],
      problemId,
      submittedAnswer: '3',
      wasOffline: true,
    });

    const [persisted] = await db.select().from(schema.attempts).where(eq(schema.attempts.id, result.attemptId));
    expect(persisted.wasOffline).toBe(true);
  });
});
