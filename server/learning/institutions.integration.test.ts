// @vitest-environment node

/**
 * Districts and campuses against a real MySQL.
 *
 * The parts worth pinning are the constraints, because they are the ones a
 * reader would assume rather than check: that a district cannot be removed while
 * anything still points at it, that two campuses in one district cannot share a
 * name while two districts can, and — most importantly — **that a family which
 * signed itself up is unaffected by any of it.**
 */

import { eq } from 'drizzle-orm';
import type { MySql2Database } from 'drizzle-orm/mysql2';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import * as schema from '../../drizzle/schema';
import { createTestDatabase, type TestDatabase } from '../test-support/database';
import {
  AlreadyExists,
  createInstitution,
  createSchool,
  listInstitutions,
  slugify,
} from './institutions';

const DATABASE_URL = process.env.DATABASE_URL;
if (process.env.CI && !DATABASE_URL) {
  throw new Error('DATABASE_URL is unset in CI; this suite would skip while covering nothing.');
}
const describeWithDb = DATABASE_URL ? describe : describe.skip;

describe('slugify', () => {
  it('reduces a district name to something usable in a URL', () => {
    expect(slugify('Lincoln Unified School District')).toBe('lincoln-unified-school-district');
    expect(slugify('  Ada  County   #12  ')).toBe('ada-county-12');
  });

  it('does not leave leading or trailing hyphens', () => {
    expect(slugify('!! Riverside !!')).toBe('riverside');
  });

  it('is bounded, because the column is', () => {
    expect(slugify('a'.repeat(300)).length).toBeLessThanOrEqual(80);
  });
});

describeWithDb('institutions', () => {
  let harness: TestDatabase;
  let db: MySql2Database<typeof schema>;

  beforeAll(async () => {
    harness = await createTestDatabase('institutions');
    db = harness.db;
  }, 60_000);

  afterAll(async () => {
    await harness?.close();
  });

  beforeEach(async () => {
    await harness.reset();
  });

  describe('creating', () => {
    it('derives a slug and stores the name as given', async () => {
      const district = await createInstitution(db, '  Lincoln Unified  ');
      expect(district.name).toBe('Lincoln Unified');
      expect(district.slug).toBe('lincoln-unified');
    });

    it('refuses a second district whose name reduces to the same slug', async () => {
      await createInstitution(db, 'Lincoln Unified');
      await expect(createInstitution(db, 'lincoln   unified')).rejects.toThrow(AlreadyExists);
    });

    it('refuses a name that reduces to nothing', async () => {
      await expect(createInstitution(db, '!!!')).rejects.toThrow(/usable slug/);
    });
  });

  describe('campuses', () => {
    it('belong to their district', async () => {
      const district = await createInstitution(db, 'Lincoln Unified');
      const campus = await createSchool(db, district.id, 'Lincoln Elementary');
      expect(campus.institutionId).toBe(district.id);
    });

    it('cannot repeat a name inside one district', async () => {
      const district = await createInstitution(db, 'Lincoln Unified');
      await createSchool(db, district.id, 'Lincoln Elementary');
      await expect(createSchool(db, district.id, 'Lincoln Elementary')).rejects.toThrow(
        AlreadyExists,
      );
    });

    it('may repeat a name across districts', async () => {
      // "Lincoln Elementary" exists in most districts. Uniqueness is per
      // institution for that reason, not global.
      const a = await createInstitution(db, 'Lincoln Unified');
      const b = await createInstitution(db, 'Riverside Unified');
      await createSchool(db, a.id, 'Lincoln Elementary');
      await expect(createSchool(db, b.id, 'Lincoln Elementary')).resolves.toBeTruthy();
    });

    it('says which failure it is, rather than letting the constraint say it badly', async () => {
      // "No such institution" and "that name is taken" are different answers, and
      // a caller that cannot tell them apart cannot tell a typo from a duplicate.
      await expect(createSchool(db, 999_999, 'Nowhere High')).rejects.toThrow(
        /No such institution/,
      );
    });
  });

  describe('what cannot be removed', () => {
    it('refuses to delete a district that still holds a campus', async () => {
      const district = await createInstitution(db, 'Lincoln Unified');
      await createSchool(db, district.id, 'Lincoln Elementary');

      /*
       * `restrict`, deliberately. Cascading here would delete campuses and,
       * through the classrooms on them, reach children's records — from a single
       * statement about an organisation. Whoever removes a district empties it
       * first, on purpose.
       */
      await expect(
        db.delete(schema.institutions).where(eq(schema.institutions.id, district.id)),
      ).rejects.toThrow();
    });

    it('refuses to delete a district that still holds an account', async () => {
      const district = await createInstitution(db, 'Lincoln Unified');
      await db
        .insert(schema.users)
        .values({ email: 'head@lincoln.test', role: 'admin', institutionId: district.id });

      await expect(
        db.delete(schema.institutions).where(eq(schema.institutions.id, district.id)),
      ).rejects.toThrow();
    });
  });

  describe('a family that signed itself up', () => {
    it('has no institution, and that is not a defect', async () => {
      await db.insert(schema.users).values({ email: 'sarah@example.test', role: 'parent' });
      const [sarah] = await db
        .select()
        .from(schema.users)
        .where(eq(schema.users.email, 'sarah@example.test'));

      expect(sarah.institutionId).toBeNull();
    });

    it('keeps a classroom that belongs to no campus', async () => {
      /*
       * The load-bearing assertion of this whole change. The institutional layer
       * sits on top of the learner product; nothing underneath may start
       * requiring an institution. A teacher who typed in their own class has no
       * school, and their classroom must still be creatable.
       */
      await db.insert(schema.users).values({ email: 'teacher@example.test', role: 'teacher' });
      const [teacher] = await db
        .select()
        .from(schema.users)
        .where(eq(schema.users.email, 'teacher@example.test'));

      await db.insert(schema.classrooms).values({ teacherId: teacher.id, name: 'Period 3' });
      const [classroom] = await db
        .select()
        .from(schema.classrooms)
        .where(eq(schema.classrooms.teacherId, teacher.id));

      expect(classroom.schoolId).toBeNull();
      expect(classroom.name).toBe('Period 3');
    });
  });

  describe('listing', () => {
    it('nests campuses under their district', async () => {
      const lincoln = await createInstitution(db, 'Lincoln Unified');
      const riverside = await createInstitution(db, 'Riverside Unified');
      await createSchool(db, lincoln.id, 'Lincoln Elementary');
      await createSchool(db, lincoln.id, 'Lincoln Middle');
      await createSchool(db, riverside.id, 'Riverside High');

      const all = await listInstitutions(db);
      expect(all).toHaveLength(2);
      expect(all.find(d => d.slug === 'lincoln-unified')?.schools).toHaveLength(2);
      expect(all.find(d => d.slug === 'riverside-unified')?.schools).toHaveLength(1);
    });

    it('returns a district with no campuses rather than omitting it', async () => {
      await createInstitution(db, 'Brand New Unified');
      const all = await listInstitutions(db);
      expect(all).toHaveLength(1);
      expect(all[0].schools).toEqual([]);
    });
  });
});
