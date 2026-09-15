// @vitest-environment node

/**
 * Which claims made by somebody else's software we are willing to act on.
 *
 * A verified launch is trustworthy about *what the platform believes*, and that
 * is not the same as being trustworthy about our accounts. Almost every case
 * here is a refusal, and the ones that would otherwise hurt somebody are marked
 * as such: an LMS can assert any email address it likes, and an account is a
 * thing a person owns.
 */

import { eq } from 'drizzle-orm';
import type { MySql2Database } from 'drizzle-orm/mysql2';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import * as schema from '../../drizzle/schema';
import { createTestDatabase, type TestDatabase } from '../test-support/database';
import { createInstitution } from '../learning/institutions';
import { addMember } from '../learning/membership';
import { institutionReaches } from '../auth/tenancy';
import type { LaunchContext } from './idToken';
import { CannotProvision, provisionStaff } from './provision';

const DATABASE_URL = process.env.DATABASE_URL;
if (process.env.CI && !DATABASE_URL) {
  throw new Error('DATABASE_URL is unset in CI; this suite would skip while covering nothing.');
}
const describeWithDb = DATABASE_URL ? describe : describe.skip;

describeWithDb('signing somebody in from a launch', () => {
  let harness: TestDatabase;
  let db: MySql2Database<typeof schema>;
  let lincoln: { id: number };
  let riverside: { id: number };
  let platformId: number;

  beforeAll(async () => {
    harness = await createTestDatabase('ltiprovision');
    db = harness.db;
  }, 60_000);

  afterAll(async () => {
    await harness?.close();
  });

  beforeEach(async () => {
    await harness.reset();
    lincoln = await createInstitution(db, 'Lincoln Unified');
    riverside = await createInstitution(db, 'Riverside Unified');

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

  function launch(overrides: Partial<LaunchContext> = {}): LaunchContext {
    return {
      platformId,
      issuer: 'https://platform.test',
      clientId: 'client-1',
      deploymentId: 'dep-1',
      institutionId: lincoln.id,
      subject: 'sub-teacher-1',
      name: 'Grace Hopper',
      email: 'grace@lincoln.test',
      roles: ['http://purl.imsglobal.org/vocab/lis/v2/membership#Instructor'],
      isStaff: true,
      contextId: 'ctx-1',
      contextTitle: 'Year 4 Maths',
      resourceLinkId: 'link-1',
      targetLinkUri: 'https://acuitymath.test/practice',
      custom: {},
      membershipsUrl: null,
      ags: null,
      messageType: 'LtiResourceLinkRequest',
      deepLinking: null,
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

  describe('a teacher the district has never seen', () => {
    it('gets an account in the district the deployment names', async () => {
      const staff = await provisionStaff(db, launch());

      const [user] = await db
        .select()
        .from(schema.users)
        .where(eq(schema.users.id, staff.userId));

      expect(staff.isNew).toBe(true);
      expect(user.email).toBe('grace@lincoln.test');
      expect(user.role).toBe('teacher');
      expect(user.institutionId).toBe(lincoln.id);
    });

    it('is the same account on the second launch', async () => {
      const first = await provisionStaff(db, launch());
      const second = await provisionStaff(db, launch());

      expect(second.userId).toBe(first.userId);
      expect(second.isNew).toBe(false);
      expect(await db.select().from(schema.ltiIdentities)).toHaveLength(1);
    });

    it('is recognised after their address changes at the LMS', async () => {
      /*
       * The reason the identity table exists rather than matching on email each
       * time. A teacher who marries would otherwise arrive as a stranger and be
       * handed a new empty account, with their classes on the old one.
       */
      const first = await provisionStaff(db, launch());
      const second = await provisionStaff(db, launch({ email: 'grace.hopper@lincoln.test' }));

      expect(second.userId).toBe(first.userId);
    });

    it('is recognised after the LMS stops sending an address at all', async () => {
      // A district turning off personal data is a privacy setting working.
      const first = await provisionStaff(db, launch());
      const second = await provisionStaff(db, launch({ email: null }));

      expect(second.userId).toBe(first.userId);
    });

    it('records when they last launched', async () => {
      await provisionStaff(db, launch(), new Date('2026-01-10T09:00:00Z'));
      await provisionStaff(db, launch(), new Date('2026-03-02T09:00:00Z'));

      const [identity] = await db.select().from(schema.ltiIdentities);
      expect(identity.lastLaunchedAt.getUTCMonth()).toBe(2);
    });
  });

  describe('two platforms that both call somebody 12345', () => {
    it('keeps them apart', async () => {
      /*
       * `sub` is unique per platform, never globally. Matching on the subject
       * alone would hand one district's teacher another district's account.
       */
      await db.insert(schema.ltiPlatforms).values({
        issuer: 'https://other.test',
        clientId: 'client-2',
        name: 'Other LMS',
        authLoginUrl: 'https://other.test/auth',
        authTokenUrl: 'https://other.test/token',
        keysetUrl: 'https://other.test/jwks',
      });
      const [other] = await db
        .select({ id: schema.ltiPlatforms.id })
        .from(schema.ltiPlatforms)
        .where(eq(schema.ltiPlatforms.clientId, 'client-2'));

      const first = await provisionStaff(db, launch({ subject: '12345' }));
      const second = await provisionStaff(
        db,
        launch({
          subject: '12345',
          platformId: other.id,
          institutionId: riverside.id,
          email: 'someone.else@riverside.test',
        }),
      );

      expect(second.userId).not.toBe(first.userId);
    });
  });

  describe('a pupil', () => {
    it('is refused, and told so', async () => {
      /*
       * Not an oversight. Signing a child in needs a consent record, and a child
       * arriving from an LMS has no guardian here — the district stands in their
       * place, which is C3d. Guessing would put a child in front of the product
       * with nothing on file.
       */
      const reason = await reasonFor(
        provisionStaff(db, launch({ isStaff: false, roles: ['Learner'] })),
      );

      expect(reason).toBe('not_staff');
      expect(await db.select().from(schema.users)).toHaveLength(0);
      expect(await db.select().from(schema.ltiIdentities)).toHaveLength(0);
    });
  });

  describe('an account that already exists', () => {
    it("refuses a parent's account, and leaves their children out of the district", async () => {
      /*
       * **The one that would actually hurt somebody.**
       *
       * A self-serve account with no district is usually a parent, and their
       * children hang off it. Adopting it on the say-so of a launch would pull
       * that family's records into a district's reach with no adult agreeing to
       * anything — so the assertion is not only that provisioning is refused,
       * but that the district still cannot see the child afterwards.
       */
      const [parent] = await db
        .insert(schema.users)
        .values({ email: 'grace@lincoln.test', role: 'parent' })
        .$returningId();
      const [child] = await db
        .insert(schema.learners)
        .values({ guardianId: parent.id, displayName: 'Ada', birthYear: 2016 })
        .$returningId();
      const admin = await addMember(db, lincoln.id, 'head@lincoln.test', 'institution_admin');

      const reason = await reasonFor(provisionStaff(db, launch()));

      expect(reason).toBe('unaffiliated');
      const [after] = await db.select().from(schema.users).where(eq(schema.users.id, parent.id));
      expect(after.institutionId).toBeNull();
      expect(after.role).toBe('parent');
      /*
       * A learner id, which this line did not always pass.
       *
       * Before C3d `institutionReaches` took the *guardian's* id, and this call
       * handed it a learner id. It returned `false` and the test passed —
       * because that learner's id and an unrelated user's id were both 1. A
       * wrong answer agreeing with the expected one teaches nothing, and the
       * argument change in C3d is what made it impossible to write.
       */
      expect(await institutionReaches(db, admin.userId, child.id)).toBe(false);
    });

    it('refuses a platform administrator', async () => {
      await db.insert(schema.users).values({ email: 'grace@lincoln.test', role: 'admin' });
      expect(await reasonFor(provisionStaff(db, launch()))).toBe('platform_admin');
    });

    it('refuses an account belonging to another district', async () => {
      await addMember(db, riverside.id, 'grace@lincoln.test', 'teacher');
      expect(await reasonFor(provisionStaff(db, launch()))).toBe('other_district');
    });

    it('links the district’s own member, without touching their role', async () => {
      /*
       * An `institution_admin` who launches from Canvas must not come back a
       * `teacher`. That is exactly what handing this to `addMember` would do,
       * which is why this path does not.
       */
      const member = await addMember(db, lincoln.id, 'grace@lincoln.test', 'institution_admin');

      const staff = await provisionStaff(db, launch());

      const [user] = await db.select().from(schema.users).where(eq(schema.users.id, staff.userId));
      expect(staff.userId).toBe(member.userId);
      expect(user.role).toBe('institution_admin');
    });
  });

  describe('a first launch with no address', () => {
    it('is refused with something an administrator can act on', async () => {
      const reason = await reasonFor(provisionStaff(db, launch({ email: null })));
      expect(reason).toBe('no_email');
    });
  });

  describe('somebody who left the district', () => {
    it('is refused even though their link survives', async () => {
      /*
       * Nothing deletes an LTI link when an account leaves a district, so the
       * district is rechecked on every launch. Without that, a teacher who left
       * in September would still be launching into that district's data in June.
       */
      const staff = await provisionStaff(db, launch());
      await db
        .update(schema.users)
        .set({ institutionId: riverside.id })
        .where(eq(schema.users.id, staff.userId));

      expect(await reasonFor(provisionStaff(db, launch()))).toBe('moved');
    });
  });
});
