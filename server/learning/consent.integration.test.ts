// @vitest-environment node

/**
 * The consent ledger.
 *
 * `consent_events` had a table from B1 and no writer. Consent went to
 * `data_store.json` against a hardcoded `'parent_sarah_1'`, so the application
 * told a parent their consent was recorded and it was not.
 *
 * Most of what follows is about what the server refuses to take from the client:
 * the policy hash, the guardian, the children, and the verification method. A
 * ledger whose contents the client can dictate looks like evidence and is not.
 */

import { eq } from 'drizzle-orm';
import { createHash } from 'crypto';
import type { MySql2Database } from 'drizzle-orm/mysql2';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import * as schema from '../../drizzle/schema';
import { CONSENT_POLICY_TEXT, CONSENT_POLICY_VERSION } from '../../src/data/consentPolicy';
import { issueElevation, ELEVATION_COOKIE } from '../auth/session';
import { appRouter } from '../trpc/routers';
import type { Context } from '../trpc';
import { createTestDatabase, type TestDatabase } from '../test-support/database';
import { currentPolicyHash } from './consent';

const DATABASE_URL = process.env.DATABASE_URL;
if (process.env.CI && !DATABASE_URL) {
  throw new Error('DATABASE_URL is unset in CI; this suite would skip while covering nothing.');
}
const describeWithDb = DATABASE_URL ? describe : describe.skip;

type Adult = { id: number; email: string; name: string | null; role: 'parent' };

