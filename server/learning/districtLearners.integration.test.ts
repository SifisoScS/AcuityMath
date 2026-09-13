// @vitest-environment node

/**
 * A child a district owns, and what that changes.
 *
 * Two assertions here matter more than the rest. **A district pupil cannot
 * practise**, because nobody has consented for them and the gate is what says
 * so — that is the correct state of C3d, not a gap in it, and C3e is what flips
 * it. And **family consent cannot reach them**, which is the reason the column
 * exists at all rather than some adult being made their guardian.
 */

import { eq } from 'drizzle-orm';
import type { MySql2Database } from 'drizzle-orm/mysql2';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import * as schema from '../../drizzle/schema';
import { createTestDatabase, type TestDatabase } from '../test-support/database';
import { createInstitution } from './institutions';
import { addMember } from './membership';
import { createDistrictLearner, districtLearners } from './districtLearners';
import { consentForFamily, consentStatusFor, recordConsent } from './consent';
import { recordingPermission } from './consentGate';
import { raiseMasteryMilestone } from './notifications';
import { institutionReaches, learnersInInstitution } from '../auth/tenancy';
import { CONSENT_POLICY_VERSION } from '../../src/data/consentPolicy';

const DATABASE_URL = process.env.DATABASE_URL;
if (process.env.CI && !DATABASE_URL) {
  throw new Error('DATABASE_URL is unset in CI; this suite would skip while covering nothing.');
}
const describeWithDb = DATABASE_URL ? describe : describe.skip;

