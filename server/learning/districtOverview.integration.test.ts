// @vitest-environment node

/**
 * The district overview, against real rows.
 *
 * The component test asserts what a district administrator is *shown*; this
 * asserts what the server is willing to *tell* them. The two questions that
 * matter here are whose district they may see, and whether the numbers are
 * counted from the right place — a pupil count that quietly included the
 * families of a district's own staff would be a district reporting on children
 * it does not own.
 */

import { eq } from 'drizzle-orm';
import type { MySql2Database } from 'drizzle-orm/mysql2';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import * as schema from '../../drizzle/schema';
import { createTestDatabase, type TestDatabase } from '../test-support/database';
import { createInstitution, createSchool } from './institutions';
import { addMember } from './membership';
import { createDistrictLearner } from './districtLearners';
import { signAgreement, withdrawAgreement } from './institutionAgreements';
import { INSTITUTIONAL_AGREEMENT_VERSION } from '../../src/data/institutionalAgreement';
import { appRouter } from '../trpc/routers';
import type { Context } from '../trpc';
import type { AuthenticatedUser } from '../auth/session';

const DATABASE_URL = process.env.DATABASE_URL;
if (process.env.CI && !DATABASE_URL) {
  throw new Error('DATABASE_URL is unset in CI; this suite would skip while covering nothing.');
}
const describeWithDb = DATABASE_URL ? describe : describe.skip;

