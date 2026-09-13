// @vitest-environment node

/**
 * Putting people inside a district.
 *
 * B1 built the entities and B2 built the boundary, and between them
 * `users.institution_id` was written by nothing — a scope that was correct and
 * unreachable. These are the cases that decide whether the writer can be trusted
 * with a column that grants access to other people's children.
 */

import { eq } from 'drizzle-orm';
import type { MySql2Database } from 'drizzle-orm/mysql2';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import * as schema from '../../drizzle/schema';
import { createTestDatabase, type TestDatabase } from '../test-support/database';
import { institutionReaches } from '../auth/tenancy';
import { createInstitution } from './institutions';
import {
  addMember,
  BelongsElsewhere,
  listMembers,
  NotGrantable,
  removeMember,
  WouldDemotePlatformAdmin,
} from './membership';

const DATABASE_URL = process.env.DATABASE_URL;
if (process.env.CI && !DATABASE_URL) {
  throw new Error('DATABASE_URL is unset in CI; this suite would skip while covering nothing.');
}
const describeWithDb = DATABASE_URL ? describe : describe.skip;

describeWithDb('district membership', () => {
  let harness: TestDatabase;
  let db: MySql2Database<typeof schema>;
  let lincoln: { id: number };
  let riverside: { id: number };

  beforeAll(async () => {
    harness = await createTestDatabase('membership');
    db = harness.db;
  }, 60_000);

  afterAll(async () => {
    await harness?.close();
  });

  beforeEach(async () => {
    await harness.reset();
    lincoln = await createInstitution(db, 'Lincoln Unified');
    riverside = await createInstitution(db, 'Riverside Unified');
  });

  const userByEmail = async (email: string) => {
    const [row] = await db.select().from(schema.users).where(eq(schema.users.email, email));
    return row;
  };

  describe('adding', () => {
    it('creates an account for somebody who has never signed in', async () => {
      /*
       * A district adds staff by address, and most of them have no account yet.
       * The magic-link flow looks an account up by email before creating one, so
       * a row written here is the one they sign in to — rather than arriving
       * later as a fresh `parent` with no district, which is what would happen
       * if membership only worked for existing accounts.
       */
      const member = await addMember(db, lincoln.id, 'Head@Lincoln.test', 'institution_admin');

      expect(member.institutionId).toBe(lincoln.id);
      const row = await userByEmail('head@lincoln.test');
      expect(row.role).toBe('institution_admin');
      expect(row.institutionId).toBe(lincoln.id);
    });

    it('normalises the address, so one person is not two members', async () => {
      await addMember(db, lincoln.id, '  Head@Lincoln.test ', 'teacher');
      await addMember(db, lincoln.id, 'head@lincoln.test', 'institution_admin');

      expect(await listMembers(db, lincoln.id)).toHaveLength(1);
    });

    it('attaches an existing self-serve account', async () => {
      await db.insert(schema.users).values({ email: 'rivera@example.test', role: 'parent' });
      const member = await addMember(db, lincoln.id, 'rivera@example.test', 'teacher');

      expect(member.userId).toBe((await userByEmail('rivera@example.test')).id);
      expect((await userByEmail('rivera@example.test')).institutionId).toBe(lincoln.id);
    });

    it('changes a role within the same district', async () => {
      await addMember(db, lincoln.id, 'rivera@lincoln.test', 'teacher');
      await addMember(db, lincoln.id, 'rivera@lincoln.test', 'institution_admin');

      expect((await userByEmail('rivera@lincoln.test')).role).toBe('institution_admin');
    });
  });

  describe('what it refuses', () => {
    it('will not grant the platform administrator role', async () => {
      // A district minting a platform admin would make institutional scope
      // decorative — that account reaches every learner on the platform.
      await expect(
        // @ts-expect-error — the type forbids it; the runtime must too.
        addMember(db, lincoln.id, 'sneaky@lincoln.test', 'admin'),
      ).rejects.toThrow(NotGrantable);
    });

    it('will not demote an existing platform administrator', async () => {
      /*
       * Their privilege would otherwise change as a side effect of a district
       * adding them — the exact thing B2 avoided by making `institution_admin`
       * its own role rather than deriving scope from this column.
       */
      await db.insert(schema.users).values({ email: 'root@acuitymath.test', role: 'admin' });

      await expect(
        addMember(db, lincoln.id, 'root@acuitymath.test', 'teacher'),
      ).rejects.toThrow(WouldDemotePlatformAdmin);

      expect((await userByEmail('root@acuitymath.test')).role).toBe('admin');
      expect((await userByEmail('root@acuitymath.test')).institutionId).toBeNull();
    });

    it('will not transfer somebody from another district', async () => {
      /*
       * Moving an account between districts moves the scope over their children
       * with it. That is a deliberate act with consequences for families, not a
       * side effect of being added to a second district.
       */
      await addMember(db, riverside.id, 'head@riverside.test', 'institution_admin');

      await expect(
        addMember(db, lincoln.id, 'head@riverside.test', 'teacher'),
      ).rejects.toThrow(BelongsElsewhere);

      expect((await userByEmail('head@riverside.test')).institutionId).toBe(riverside.id);
    });

    it('will not add to a district that does not exist', async () => {
      await expect(
        addMember(db, 999_999, 'nobody@nowhere.test', 'teacher'),
      ).rejects.toThrow(/No such institution/);
    });
  });

  describe('removing', () => {
    it('clears the district and drops an administrator to parent', async () => {
      // `institution_admin` means nothing without a district to administer.
      await addMember(db, lincoln.id, 'head@lincoln.test', 'institution_admin');
      const head = await userByEmail('head@lincoln.test');

      await removeMember(db, head.id);

      const after = await userByEmail('head@lincoln.test');
      expect(after.institutionId).toBeNull();
      expect(after.role).toBe('parent');
    });

    it('leaves a teacher as a teacher', async () => {
      // Teachers exist outside institutions perfectly well; one who leaves a
      // district still has their own classes.
      await addMember(db, lincoln.id, 'rivera@lincoln.test', 'teacher');
      const rivera = await userByEmail('rivera@lincoln.test');

      await removeMember(db, rivera.id);

      const after = await userByEmail('rivera@lincoln.test');
      expect(after.institutionId).toBeNull();
      expect(after.role).toBe('teacher');
    });

    it('ends the reach immediately, not at session expiry', async () => {
      /*
       * The end-to-end version of B2's session decision. Membership is the only
       * thing that grants reach, so removing it must take it away — and it does
       * because the institution is read at check time rather than carried in a
       * thirty-day cookie.
       */
      await addMember(db, lincoln.id, 'head@lincoln.test', 'institution_admin');
      await addMember(db, lincoln.id, 'parent@lincoln.test', 'parent');
      const head = await userByEmail('head@lincoln.test');
      const parent = await userByEmail('parent@lincoln.test');
      // A learner id, not a guardian id: `institutionReaches` asks who may reach
      // a *child*, and since C3d a district's pupil has no guardian to name.
      const [child] = await db
        .insert(schema.learners)
        .values({ guardianId: parent.id, displayName: 'Their Child', birthYear: 2016 })
        .$returningId();

      expect(await institutionReaches(db, head.id, child.id)).toBe(true);

      await removeMember(db, head.id);

      expect(await institutionReaches(db, head.id, child.id)).toBe(false);
    });
  });

  describe('listing', () => {
    it('returns the district’s members and nobody else’s', async () => {
      await addMember(db, lincoln.id, 'a@lincoln.test', 'teacher');
      await addMember(db, lincoln.id, 'b@lincoln.test', 'parent');
      await addMember(db, riverside.id, 'c@riverside.test', 'teacher');
      await db.insert(schema.users).values({ email: 'private@example.test', role: 'parent' });

      const members = await listMembers(db, lincoln.id);
      expect(members.map(m => m.email)).toEqual(['a@lincoln.test', 'b@lincoln.test']);
    });

    it('does not list a platform administrator even if one were attached', async () => {
      // Defence in depth: `addMember` refuses to attach one, and the listing
      // would not surface one as a district member if a direct write did.
      await db
        .insert(schema.users)
        .values({ email: 'root@acuitymath.test', role: 'admin', institutionId: lincoln.id });

      expect(await listMembers(db, lincoln.id)).toEqual([]);
    });
  });
});