describeWithDb('a child a district provisioned', () => {
  let harness: TestDatabase;
  let db: MySql2Database<typeof schema>;
  let lincoln: { id: number };
  let riverside: { id: number };

  beforeAll(async () => {
    harness = await createTestDatabase('districtlearners');
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

  const pupil = (institutionId: number, displayName = 'Ada') =>
    createDistrictLearner(db, { institutionId, displayName, birthYear: 2016 });

  describe('existing', () => {
    it('has a district and no guardian', async () => {
      const child = await pupil(lincoln.id);

      const [row] = await db
        .select()
        .from(schema.learners)
        .where(eq(schema.learners.id, child.id));

      expect(row.institutionId).toBe(lincoln.id);
      expect(row.guardianId).toBeNull();
    });

    it('is listed for their district and not for another', async () => {
      await pupil(lincoln.id, 'Ada');
      await pupil(riverside.id, 'Grace');

      expect((await districtLearners(db, lincoln.id)).map(l => l.displayName)).toEqual(['Ada']);
    });
  });

  describe('the check constraint', () => {
    it('refuses a child with two owners', async () => {
      /*
       * Enforced by the database, not by the writer above it. A child with both
       * is reachable by two parties who never agreed to share them, and a rule
       * that lives only in one function is a rule the next insert can miss.
       */
      const [parent] = await db
        .insert(schema.users)
        .values({ email: 'parent@home.test', role: 'parent' })
        .$returningId();

      await expect(
        db.insert(schema.learners).values({
          guardianId: parent.id,
          institutionId: lincoln.id,
          displayName: 'Both',
          birthYear: 2016,
        }),
      ).rejects.toThrow();
    });

    it('refuses a child with no owner at all', async () => {
      /*
       * The worse of the two. Nobody could export their data, no district could
       * answer for them, and the consent gate would have nobody to ask.
       */
      await expect(
        db.insert(schema.learners).values({ displayName: 'Nobody', birthYear: 2016 }),
      ).rejects.toThrow();
    });
  });

  describe('consent', () => {
    it('is missing, so they cannot practise yet', async () => {
      /*
       * **The point of C3d.** The child exists and is refused, which is the gate
       * working rather than a hole in it. C3e records the district's agreement
       * and this flips — and that flip is the proof the gate was load-bearing
       * rather than decorative.
       */
      const child = await pupil(lincoln.id);

      expect(await consentStatusFor(db, child.id)).toBe('none');
      const permission = await recordingPermission(db, child.id);
      expect(permission.mayRecord).toBe(false);
    });

    it('cannot be granted by a family flow', async () => {
      /*
       * The reason this column exists instead of making some adult the guardian
       * of a district's pupils. `recordConsent` consents for **every** learner of
       * the guardian it is given — right for a family, catastrophic for a
       * district. With no guardian to sweep from, it structurally cannot reach.
       */
      const child = await pupil(lincoln.id);
      const head = await addMember(db, lincoln.id, 'head@lincoln.test', 'institution_admin');

      const result = await recordConsent(db, {
        guardianId: head.userId,
        decision: 'granted',
        attestedName: 'A District Head',
        policyVersion: CONSENT_POLICY_VERSION,
      });

      expect(result.learnerIds).toEqual([]);
      expect(await consentStatusFor(db, child.id)).toBe('none');
      expect(await consentForFamily(db, head.userId)).toEqual({});
    });
  });

  describe('a milestone with no guardian to tell', () => {
    it('writes the child’s row and no second row addressed to nobody', async () => {
      /*
       * `raiseMasteryMilestone` writes two rows: one to the child, one to their
       * guardian. A district pupil has no guardian, and writing the second row
       * anyway would insert a notification with neither a `user_id` nor a
       * `learner_id` — addressed to nobody, visible to nobody, deleted by
       * nobody.
       *
       * Called directly rather than through `recordAttempt`, because a district
       * pupil cannot practise yet and so cannot reach this by the ordinary
       * route. That makes the guard **unreachable in production today**, which
       * is worth saying: it becomes live in C3e, and a guard that only starts
       * mattering later still has to be right when it does.
       */
      const child = await pupil(lincoln.id);
      await db
        .insert(schema.concepts)
        .values({
          id: 'c-1',
          title: 'Halves',
          strand: 'number',
          tier: 'early',
          ageBandLow: 6,
          ageBandHigh: 7,
        });

      const written = await raiseMasteryMilestone(db, {
        learnerId: child.id,
        conceptId: 'c-1',
        previousMastery: 70,
        currentMastery: 90,
      });

      const rows = await db.select().from(schema.notifications);
      expect(written).toBe(1);
      expect(rows).toHaveLength(1);
      expect(rows[0].learnerId).toBe(child.id);
      expect(rows.some(row => row.userId === null && row.learnerId === null)).toBe(false);
    });
  });

  describe('who can reach them', () => {
    it('is their own district’s administrator', async () => {
      const child = await pupil(lincoln.id);
      const head = await addMember(db, lincoln.id, 'head@lincoln.test', 'institution_admin');

      expect(await institutionReaches(db, head.userId, child.id)).toBe(true);
    });

    it('is not another district’s administrator', async () => {
      const child = await pupil(lincoln.id);
      const other = await addMember(db, riverside.id, 'head@riverside.test', 'institution_admin');

      expect(await institutionReaches(db, other.userId, child.id)).toBe(false);
    });

    it('is not an adult with no district at all', async () => {
      /*
       * `null` is not a match. If absence compared equal to absence, every
       * self-serve parent would reach every district pupil on the platform.
       */
      const child = await pupil(lincoln.id);
      const [stray] = await db
        .insert(schema.users)
        .values({ email: 'stray@home.test', role: 'parent' })
        .$returningId();

      expect(await institutionReaches(db, stray.id, child.id)).toBe(false);
    });

    it('counts them in their district alongside children reached through parents', async () => {
      /*
       * Two routes in, and missing the second would be a silent under-count in
       * the numbers a district reports on.
       */
      const owned = await pupil(lincoln.id);
      const teacher = await addMember(db, lincoln.id, 'teacher@lincoln.test', 'teacher');
      const [theirChild] = await db
        .insert(schema.learners)
        .values({ guardianId: teacher.userId, displayName: 'Theirs', birthYear: 2015 })
        .$returningId();

      expect(await learnersInInstitution(db, lincoln.id)).toEqual(
        [owned.id, theirChild.id].sort((a, b) => a - b),
      );
    });
  });

  describe('a family child, unchanged', () => {
    it('still belongs to their guardian and nobody else', async () => {
      /*
       * The regression that would matter most: C3d must not quietly move
       * self-serve families into anybody's reach.
       */
      const [parent] = await db
        .insert(schema.users)
        .values({ email: 'parent@home.test', role: 'parent' })
        .$returningId();
      const [child] = await db
        .insert(schema.learners)
        .values({ guardianId: parent.id, displayName: 'Home', birthYear: 2016 })
        .$returningId();
      const head = await addMember(db, lincoln.id, 'head@lincoln.test', 'institution_admin');

      expect(await institutionReaches(db, head.userId, child.id)).toBe(false);
      expect(await learnersInInstitution(db, lincoln.id)).toEqual([]);
    });
  });
});
