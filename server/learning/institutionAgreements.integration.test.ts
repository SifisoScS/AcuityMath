// @vitest-environment node

/**
 * A district agreeing on behalf of children, and what that has to cost.
 *
 * The two assertions this suite exists for are a pair. **The pupil C3d left
 * blocked can now practise** — which is what makes the gate a gate rather than a
 * wall. And **ending the agreement stops them again**, which is what makes the
 * agreement an agreement rather than a formality. Either one alone proves
 * nothing: a gate that never opens and a gate that never closes are both
 * useless, and they look identical from one side.
 */

import { eq } from 'drizzle-orm';
import type { MySql2Database } from 'drizzle-orm/mysql2';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import * as schema from '../../drizzle/schema';
import { createTestDatabase, type TestDatabase } from '../test-support/database';
import { createInstitution } from './institutions';
import { addMember } from './membership';
import { createDistrictLearner } from './districtLearners';
import {
  activeAgreement,
  agreementHistory,
  currentAgreementHash,
  NotAuthorised,
  signAgreement,
  StaleAgreement,
  withdrawAgreement,
} from './institutionAgreements';
import { consentStatusFor, NoAgreement, recordInstitutionalConsent } from './consent';
import { recordingPermission } from './consentGate';
import { CONSENT_POLICY_VERSION } from '../../src/data/consentPolicy';
import {
  INSTITUTIONAL_AGREEMENT_TEXT,
  INSTITUTIONAL_AGREEMENT_VERSION,
} from '../../src/data/institutionalAgreement';

const DATABASE_URL = process.env.DATABASE_URL;
if (process.env.CI && !DATABASE_URL) {
  throw new Error('DATABASE_URL is unset in CI; this suite would skip while covering nothing.');
}
const describeWithDb = DATABASE_URL ? describe : describe.skip;

