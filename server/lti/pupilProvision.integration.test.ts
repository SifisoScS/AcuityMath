// @vitest-environment node

/**
 * A child arriving from an LMS, and everything that has to be true first.
 *
 * The assertion this suite is built around is that **a pupil is created and
 * consented in the same call, or not created at all.** A district pupil holding
 * a record with no consent behind it is the worst of both outcomes: the product
 * is storing data about a child while refusing to let them use it, and every
 * later reader has to guess whether that state was deliberate.
 *
 * Nothing here signs anybody in. A learner session is a new kind of principal
 * and is C3g.
 */

import { eq } from 'drizzle-orm';
import type { MySql2Database } from 'drizzle-orm/mysql2';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import * as schema from '../../drizzle/schema';
import { createTestDatabase, type TestDatabase } from '../test-support/database';
import { createInstitution } from '../learning/institutions';
import { addMember } from '../learning/membership';
import { signAgreement, withdrawAgreement } from '../learning/institutionAgreements';
import { consentStatusFor } from '../learning/consent';
import { recordingPermission } from '../learning/consentGate';
import { INSTITUTIONAL_AGREEMENT_VERSION } from '../../src/data/institutionalAgreement';
import type { LaunchContext } from './idToken';
import { CannotProvision, provisionPupil, provisionStaff } from './provision';

const DATABASE_URL = process.env.DATABASE_URL;
if (process.env.CI && !DATABASE_URL) {
  throw new Error('DATABASE_URL is unset in CI; this suite would skip while covering nothing.');
}
const describeWithDb = DATABASE_URL ? describe : describe.skip;