describeWithDb('parental consent', () => {
  let harness: TestDatabase;
  let db: MySql2Database<typeof schema>;
  let sarah: Adult;
  let maya: number;
  let leo: number;

  beforeAll(async () => {
    harness = await createTestDatabase('consent');
    db = harness.db;
  }, 60_000);

  afterAll(async () => {
    await harness?.close();
  });

  beforeEach(async () => {
    await harness.reset();
    process.env.JWT_SECRET = 'a-test-secret-that-is-comfortably-long-enough-to-pass';

    await db.insert(schema.users).values({ email: 'sarah@example.test', role: 'parent' });
    const [row] = await db
      .select()
      .from(schema.users)
      .where(eq(schema.users.email, 'sarah@example.test'));
    sarah = { id: row.id, email: row.email, name: row.name, role: 'parent' };

    await db.insert(schema.learners).values([
      { guardianId: sarah.id, displayName: 'Maya', birthYear: 2016 },
      { guardianId: sarah.id, displayName: 'Leo', birthYear: 2019 },
    ]);
    const kids = await db
      .select()
      .from(schema.learners)
      .where(eq(schema.learners.guardianId, sarah.id));
    maya = kids.find(k => k.displayName === 'Maya')!.id;
    leo = kids.find(k => k.displayName === 'Leo')!.id;
  }, 60_000);

  const callerFor = (user: Adult | null, elevation?: string) =>
    appRouter.createCaller({
      db,
      user,
      headers: elevation ? { cookie: `${ELEVATION_COOKIE}=${elevation}` } : {},
      setCookie: () => {},
    } satisfies Context);

  const elevated = async () => callerFor(sarah, await issueElevation(sarah.id));

  const grant = (over: Record<string, unknown> = {}) => ({
    decision: 'granted' as const,
    attestedName: 'Sarah Jenkins',
    policyVersion: CONSENT_POLICY_VERSION,
    ...over,
  });

  const rows = () => db.select().from(schema.consentEvents);

  describe('recording a decision', () => {
    it('writes one row per child on the account', async () => {
      // The modal grants once for the household; the schema requires a learner.
      // Per-account rows could never be split later without inventing which
      // child was meant.
      const result = await (await elevated()).consent.record(grant());

      expect(result.learnerIds.sort()).toEqual([maya, leo].sort());
      expect((await rows()).map(r => r.learnerId).sort()).toEqual([maya, leo].sort());
    });

    it('records the guardian from the session, not from the input', async () => {
      // `CoppaConsentModal` used to pass `'parent_sarah_1'`. The input has no
      // field for it now, which is the point: the mistake is unrepresentable
      // rather than merely wrong.
      await (await elevated()).consent.record(grant());
      for (const row of await rows()) {
        expect(row.grantedByUserId).toBe(sarah.id);
      }
    });

    it('records the only method this product can perform', async () => {
      // The modal used to offer a dropdown including credit-card verification,
      // when nothing charges a card. The method describes what the operator did.
      await (await elevated()).consent.record(grant());
      for (const row of await rows()) {
        expect(row.method).toBe('email_verified_name_attested');
      }
    });

    it('records that no confirming second step was sent', async () => {
      // Explicitly, rather than by inference. It is the single fact separating
      // this from COPPA "email plus".
      await (await elevated()).consent.record(grant());
      expect((await rows()).every(r => r.secondStepSent === false)).toBe(true);
    });

    it('snapshots the email rather than joining to it', async () => {
      await (await elevated()).consent.record(grant());
      await db
        .update(schema.users)
        .set({ email: 'changed@example.test' })
        .where(eq(schema.users.id, sarah.id));

      // `users.email` can change; what this row says must not.
      expect((await rows())[0].verifiedEmail).toBe('sarah@example.test');
    });

    it('appends rather than updating', async () => {
      const caller = await elevated();
      await caller.consent.record(grant());
      await caller.consent.record(grant({ decision: 'withdrawn' }));

      const forMaya = (await rows()).filter(r => r.learnerId === maya);
      expect(forMaya.map(r => r.decision)).toEqual(['granted', 'withdrawn']);
    });

    it('writes nothing for an account with no children', async () => {
      await db.delete(schema.learners).where(eq(schema.learners.guardianId, sarah.id));
      const result = await (await elevated()).consent.record(grant());

      expect(result.learnerIds).toEqual([]);
      expect(await rows()).toHaveLength(0);
    });
  });

  describe('the policy', () => {
    it('hashes the server own copy of the text', async () => {
      const expected = createHash('sha256').update(CONSENT_POLICY_TEXT, 'utf8').digest('hex');
      await (await elevated()).consent.record(grant());

      expect((await rows())[0].policySha256).toBe(expected);
      expect(currentPolicyHash()).toBe(expected);
    });

    it('refuses a caller that tries to supply the hash', async () => {
      /*
       * There is no field to send one in, and `.strict()` makes that refusal
       * loud. Zod would otherwise strip the key — safe, since the server hashes
       * its own copy regardless, but silent: a caller sending `policySha256` is
       * either confused about where it comes from or checking whether it is
       * honoured, and both deserve an error rather than a success that quietly
       * did something else.
       */
      await expect(
        (await elevated()).consent.record({
          ...grant(),
          policySha256: 'f'.repeat(64),
        } as never),
      ).rejects.toThrow();

      expect(await rows()).toHaveLength(0);
    });

    it('would use its own hash even if one got through', async () => {
      /*
       * The property that actually protects the column, independent of the
       * input schema. A client that could set this could claim consent to text
       * that was never displayed — which would make the column look like
       * evidence while being the opposite of it.
       */
      await (await elevated()).consent.record(grant());
      const written = (await rows())[0].policySha256;

      expect(written).toBe(currentPolicyHash());
      expect(written).not.toBe('f'.repeat(64));
    });

    it('refuses a version that is no longer current', async () => {
      // Their tab has been open across a deploy: they agreed to something that
      // is not on screen any more.
      await expect(
        (await elevated()).consent.record(grant({ policyVersion: '2020-01-v0' })),
      ).rejects.toThrow(/out of date/i);

      expect(await rows()).toHaveLength(0);
    });

    it('serves the text it hashes', async () => {
      const policy = await callerFor(sarah).consent.policy();
      expect(policy.version).toBe(CONSENT_POLICY_VERSION);
      expect(policy.clauses.join('\n')).toBe(CONSENT_POLICY_TEXT);
    });

    it('explains the verification rather than offering a choice of it', async () => {
      const policy = await callerFor(sarah).consent.policy();
      expect(policy.verification).toMatch(/email address you signed in with/i);
      expect(policy.verification).toMatch(/do not send a second confirmation/i);
    });
  });

  describe('when the email was verified', () => {
    it('records the moment the magic link was consumed', async () => {
      // The link proves control at T; consent is recorded at T+X, and a gap of
      // weeks is ordinary. A record that cannot show the gap implies there
      // wasn't one.
      const consumedAt = new Date(Date.now() - 29 * 24 * 60 * 60 * 1000);
      await db.insert(schema.magicLinkTokens).values({
        email: sarah.email,
        tokenHash: 'a'.repeat(64),
        expiresAt: new Date(Date.now() + 60_000),
        consumedAt,
      });

      await (await elevated()).consent.record(grant());
      const recorded = (await rows())[0].emailVerifiedAt;
      expect(recorded).toBeTruthy();
      expect(Math.abs(recorded!.getTime() - consumedAt.getTime())).toBeLessThan(2_000);
    });

    it('ignores a link that was never consumed', async () => {
      // Issued and unused proves nothing about who controls the address.
      await db.insert(schema.magicLinkTokens).values({
        email: sarah.email,
        tokenHash: 'b'.repeat(64),
        expiresAt: new Date(Date.now() + 60_000),
      });

      await (await elevated()).consent.record(grant());
      expect((await rows())[0].emailVerifiedAt).toBeNull();
    });

    it('takes the most recent verification, not the first', async () => {
      /*
       * The load-bearing part. An account signs in repeatedly, so several
       * consumed links exist; the one that matters is the latest, because that
       * is when control of the address was last demonstrated. Picking the oldest
       * would understate the verification by months.
       */
      const older = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000);
      const newer = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000);
      await db.insert(schema.magicLinkTokens).values([
        { email: sarah.email, tokenHash: 'c'.repeat(64), expiresAt: new Date(), consumedAt: older },
        { email: sarah.email, tokenHash: 'd'.repeat(64), expiresAt: new Date(), consumedAt: newer },
      ]);

      await (await elevated()).consent.record(grant());
      const recorded = (await rows())[0].emailVerifiedAt!;
      expect(Math.abs(recorded.getTime() - newer.getTime())).toBeLessThan(2_000);
    });

    it('records null when there is no link at all', async () => {
      // True for the development sign-in bypass, which production builds refuse.
      await (await elevated()).consent.record(grant());
      expect((await rows())[0].emailVerifiedAt).toBeNull();
    });
  });

  describe('reading where things stand', () => {
    it('reports none for a child never consented for', async () => {
      const state = await (await elevated()).consent.forFamily();
      expect(state[String(maya)].status).toBe('none');
    });

    it('reports a child added after consent as uncovered', async () => {
      /*
       * The gap that would otherwise be silent. A parent consents, adds a child
       * next month, and that child has no consent — which the product has to be
       * able to see, or it is the empty ledger again at a smaller scale.
       */
      await (await elevated()).consent.record(grant());

      await db
        .insert(schema.learners)
        .values({ guardianId: sarah.id, displayName: 'Sophia', birthYear: 2020 });
      const [sophia] = await db
        .select()
        .from(schema.learners)
        .where(eq(schema.learners.displayName, 'Sophia'));

      const state = await (await elevated()).consent.forFamily();
      expect(state[String(sophia.id)].status).toBe('none');
      expect(state[String(maya)].status).toBe('granted');
    });

    it('reports granted under the current policy', async () => {
      await (await elevated()).consent.record(grant());
      const state = await (await elevated()).consent.forFamily();
      expect(state[String(maya)].status).toBe('granted');
      expect(state[String(maya)].attestedName).toBe('Sarah Jenkins');
    });

    it('reports superseded when the policy has moved on', async () => {
      await (await elevated()).consent.record(grant());
      await db
        .update(schema.consentEvents)
        .set({ policyVersion: 'an-older-version' })
        .where(eq(schema.consentEvents.learnerId, maya));

      const state = await (await elevated()).consent.forFamily();
      expect(state[String(maya)].status).toBe('superseded');
    });

    it('lets a withdrawal outrank policy freshness', async () => {
      /*
       * The precedence that a caller would otherwise have to invent. Consent
       * withdrawn under the *current* policy is withdrawn — not "current but
       * withdrawn". Once consent is gone, how fresh the disclosure was stops
       * mattering, and a UI combining the two flags could easily show the wrong
       * one.
       */
      const caller = await elevated();
      await caller.consent.record(grant());
      await caller.consent.record(grant({ decision: 'withdrawn' }));

      const state = await caller.consent.forFamily();
      expect(state[String(maya)].status).toBe('withdrawn');
    });

    it('reports withdrawn even under a superseded policy', async () => {
      const caller = await elevated();
      await caller.consent.record(grant());
      await caller.consent.record(grant({ decision: 'withdrawn' }));
      await db.update(schema.consentEvents).set({ policyVersion: 'an-older-version' });

      const state = await caller.consent.forFamily();
      expect(state[String(maya)].status).toBe('withdrawn');
    });
  });

  describe('who may record it', () => {
    it('refuses a signed-in parent who has not stepped up', async () => {
      await expect(callerFor(sarah).consent.record(grant())).rejects.toThrow(/STEP_UP_REQUIRED/);
      expect(await rows()).toHaveLength(0);
    });

    it('refuses a signed-out caller', async () => {
      await expect(callerFor(null).consent.record(grant())).rejects.toThrow();
    });

    it('refuses to read the family state without stepping up', async () => {
      await expect(callerFor(sarah).consent.forFamily()).rejects.toThrow(/STEP_UP_REQUIRED/);
    });

    it('never reaches another family children', async () => {
      await db.insert(schema.users).values({ email: 'other@example.test', role: 'parent' });
      const [other] = await db
        .select()
        .from(schema.users)
        .where(eq(schema.users.email, 'other@example.test'));
      await db
        .insert(schema.learners)
        .values({ guardianId: other.id, displayName: 'Outsider', birthYear: 2016 });

      await (await elevated()).consent.record(grant());

      const recorded = (await rows()).map(r => r.learnerId).sort();
      expect(recorded).toEqual([maya, leo].sort());
    });
  });
});