describeWithDb('a district’s agreement', () => {
  let harness: TestDatabase;
  let db: MySql2Database<typeof schema>;
  let lincoln: { id: number };
  let riverside: { id: number };
  let head: { userId: number };

  beforeAll(async () => {
    harness = await createTestDatabase('agreements');
    db = harness.db;
  }, 60_000);

  afterAll(async () => {
    await harness?.close();
  });

  beforeEach(async () => {
    await harness.reset();
    lincoln = await createInstitution(db, 'Lincoln Unified');
    riverside = await createInstitution(db, 'Riverside Unified');
    head = await addMember(db, lincoln.id, 'head@lincoln.test', 'institution_admin');
  });

  const sign = (overrides: Record<string, unknown> = {}, now?: Date) =>
    signAgreement(
      db,
      {
        institutionId: lincoln.id,
        signedByUserId: head.userId,
        signatoryName: 'Grace Hopper',
        signatoryTitle: 'Head of School',
        agreementVersion: INSTITUTIONAL_AGREEMENT_VERSION,
        ...overrides,
      },
      now,
    );

  const pupil = (name = 'Ada') =>
    createDistrictLearner(db, { institutionId: lincoln.id, displayName: name, birthYear: 2016 });

  describe('signing', () => {
    it('records who signed, what they signed, and a hash of it', async () => {
      const agreement = await sign();

      expect(agreement.signatoryName).toBe('Grace Hopper');
      expect(agreement.signatoryTitle).toBe('Head of School');
      expect(agreement.signatoryEmail).toBe('head@lincoln.test');
      expect(agreement.agreementVersion).toBe(INSTITUTIONAL_AGREEMENT_VERSION);
      expect(agreement.agreementSha256).toBe(currentAgreementHash());
    });

    it('computes the hash from the server’s own copy', async () => {
      /*
       * Never accepted from a caller. A client that supplies the hash can claim
       * agreement to text that was never displayed, which makes the column worse
       * than useless — it would look like evidence.
       */
      const { createHash } = await import('node:crypto');
      const expected = createHash('sha256')
        .update(INSTITUTIONAL_AGREEMENT_TEXT, 'utf8')
        .digest('hex');

      expect((await sign()).agreementSha256).toBe(expected);
    });

    it('refuses a version that is not the current one', async () => {
      /*
       * Silently upgrading would record agreement to a document the signatory
       * never read — which is the failure the version column exists to catch.
       */
      await expect(sign({ agreementVersion: '2020-01-v1' })).rejects.toThrow(StaleAgreement);
    });

    it('refuses an administrator of another district', async () => {
      const other = await addMember(db, riverside.id, 'head@riverside.test', 'institution_admin');
      await expect(sign({ signedByUserId: other.userId })).rejects.toThrow(NotAuthorised);
    });

    it('refuses a teacher', async () => {
      const teacher = await addMember(db, lincoln.id, 'teacher@lincoln.test', 'teacher');
      await expect(sign({ signedByUserId: teacher.userId })).rejects.toThrow(NotAuthorised);
    });

    it('refuses a platform administrator', async () => {
      /*
       * The one refusal that looks wrong and is not. `admin` is the global
       * bypass everywhere else, and that is right for *reading*. Signing asserts
       * authority to consent on behalf of other people's children, and nobody at
       * this company has it — a row saying we agreed on a school's behalf would
       * be a false record of who decided.
       */
      const [platformAdmin] = await db
        .insert(schema.users)
        .values({ email: 'ops@acuitymath.test', role: 'admin' })
        .$returningId();

      await expect(sign({ signedByUserId: platformAdmin.id })).rejects.toThrow(NotAuthorised);
    });

    it('refuses a blank signatory role', async () => {
      // "Who were they to agree for a school?" is the first question anybody
      // reviewing this will ask, and a blank answer cannot be given later.
      await expect(sign({ signatoryTitle: '   ' })).rejects.toThrow();
    });
  });

  describe('being in force', () => {
    it('is active once signed', async () => {
      await sign();
      expect(await activeAgreement(db, lincoln.id)).not.toBeNull();
    });

    it('is active immediately, not a fraction of a second later', async () => {
      /*
       * **MySQL rounds a sub-second value into a `TIMESTAMP` rather than
       * truncating it.** Signing at 12:00:00.800 stored 12:00:01 — in the future
       * — so the agreement was refused for the next two hundred milliseconds,
       * and a district that signed and immediately consented was told it had no
       * agreement.
       *
       * Fixed by flooring before the write, which errs early rather than late.
       */
      const signedAt = new Date('2026-05-01T12:00:00.800Z');
      const agreement = await sign({}, signedAt);

      expect(agreement.signedAt.getTime()).toBeLessThanOrEqual(signedAt.getTime());
      expect(await activeAgreement(db, lincoln.id, signedAt)).not.toBeNull();
    });

    it('is not active after it expires', async () => {
      const expiresAt = new Date('2026-06-30T00:00:00Z');
      // Signed before the moments queried below, because an agreement is not in
      // force before it was signed.
      await sign({ expiresAt }, new Date('2026-01-05T00:00:00Z'));

      expect(await activeAgreement(db, lincoln.id, new Date('2026-06-29T00:00:00Z'))).not.toBeNull();
      expect(await activeAgreement(db, lincoln.id, new Date('2026-07-01T00:00:00Z'))).toBeNull();
    });

    it('is not active after it is withdrawn', async () => {
      const agreement = await sign();
      await withdrawAgreement(db, agreement.id);

      expect(await activeAgreement(db, lincoln.id)).toBeNull();
    });

    it('keeps a withdrawn agreement in the history', async () => {
      /*
       * Nothing is deleted. Rewriting history to say a district never agreed
       * would destroy the only evidence that recording was once permitted.
       */
      const agreement = await sign();
      await withdrawAgreement(db, agreement.id);

      const history = await agreementHistory(db, lincoln.id);
      expect(history).toHaveLength(1);
      expect(history[0].id).toBe(agreement.id);
      expect(history[0].withdrawnAt).not.toBeNull();
    });

    it('is replaced by a newer one after the first is withdrawn', async () => {
      const first = await sign({}, new Date('2026-01-01T00:00:00Z'));
      await withdrawAgreement(db, first.id, new Date('2026-02-01T00:00:00Z'));
      const second = await sign({}, new Date('2026-03-01T00:00:00Z'));

      const active = await activeAgreement(db, lincoln.id, new Date('2026-04-01T00:00:00Z'));
      expect(active?.id).toBe(second.id);
    });

    it('belongs to its own district and not the one next door', async () => {
      await sign();
      expect(await activeAgreement(db, riverside.id)).toBeNull();
    });
  });

  describe('consent resting on it', () => {
    it('lets the pupil C3d left blocked practise', async () => {
      /*
       * **Half of the pair this suite exists for.** The same child, the same
       * gate, and the only thing that changed is that a district agreed.
       */
      const child = await pupil();
      expect((await recordingPermission(db, child.id)).mayRecord).toBe(false);

      await sign();
      await recordInstitutionalConsent(db, {
        institutionId: lincoln.id,
        decision: 'granted',
        policyVersion: CONSENT_POLICY_VERSION,
      });

      expect(await consentStatusFor(db, child.id)).toBe('granted');
      expect((await recordingPermission(db, child.id)).mayRecord).toBe(true);
    });

    it('stops them again when the agreement ends', async () => {
      /*
       * **The other half, and the one that makes the agreement mean something.**
       * The consent row is untouched — the district's permission to rely on it
       * is what ended, and the gate re-reads that rather than trusting the row.
       */
      const child = await pupil();
      const agreement = await sign();
      await recordInstitutionalConsent(db, {
        institutionId: lincoln.id,
        decision: 'granted',
        policyVersion: CONSENT_POLICY_VERSION,
      });
      expect((await recordingPermission(db, child.id)).mayRecord).toBe(true);

      await withdrawAgreement(db, agreement.id);

      expect(await consentStatusFor(db, child.id)).toBe('lapsed');
      expect((await recordingPermission(db, child.id)).mayRecord).toBe(false);

      const [row] = await db
        .select()
        .from(schema.consentEvents)
        .where(eq(schema.consentEvents.learnerId, child.id));
      expect(row.decision).toBe('granted');
    });

    it('stops them when the agreement expires, without anybody acting', async () => {
      const child = await pupil();
      await sign({ expiresAt: new Date('2026-06-30T00:00:00Z') }, new Date('2026-01-05T00:00:00Z'));
      await recordInstitutionalConsent(
        db,
        { institutionId: lincoln.id, decision: 'granted', policyVersion: CONSENT_POLICY_VERSION },
        new Date('2026-01-10T00:00:00Z'),
      );

      const permission = await recordingPermission(
        db,
        child.id,
        new Date('2026-07-01T00:00:00Z'),
      );
      expect(permission.mayRecord).toBe(false);
    });

    it('cannot be recorded with no agreement at all', async () => {
      /*
       * The refusal C3e exists for. Before it, `institutional_agreement` was a
       * string a caller wrote, and the children it covered were covered by
       * nothing.
       */
      await pupil();
      await expect(
        recordInstitutionalConsent(db, {
          institutionId: lincoln.id,
          decision: 'granted',
          policyVersion: CONSENT_POLICY_VERSION,
        }),
      ).rejects.toThrow(NoAgreement);
    });

    it('cannot be recorded once the agreement is withdrawn', async () => {
      const agreement = await sign();
      await pupil();
      await withdrawAgreement(db, agreement.id);

      await expect(
        recordInstitutionalConsent(db, {
          institutionId: lincoln.id,
          decision: 'granted',
          policyVersion: CONSENT_POLICY_VERSION,
        }),
      ).rejects.toThrow(NoAgreement);
    });

    it('names the administrator who signed, not whoever called', async () => {
      const child = await pupil();
      await sign();
      await recordInstitutionalConsent(db, {
        institutionId: lincoln.id,
        decision: 'granted',
        policyVersion: CONSENT_POLICY_VERSION,
      });

      const [row] = await db
        .select()
        .from(schema.consentEvents)
        .where(eq(schema.consentEvents.learnerId, child.id));

      expect(row.grantedByUserId).toBe(head.userId);
      expect(row.attestedName).toBe('Grace Hopper');
      expect(row.verifiedEmail).toBe('head@lincoln.test');
      expect(row.method).toBe('institutional_agreement');
      // Null and truthfully so: no magic link proved anything here.
      expect(row.emailVerifiedAt).toBeNull();
    });
  });

  describe('whose children a district may consent for', () => {
    it('covers only the pupils it owns', async () => {
      const ours = await pupil('Ours');
      const [parent] = await db
        .insert(schema.users)
        .values({ email: 'parent@home.test', role: 'parent' })
        .$returningId();
      const [theirs] = await db
        .insert(schema.learners)
        .values({ guardianId: parent.id, displayName: 'Theirs', birthYear: 2016 })
        .$returningId();

      await sign();
      const result = await recordInstitutionalConsent(db, {
        institutionId: lincoln.id,
        decision: 'granted',
        policyVersion: CONSENT_POLICY_VERSION,
      });

      expect(result.learnerIds).toEqual([ours.id]);
      expect(await consentStatusFor(db, theirs.id)).toBe('none');
    });

    it('refuses a named child it does not own, rather than skipping them', async () => {
      /*
       * Silently doing less than you were asked is how somebody ends up
       * believing a child is covered.
       */
      const [parent] = await db
        .insert(schema.users)
        .values({ email: 'parent@home.test', role: 'parent' })
        .$returningId();
      const [theirs] = await db
        .insert(schema.learners)
        .values({ guardianId: parent.id, displayName: 'Theirs', birthYear: 2016 })
        .$returningId();

      await sign();
      await expect(
        recordInstitutionalConsent(db, {
          institutionId: lincoln.id,
          decision: 'granted',
          policyVersion: CONSENT_POLICY_VERSION,
          learnerIds: [theirs.id],
        }),
      ).rejects.toThrow(/does not own/);
    });

    it('consents for one named pupil without touching the rest', async () => {
      // The shape the LTI path needs: a pupil arrives, and consent is recorded
      // for them rather than for a roll nobody has seen.
      const first = await pupil('First');
      const second = await pupil('Second');
      await sign();

      await recordInstitutionalConsent(db, {
        institutionId: lincoln.id,
        decision: 'granted',
        policyVersion: CONSENT_POLICY_VERSION,
        learnerIds: [first.id],
      });

      expect(await consentStatusFor(db, first.id)).toBe('granted');
      expect(await consentStatusFor(db, second.id)).toBe('none');
    });
  });

  describe('the method and its evidence', () => {
    it('cannot claim an institutional agreement while naming none', async () => {
      /*
       * Enforced by the database. Without it the method is a string a caller
       * writes, which is the state this whole change exists to end.
       */
      const child = await pupil();
      await expect(
        db.insert(schema.consentEvents).values({
          learnerId: child.id,
          grantedByUserId: head.userId,
          decision: 'granted',
          method: 'institutional_agreement',
          policyVersion: CONSENT_POLICY_VERSION,
          policySha256: 'x'.repeat(64),
          attestedName: 'Nobody',
          verifiedEmail: 'nobody@lincoln.test',
        }),
      ).rejects.toThrow();
    });

    it('cannot name an agreement while claiming a parent attested to it', async () => {
      // The reverse direction. A row like this would misdescribe who consented.
      const child = await pupil();
      const agreement = await sign();

      await expect(
        db.insert(schema.consentEvents).values({
          learnerId: child.id,
          grantedByUserId: head.userId,
          decision: 'granted',
          method: 'email_verified_name_attested',
          policyVersion: CONSENT_POLICY_VERSION,
          policySha256: 'x'.repeat(64),
          attestedName: 'A Parent',
          verifiedEmail: 'parent@home.test',
          agreementId: agreement.id,
        }),
      ).rejects.toThrow();
    });
  });
});