describeWithDb('a pupil arriving from an LMS', () => {
  let harness: TestDatabase;
  let db: MySql2Database<typeof schema>;
  let lincoln: { id: number };
  let riverside: { id: number };
  let head: { userId: number };
  let platformId: number;

  beforeAll(async () => {
    harness = await createTestDatabase('ltipupil');
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

    await db.insert(schema.ltiPlatforms).values({
      issuer: 'https://platform.test',
      clientId: 'client-1',
      name: 'Test LMS',
      authLoginUrl: 'https://platform.test/auth',
      authTokenUrl: 'https://platform.test/token',
      keysetUrl: 'https://platform.test/jwks',
    });
    const [platform] = await db
      .select({ id: schema.ltiPlatforms.id })
      .from(schema.ltiPlatforms)
      .limit(1);
    platformId = platform.id;
  });

  const agree = (now?: Date) =>
    signAgreement(
      db,
      {
        institutionId: lincoln.id,
        signedByUserId: head.userId,
        signatoryName: 'Grace Hopper',
        signatoryTitle: 'Head of School',
        agreementVersion: INSTITUTIONAL_AGREEMENT_VERSION,
      },
      now,
    );

  function launch(overrides: Partial<LaunchContext> = {}): LaunchContext {
    return {
      platformId,
      issuer: 'https://platform.test',
      clientId: 'client-1',
      deploymentId: 'dep-1',
      institutionId: lincoln.id,
      subject: 'sub-pupil-1',
      name: 'Ada Lovelace',
      email: null,
      roles: ['http://purl.imsglobal.org/vocab/lis/v2/membership#Learner'],
      isStaff: false,
      contextId: 'ctx-1',
      contextTitle: 'Year 4 Maths',
      resourceLinkId: 'link-1',
      custom: { grade_level: '3' },
      targetLinkUri: 'https://acuitymath.test/practice',
      membershipsUrl: null,
      ags: null,
      claims: {},
      ...overrides,
    };
  }

  async function reasonFor(promise: Promise<unknown>): Promise<string> {
    try {
      await promise;
      return 'provisioned';
    } catch (error) {
      if (error instanceof CannotProvision) return error.reason;
      throw error;
    }
  }

  describe('the first launch', () => {
    it('creates the child and consents for them in one act', async () => {
      /*
       * **The assertion this suite exists for.** A record without consent is a
       * child the product holds data about and will not serve.
       */
      await agree();
      const pupil = await provisionPupil(db, launch());

      const [learner] = await db
        .select()
        .from(schema.learners)
        .where(eq(schema.learners.id, pupil.learnerId));

      expect(pupil.isNew).toBe(true);
      expect(learner.institutionId).toBe(lincoln.id);
      expect(learner.guardianId).toBeNull();
      expect(learner.displayName).toBe('Ada Lovelace');
      expect(await consentStatusFor(db, pupil.learnerId)).toBe('granted');
      expect((await recordingPermission(db, pupil.learnerId)).mayRecord).toBe(true);
    });

    it('consents for this child and no other', async () => {
      // A launch is one pupil arriving, not a roll nobody has seen.
      await agree();
      const first = await provisionPupil(db, launch());
      const second = await provisionPupil(db, launch({ subject: 'sub-pupil-2' }));

      const rows = await db
        .select()
        .from(schema.consentEvents)
        .where(eq(schema.consentEvents.learnerId, first.learnerId));
      expect(rows).toHaveLength(1);
      expect(await consentStatusFor(db, second.learnerId)).toBe('granted');
    });

    it('names the agreement the consent rests on', async () => {
      const agreement = await agree();
      const pupil = await provisionPupil(db, launch());

      const [row] = await db
        .select()
        .from(schema.consentEvents)
        .where(eq(schema.consentEvents.learnerId, pupil.learnerId));

      expect(row.method).toBe('institutional_agreement');
      expect(row.agreementId).toBe(agreement.id);
    });

    it('accepts a district that sends no name', async () => {
      // A district withholding personal data is a privacy setting working.
      await agree();
      const pupil = await provisionPupil(db, launch({ name: null }));

      const [learner] = await db
        .select()
        .from(schema.learners)
        .where(eq(schema.learners.id, pupil.learnerId));
      expect(learner.displayName).toBe('Pupil');
    });
  });

  describe('without an agreement', () => {
    it('creates nothing at all', async () => {
      /*
       * The agreement is checked before anything is written. Both orders refuse
       * the launch; only this one avoids leaving a child's record in a district
       * that never agreed to hold one.
       */
      expect(await reasonFor(provisionPupil(db, launch()))).toBe('no_agreement');

      expect(await db.select().from(schema.learners)).toHaveLength(0);
      expect(await db.select().from(schema.ltiIdentities)).toHaveLength(0);
      expect(await db.select().from(schema.consentEvents)).toHaveLength(0);
    });

    it('creates nothing once the agreement has been withdrawn', async () => {
      const agreement = await agree();
      await withdrawAgreement(db, agreement.id);

      expect(await reasonFor(provisionPupil(db, launch()))).toBe('no_agreement');
      expect(await db.select().from(schema.learners)).toHaveLength(0);
    });

    it('stops an already-provisioned pupil practising when it ends', async () => {
      /*
       * The link survives, the record survives, and the permission does not.
       * Re-checked at read time, which is what C3e built.
       */
      const agreement = await agree();
      const pupil = await provisionPupil(db, launch());
      expect((await recordingPermission(db, pupil.learnerId)).mayRecord).toBe(true);

      await withdrawAgreement(db, agreement.id);

      expect(await consentStatusFor(db, pupil.learnerId)).toBe('lapsed');
      expect((await recordingPermission(db, pupil.learnerId)).mayRecord).toBe(false);
    });
  });

  describe('without an age', () => {
    it('creates nothing, and says what to configure', async () => {
      /*
       * No LTI message carries a birth date. The alternative to refusing is
       * writing a made-up year into a child's record — a false fact, stored, and
       * indistinguishable later from one somebody actually knew.
       */
      await agree();
      const reason = await reasonFor(provisionPupil(db, launch({ custom: {} })));

      expect(reason).toBe('no_age');
      expect(await db.select().from(schema.learners)).toHaveLength(0);
    });

    it('treats an unusable value as no value', async () => {
      // `grade_level = "fourth"` is a misconfiguration, and the administrator
      // needs the sentence that says what to write either way.
      await agree();
      expect(await reasonFor(provisionPupil(db, launch({ custom: { grade_level: 'fourth' } })))).toBe(
        'no_age',
      );
    });

    it('never writes a NaN birth year', async () => {
      await agree();
      await reasonFor(provisionPupil(db, launch({ custom: { birth_year: '2O16' } })));
      expect(await db.select().from(schema.learners)).toHaveLength(0);
    });
  });

  describe('the age it does work out', () => {
    it('prefers an explicit birth year over a grade', async () => {
      await agree();
      const pupil = await provisionPupil(
        db,
        launch({ custom: { birth_year: '2015', grade_level: '1' } }),
      );

      const [learner] = await db
        .select()
        .from(schema.learners)
        .where(eq(schema.learners.id, pupil.learnerId));
      expect(learner.birthYear).toBe(2015);
    });

    it('reads a grade as the older end of its range', async () => {
      /*
       * Deliberately the top of the band. Guessing the other way pushes a
       * ten-year-old's content down to seven, which reads to a child as the
       * product thinking they are stupid — and consent does not depend on this,
       * because the district's agreement covers them at any age.
       */
      await agree();
      const pupil = await provisionPupil(db, launch({ custom: { grade_level: '4' } }));

      const [learner] = await db
        .select()
        .from(schema.learners)
        .where(eq(schema.learners.id, pupil.learnerId));
      expect(new Date().getFullYear() - learner.birthYear).toBe(10);
    });
  });

  describe('the second launch', () => {
    it('is the same child', async () => {
      await agree();
      const first = await provisionPupil(db, launch());
      const second = await provisionPupil(db, launch());

      expect(second.learnerId).toBe(first.learnerId);
      expect(second.isNew).toBe(false);
      expect(await db.select().from(schema.learners)).toHaveLength(1);
      expect(await db.select().from(schema.consentEvents)).toHaveLength(1);
    });

    it('is refused if their record moved to another district', async () => {
      await agree();
      const pupil = await provisionPupil(db, launch());
      await db
        .update(schema.learners)
        .set({ institutionId: riverside.id })
        .where(eq(schema.learners.id, pupil.learnerId));

      expect(await reasonFor(provisionPupil(db, launch()))).toBe('moved');
    });

    it('is refused if their records were removed', async () => {
      /*
       * Archiving is somebody asking for a child's records to be deleted.
       * Restoring them because the child clicked a link would make the deletion
       * a suggestion.
       */
      await agree();
      const pupil = await provisionPupil(db, launch());
      await db
        .update(schema.learners)
        .set({ archivedAt: new Date() })
        .where(eq(schema.learners.id, pupil.learnerId));

      expect(await reasonFor(provisionPupil(db, launch()))).toBe('archived');
      expect(await db.select().from(schema.learners)).toHaveLength(1);
    });
  });

  describe('one subject is one kind of person', () => {
    it('will not turn a pupil into staff', async () => {
      /*
       * A pupil made a teaching assistant, or a platform sending different roles
       * from a different course. Falling through to the create path would mint
       * an adult account for a child.
       */
      await agree();
      await provisionPupil(db, launch());

      const reason = await reasonFor(
        provisionStaff(db, launch({ isStaff: true, email: 'ada@lincoln.test' })),
      );

      expect(reason).toBe('is_a_pupil');
      expect(await db.select().from(schema.users)).toHaveLength(1); // the head, only
    });

    it('will not turn staff into a pupil', async () => {
      await agree();
      await provisionStaff(
        db,
        launch({ isStaff: true, subject: 'sub-teacher-1', email: 'teacher@lincoln.test' }),
      );

      const reason = await reasonFor(provisionPupil(db, launch({ subject: 'sub-teacher-1' })));

      expect(reason).toBe('is_staff_account');
      expect(await db.select().from(schema.learners)).toHaveLength(0);
    });

    it('refuses a staff launch sent to the pupil path', async () => {
      await agree();
      expect(await reasonFor(provisionPupil(db, launch({ isStaff: true })))).toBe('is_staff');
    });
  });

  describe('the identity row', () => {
    it('names a child and never an account', async () => {
      await agree();
      const pupil = await provisionPupil(db, launch());

      const [identity] = await db.select().from(schema.ltiIdentities);
      expect(identity.learnerId).toBe(pupil.learnerId);
      expect(identity.userId).toBeNull();
    });

    it('cannot be both at once', async () => {
      // Enforced by the database. One `sub` is one person, and an identity that
      // is both would let the same launch be entitled to two different things.
      await agree();
      const pupil = await provisionPupil(db, launch());

      await expect(
        db.insert(schema.ltiIdentities).values({
          platformId,
          subject: 'sub-confused',
          userId: head.userId,
          learnerId: pupil.learnerId,
        }),
      ).rejects.toThrow();
    });

    it('cannot be neither', async () => {
      await expect(
        db.insert(schema.ltiIdentities).values({ platformId, subject: 'sub-nobody' }),
      ).rejects.toThrow();
    });
  });
});
