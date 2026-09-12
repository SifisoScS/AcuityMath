// @vitest-environment node

/**
 * The consent gate against a real MySQL, and against the real writer.
 *
 * The policy is tested without a database in `consentGate.test.ts`. What only a
 * database can answer is whether the gate reads the same ledger `consent.record`
 * writes — and, more importantly, **whether an attempt actually fails to land**
 * when consent is absent. A gate that decides correctly and lets the row
 * through is not a gate.
 */

import { eq } from 'drizzle-orm';
import type { MySql2Database } from 'drizzle-orm/mysql2';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import * as schema from '../../drizzle/schema';
import { createTestDatabase, type TestDatabase } from '../test-support/database';
import { CONSENT_POLICY_VERSION } from '../../src/data/consentPolicy';
import { ConsentMissing, recordingPermission } from './consentGate';
import { recordAttempt } from './recordAttempt';
import { ensureGeneratorConcepts, serveNextProblem } from './serveProblem';

const DATABASE_URL = process.env.DATABASE_URL;
if (process.env.CI && !DATABASE_URL) {
  throw new Error('DATABASE_URL is unset in CI; this suite would skip while covering nothing.');
}
const describeWithDb = DATABASE_URL ? describe : describe.skip;

describeWithDb('the consent gate', () => {
  let harness: TestDatabase;
  let db: MySql2Database<typeof schema>;
  let guardianId: number;
  let child: number;

  const THIS_YEAR = new Date().getFullYear();

  beforeAll(async () => {
    harness = await createTestDatabase('consentgate');
    db = harness.db;
  }, 60_000);

  afterAll(async () => {
    await harness?.close();
  });

  beforeEach(async () => {
    await harness.reset();
    await ensureGeneratorConcepts(db);

    await db.insert(schema.users).values({ email: 'sarah@example.test', role: 'parent' });
    const [sarah] = await db
      .select()
      .from(schema.users)
      .where(eq(schema.users.email, 'sarah@example.test'));
    guardianId = sarah.id;

    // Certainly under 13: born eight years ago.
    await db
      .insert(schema.learners)
      .values({ guardianId, displayName: 'Maya', birthYear: THIS_YEAR - 8 });
    const [learner] = await db
      .select()
      .from(schema.learners)
      .where(eq(schema.learners.guardianId, guardianId));
    child = learner.id;
  }, 60_000);

  const grant = (policyVersion: string = CONSENT_POLICY_VERSION) =>
    db.insert(schema.consentEvents).values({
      learnerId: child,
      grantedByUserId: guardianId,
      decision: 'granted',
      method: 'email_verified_name_attested',
      policyVersion,
      policySha256: 'x'.repeat(64),
      attestedName: 'Sarah Example',
      verifiedEmail: 'sarah@example.test',
    });

  const withdraw = () =>
    db.insert(schema.consentEvents).values({
      learnerId: child,
      grantedByUserId: guardianId,
      decision: 'withdrawn',
      method: 'email_verified_name_attested',
      policyVersion: CONSENT_POLICY_VERSION,
      policySha256: 'x'.repeat(64),
      attestedName: 'Sarah Example',
      verifiedEmail: 'sarah@example.test',
    });

  describe('reading the ledger', () => {
    it('refuses a child with no consent recorded', async () => {
      const permission = await recordingPermission(db, child);
      expect(permission.requiresConsent).toBe(true);
      expect(permission.mayRecord).toBe(false);
    });

    it('permits once consent is granted', async () => {
      await grant();
      expect((await recordingPermission(db, child)).mayRecord).toBe(true);
    });

    it('refuses again after withdrawal', async () => {
      await grant();
      await withdraw();
      expect((await recordingPermission(db, child)).mayRecord).toBe(false);
    });

    it('refuses consent given under an older policy version', async () => {
      await grant('1900-01-01');
      const permission = await recordingPermission(db, child);
      expect(permission.mayRecord).toBe(false);
      // Collapsed, so the session is not told a parent's history.
      expect(permission.status).toBe('none');
    });

    it('reads the same precedence as the family view', async () => {
      // Not a reimplementation: both call `statusOf`. This pins that they agree,
      // because two answers to one question is the defect this graft removed.
      await grant();
      await withdraw();
      expect((await recordingPermission(db, child)).mayRecord).toBe(false);
    });

    it('refuses a learner that does not exist', async () => {
      expect((await recordingPermission(db, 999_999)).mayRecord).toBe(false);
    });
  });

  describe('an older learner', () => {
    it('is recorded without consent on file', async () => {
      await db
        .insert(schema.learners)
        .values({ guardianId, displayName: 'Noah', birthYear: THIS_YEAR - 16 });
      const [noah] = await db
        .select()
        .from(schema.learners)
        .where(eq(schema.learners.displayName, 'Noah'));

      const permission = await recordingPermission(db, noah.id);
      expect(permission.requiresConsent).toBe(false);
      expect(permission.mayRecord).toBe(true);
    });
  });

  describe('the writer', () => {
    const attemptsForChild = () =>
      db.select().from(schema.attempts).where(eq(schema.attempts.learnerId, child));

    async function anAttempt() {
      const [learner] = await db.select().from(schema.learners).where(eq(schema.learners.id, child));
      const served = await serveNextProblem(db, learner);
      return served.problemId;
    }

    it('still records for a consented child', async () => {
      /*
       * The control, and it earns its place: without it the refusals below
       * could be any failure at all. A broken fixture reads exactly like a
       * working gate.
       */
      await grant();
      const problemId = await anAttempt();
      await recordAttempt(db, { learnerId: child, problemId, submittedAnswer: '1' });

      expect(await attemptsForChild()).toHaveLength(1);
    });

    it('refuses, and writes nothing, when there is no consent', async () => {
      const problemId = await anAttempt();

      await expect(
        recordAttempt(db, { learnerId: child, problemId, submittedAnswer: '1' }),
      ).rejects.toThrow(ConsentMissing);

      // The half that matters. A refusal that still left a row would be worse
      // than no gate, because it would look enforced.
      expect(await attemptsForChild()).toHaveLength(0);
    });

    it('refuses after consent is withdrawn, having recorded before', async () => {
      await grant();
      const first = await anAttempt();
      await recordAttempt(db, { learnerId: child, problemId: first, submittedAnswer: '1' });
      expect(await attemptsForChild()).toHaveLength(1);

      await withdraw();
      const second = await anAttempt();
      await expect(
        recordAttempt(db, { learnerId: child, problemId: second, submittedAnswer: '1' }),
      ).rejects.toThrow(ConsentMissing);

      /*
       * The earlier attempt stays. Withdrawal stops collection from that point;
       * it is not a deletion request, and silently erasing history on withdrawal
       * would be a different feature with different consequences — one a parent
       * should be told about rather than surprised by.
       */
      expect(await attemptsForChild()).toHaveLength(1);
    });

    it('refuses a queued attempt replayed from the offline queue', async () => {
      /*
       * The path a client cannot be trusted to guard. An attempt queued before
       * consent was withdrawn arrives later carrying a `clientId`, and the
       * reconciler's whole job is to deliver it. The gate has to hold there
       * too, or the queue becomes the way around it.
       */
      const problemId = await anAttempt();
      await expect(
        recordAttempt(db, {
          learnerId: child,
          problemId,
          submittedAnswer: '1',
          wasOffline: true,
          clientId: 'queued-item-0000001',
        }),
      ).rejects.toThrow(ConsentMissing);

      expect(await attemptsForChild()).toHaveLength(0);
    });

    it('records for an older learner with no consent on file', async () => {
      // The gate is a rule about children, and must not become a rule about
      // everybody the moment it is switched on.
      await db
        .insert(schema.learners)
        .values({ guardianId, displayName: 'Noah', birthYear: THIS_YEAR - 16 });
      const [noah] = await db
        .select()
        .from(schema.learners)
        .where(eq(schema.learners.displayName, 'Noah'));

      const served = await serveNextProblem(db, noah);
      await recordAttempt(db, {
        learnerId: noah.id,
        problemId: served.problemId,
        submittedAnswer: '1',
      });

      const rows = await db
        .select()
        .from(schema.attempts)
        .where(eq(schema.attempts.learnerId, noah.id));
      expect(rows).toHaveLength(1);
    });
  });
});