describeWithDb('what a district overview reports', () => {
  let harness: TestDatabase;
  let db: MySql2Database<typeof schema>;
  let lincoln: { id: number };
  let riverside: { id: number };
  let head: AuthenticatedUser;
  let otherHead: AuthenticatedUser;
  let teacher: AuthenticatedUser;

  beforeAll(async () => {
    harness = await createTestDatabase('districtoverview');
  }, 60_000);

  afterAll(async () => {
    await harness?.close();
  });

  const userFor = async (email: string): Promise<AuthenticatedUser> => {
    const [row] = await db.select().from(schema.users).where(eq(schema.users.email, email));
    return { id: row.id, email: row.email, name: row.name, role: row.role };
  };

  beforeEach(async () => {
    await harness.reset();
    db = harness.db;

    lincoln = await createInstitution(db, 'Lincoln Unified');
    riverside = await createInstitution(db, 'Riverside Unified');

    await addMember(db, lincoln.id, 'head@lincoln.test', 'institution_admin');
    await addMember(db, riverside.id, 'head@riverside.test', 'institution_admin');
    await addMember(db, lincoln.id, 'teacher@lincoln.test', 'teacher');

    head = await userFor('head@lincoln.test');
    otherHead = await userFor('head@riverside.test');
    teacher = await userFor('teacher@lincoln.test');
  });

  const as = (user: AuthenticatedUser | null) =>
    appRouter.createCaller({
      db,
      user,
      learnerSession: null,
      headers: {},
      setCookie: () => {},
    } satisfies Context);

  const agree = () =>
    signAgreement(db, {
      institutionId: lincoln.id,
      signedByUserId: head.id,
      signatoryName: 'Grace Hopper',
      signatoryTitle: 'Head of School',
      agreementVersion: INSTITUTIONAL_AGREEMENT_VERSION,
    });

  describe('the numbers', () => {
    it('counts the district’s own pupils', async () => {
      await createDistrictLearner(db, {
        institutionId: lincoln.id,
        displayName: 'Ada',
        birthYear: 2016,
      });

      const overview = await as(head).institutions.overview({ institutionId: lincoln.id });
      expect(overview.pupils).toBe(1);
      expect(overview.staff).toEqual({ administrators: 1, teachers: 1, total: 2 });
    });

    it('does not count the families of its own staff', async () => {
      /*
       * A teacher's own children, on a family account, are theirs. Counting them
       * would have the district report on children it does not own — the same
       * boundary `institutionReaches` draws, expressed as a number.
       */
      const [child] = await db
        .insert(schema.learners)
        .values({ guardianId: teacher.id, displayName: 'Their own child', birthYear: 2016 })
        .$returningId();
      expect(child.id).toBeGreaterThan(0);

      const overview = await as(head).institutions.overview({ institutionId: lincoln.id });
      expect(overview.pupils).toBe(0);
    });

    it('does not count a pupil whose records were removed', async () => {
      const learner = await createDistrictLearner(db, {
        institutionId: lincoln.id,
        displayName: 'Ada',
        birthYear: 2016,
      });
      await db
        .update(schema.learners)
        .set({ archivedAt: new Date(), archivedReason: 'requested' })
        .where(eq(schema.learners.id, learner.id));

      expect((await as(head).institutions.overview({ institutionId: lincoln.id })).pupils).toBe(0);
    });

    it('lists the campuses that exist, and no others', async () => {
      await createSchool(db, lincoln.id, 'Lincoln Elementary');
      await createSchool(db, riverside.id, 'Riverside High');

      const overview = await as(head).institutions.overview({ institutionId: lincoln.id });
      expect(overview.campuses.map(campus => campus.name)).toEqual(['Lincoln Elementary']);
    });
  });

  describe('the agreement', () => {
    it('is reported as in force, with who signed it', async () => {
      await agree();
      const overview = await as(head).institutions.overview({ institutionId: lincoln.id });

      expect(overview.agreement).toMatchObject({
        inForce: true,
        signatoryName: 'Grace Hopper',
        signatoryTitle: 'Head of School',
      });
    });

    it('distinguishes never signed from signed and ended', async () => {
      /*
       * Different sentences for a district administrator: one means "do this",
       * the other means "this lapsed and somebody should know why".
       */
      const before = await as(head).institutions.overview({ institutionId: lincoln.id });
      expect(before.agreement).toEqual({ inForce: false, everSigned: false });

      const agreement = await agree();
      await withdrawAgreement(db, agreement.id);

      const after = await as(head).institutions.overview({ institutionId: lincoln.id });
      expect(after.agreement).toEqual({ inForce: false, everSigned: true });
    });
  });

  describe('the pupil list', () => {
    it('lists its pupils by name, because a number cannot be acted on', async () => {
      /*
       * Names are the point rather than an oversight. An administrator asked to
       * erase a particular child cannot do it from a list of ids, and the list is
       * already inside the check that decides these are *their* children.
       */
      await createDistrictLearner(db, {
        institutionId: lincoln.id,
        displayName: 'Ada',
        birthYear: 2016,
      });

      const pupils = await as(head).institutions.pupils({ institutionId: lincoln.id });
      expect(pupils.map(pupil => pupil.displayName)).toEqual(['Ada']);
    });

    it('includes an archived pupil, marked', async () => {
      /*
       * They are the ones most likely to be the subject of a deletion request —
       * a child who left months ago is exactly who a family writes in about — so
       * hiding them would mean the request could not be honoured at all.
       */
      const pupil = await createDistrictLearner(db, {
        institutionId: lincoln.id,
        displayName: 'Ada',
        birthYear: 2016,
      });
      await db
        .update(schema.learners)
        .set({ archivedAt: new Date(), archivedReason: 'requested' })
        .where(eq(schema.learners.id, pupil.id));

      const pupils = await as(head).institutions.pupils({ institutionId: lincoln.id });
      expect(pupils).toHaveLength(1);
      expect(pupils[0].archivedAt).not.toBeNull();
    });

    it('never includes a family’s child', async () => {
      const [parent] = await db
        .insert(schema.users)
        .values({ email: 'parent@home.test', role: 'parent' })
        .$returningId();
      await db
        .insert(schema.learners)
        .values({ guardianId: parent.id, displayName: 'At home', birthYear: 2016 });

      expect(await as(head).institutions.pupils({ institutionId: lincoln.id })).toEqual([]);
    });

    it('refuses another district’s administrator', async () => {
      await expect(
        as(otherHead).institutions.pupils({ institutionId: lincoln.id }),
      ).rejects.toThrow(/Administrators of this institution/);
    });
  });

  describe('whose district it is', () => {
    it('is refused to another district’s administrator', async () => {
      await expect(
        as(otherHead).institutions.overview({ institutionId: lincoln.id }),
      ).rejects.toThrow(/Administrators of this institution/);
    });

    it('is refused to a teacher of that same district', async () => {
      // Deliberately narrow. A teacher seeing their district's roll is a
      // reasonable thing to want and a decision somebody should take, not one
      // that falls out of a missing check.
      await expect(
        as(teacher).institutions.overview({ institutionId: lincoln.id }),
      ).rejects.toThrow(/Administrators of this institution/);
    });

    it('is refused to nobody at all', async () => {
      await expect(
        as(null).institutions.overview({ institutionId: lincoln.id }),
      ).rejects.toThrow(/Sign in/);
    });

    it('stops the moment an administrator is removed from the district', async () => {
      /*
       * Read at check time rather than from a thirty-day session, which is the
       * rule B2 set and this surface inherits.
       */
      await db
        .update(schema.users)
        .set({ institutionId: null })
        .where(eq(schema.users.id, head.id));

      await expect(
        as(head).institutions.overview({ institutionId: lincoln.id }),
      ).rejects.toThrow(/Administrators of this institution/);
    });
  });
});
