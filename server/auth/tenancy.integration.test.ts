// @vitest-environment node

/**
 * The widest privilege boundary in the product, against a real MySQL.
 *
 * Every rule before this separated one family from another. This one separates a
 * district from a district, so a mistake stops being a bug about one child and
 * becomes a bug about every child in a region.
 *
 * The cases here are chosen for the ones that *look* like they work: two
 * accounts with no institution, an administrator whose district was cleared, and
 * a child taught by a district but signed up privately.
 */

import { eq } from 'drizzle-orm';
import type { MySql2Database } from 'drizzle-orm/mysql2';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import * as schema from '../../drizzle/schema';
import { createTestDatabase, type TestDatabase } from '../test-support/database';
import { createInstitution, createSchool } from '../learning/institutions';
import { institutionReaches, learnersInInstitution } from './tenancy';

const DATABASE_URL = process.env.DATABASE_URL;
if (process.env.CI && !DATABASE_URL) {
  throw new Error('DATABASE_URL is unset in CI; this suite would skip while covering nothing.');
}
const describeWithDb = DATABASE_URL ? describe : describe.skip;

describeWithDb('institutional scope', () => {
  let harness: TestDatabase;
  let db: MySql2Database<typeof schema>;

  beforeAll(async () => {
    harness = await createTestDatabase('tenancy');
    db = harness.db;
  }, 60_000);

  afterAll(async () => {
    await harness?.close();
  });

  beforeEach(async () => {
    await harness.reset();
  });

  async function makeUser(
    email: string,
    role: 'parent' | 'teacher' | 'admin' | 'institution_admin',
    institutionId: number | null = null,
  ): Promise<number> {
    await db.insert(schema.users).values({ email, role, institutionId });
    const [row] = await db.select().from(schema.users).where(eq(schema.users.email, email));
    return row.id;
  }

  async function makeLearner(guardianId: number, displayName: string): Promise<number> {
    await db.insert(schema.learners).values({ guardianId, displayName, birthYear: 2016 });
    const [row] = await db
      .select()
      .from(schema.learners)
      .where(eq(schema.learners.displayName, displayName));
    return row.id;
  }

  describe('the null trap', () => {
    it('does not let two accounts with no institution reach each other', async () => {
      /*
       * **The most important assertion in this file.**
       *
       * Most accounts have no institution: every family that signed itself up
       * has `institution_id` null. If absence compared equal to absence, one
       * self-serve parent would reach every other self-serve family's children
       * — the entire platform, through a rule written to narrow access.
       *
       * "Zero is not a value when it means unset" is already a recorded trap
       * here, from `screen_time_rules`. This is the same trap where being wrong
       * discloses children's records rather than locking a screen.
       */
      const sarah = await makeUser('sarah@example.test', 'parent');
      const other = await makeUser('other@example.test', 'parent');

      expect(await institutionReaches(db, sarah, other)).toBe(false);
    });

    it('does not let an institutional admin with no institution reach anybody', async () => {
      // A role without a district is not a wildcard. It is a misconfiguration,
      // and the safe reading of a misconfiguration is "reaches nothing".
      const stray = await makeUser('stray@example.test', 'institution_admin');
      const guardian = await makeUser('guardian@example.test', 'parent');

      expect(await institutionReaches(db, stray, guardian)).toBe(false);
    });

    it('does not let an institutional admin reach an unaffiliated family', async () => {
      const lincoln = await createInstitution(db, 'Lincoln Unified');
      const head = await makeUser('head@lincoln.test', 'institution_admin', lincoln.id);
      const privateFamily = await makeUser('private@example.test', 'parent');

      expect(await institutionReaches(db, head, privateFamily)).toBe(false);
    });
  });

  describe('across districts', () => {
    it('refuses an administrator of one district reaching another', async () => {
      const lincoln = await createInstitution(db, 'Lincoln Unified');
      const riverside = await createInstitution(db, 'Riverside Unified');

      const lincolnHead = await makeUser('head@lincoln.test', 'institution_admin', lincoln.id);
      const riversideParent = await makeUser('p@riverside.test', 'parent', riverside.id);

      expect(await institutionReaches(db, lincolnHead, riversideParent)).toBe(false);
    });

    it('permits an administrator within their own district', async () => {
      /*
       * The control. Without it every refusal above could be a broken fixture,
       * and a broken fixture reads exactly like a working boundary.
       */
      const lincoln = await createInstitution(db, 'Lincoln Unified');
      const head = await makeUser('head@lincoln.test', 'institution_admin', lincoln.id);
      const parent = await makeUser('p@lincoln.test', 'parent', lincoln.id);

      expect(await institutionReaches(db, head, parent)).toBe(true);
    });

    it('stops reaching once the administrator is removed from the district', async () => {
      /*
       * Why the institution is read at check time rather than carried in the
       * session. A session lasts thirty days; if tenancy were baked into it,
       * this administrator would keep reaching the district's children for up
       * to a month after being removed from it.
       */
      const lincoln = await createInstitution(db, 'Lincoln Unified');
      const head = await makeUser('head@lincoln.test', 'institution_admin', lincoln.id);
      const parent = await makeUser('p@lincoln.test', 'parent', lincoln.id);
      expect(await institutionReaches(db, head, parent)).toBe(true);

      await db
        .update(schema.users)
        .set({ institutionId: null })
        .where(eq(schema.users.id, head));

      expect(await institutionReaches(db, head, parent)).toBe(false);
    });
  });

  describe('scope follows the guardian, not enrolment', () => {
    it('does not reach a private family whose child sits in a district classroom', async () => {
      /*
       * The decision this boundary was drawn around.
       *
       * A child whose parent signed up privately may also be enrolled at a
       * district campus. Enrolment gives the *teacher* what they need to teach.
       * It does not put that child's home practice — evenings, weekends, on a
       * family account the district never provisioned — inside the district's
       * reach.
       */
      const lincoln = await createInstitution(db, 'Lincoln Unified');
      const campus = await createSchool(db, lincoln.id, 'Lincoln Elementary');
      const head = await makeUser('head@lincoln.test', 'institution_admin', lincoln.id);

      const privateParent = await makeUser('private@example.test', 'parent');
      const child = await makeLearner(privateParent, 'Maya');

      const teacher = await makeUser('rivera@lincoln.test', 'teacher', lincoln.id);
      await db
        .insert(schema.classrooms)
        .values({ teacherId: teacher, schoolId: campus.id, name: 'Room 4' });
      const [classroom] = await db
        .select()
        .from(schema.classrooms)
        .where(eq(schema.classrooms.teacherId, teacher));
      await db
        .insert(schema.classroomLearners)
        .values({ classroomId: classroom.id, learnerId: child });

      // Enrolled at a Lincoln campus, and still outside Lincoln's scope.
      expect(await institutionReaches(db, head, privateParent)).toBe(false);
    });
  });

  describe('listing a district’s learners', () => {
    it('returns its own and nobody else’s', async () => {
      const lincoln = await createInstitution(db, 'Lincoln Unified');
      const riverside = await createInstitution(db, 'Riverside Unified');

      const lincolnParent = await makeUser('p@lincoln.test', 'parent', lincoln.id);
      const riversideParent = await makeUser('p@riverside.test', 'parent', riverside.id);
      const privateParent = await makeUser('private@example.test', 'parent');

      const mine = await makeLearner(lincolnParent, 'Lincoln Child');
      await makeLearner(riversideParent, 'Riverside Child');
      await makeLearner(privateParent, 'Private Child');

      expect(await learnersInInstitution(db, lincoln.id)).toEqual([mine]);
    });

    it('returns nothing for a district with no families', async () => {
      const empty = await createInstitution(db, 'Brand New Unified');
      expect(await learnersInInstitution(db, empty.id)).toEqual([]);
    });
  });
});
