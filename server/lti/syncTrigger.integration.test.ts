// @vitest-environment node

/**
 * Who may ask for a roster sync, and what one costs.
 *
 * C4c built a sync that nothing could call. This is the surface that calls it,
 * and the question it raises is not "does the sync work" — that is proved
 * elsewhere — but **whose courses a given administrator can reach**.
 *
 * A district's own administrator has to be able to do this. Requiring a platform
 * administrator would make this company the bottleneck on every roster in every
 * school, which is a design that works until the second customer.
 */

import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { eq } from 'drizzle-orm';
import type { MySql2Database } from 'drizzle-orm/mysql2';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import * as schema from '../../drizzle/schema';
import { createTestDatabase, type TestDatabase } from '../test-support/database';
import { createInstitution } from '../learning/institutions';
import { addMember } from '../learning/membership';
import { signAgreement } from '../learning/institutionAgreements';
import { INSTITUTIONAL_AGREEMENT_VERSION } from '../../src/data/institutionalAgreement';
import { appRouter } from '../trpc/routers';
import type { Context } from '../trpc';
import type { AuthenticatedUser } from '../auth/session';
import { addDeployment } from './platforms';
import { SYNC_COOLDOWN_MS } from './rosterSync';

const DATABASE_URL = process.env.DATABASE_URL;
if (process.env.CI && !DATABASE_URL) {
  throw new Error('DATABASE_URL is unset in CI; this suite would skip while covering nothing.');
}
const describeWithDb = DATABASE_URL ? describe : describe.skip;

const LEARNER = 'http://purl.imsglobal.org/vocab/lis/v2/membership#Learner';
const INSTRUCTOR = 'http://purl.imsglobal.org/vocab/lis/v2/membership#Instructor';

describeWithDb('asking for a roster sync', () => {
  let harness: TestDatabase;
  let db: MySql2Database<typeof schema>;
  let lms: Server;
  let base: string;
  let lincoln: { id: number };
  let riverside: { id: number };
  let lincolnHead: AuthenticatedUser;
  let riversideHead: AuthenticatedUser;
  let platformAdmin: AuthenticatedUser;
  let teacher: AuthenticatedUser;
  let contextRowId: number;
  let members: unknown[] = [];

  beforeAll(async () => {
    harness = await createTestDatabase('ltisynctrigger');

    lms = createServer((req, res) => {
      const url = new URL(req.url ?? '/', base);
      if (url.pathname === '/token') {
        req.on('data', () => {});
        req.on('end', () => {
          res.setHeader('content-type', 'application/json');
          res.end(JSON.stringify({ access_token: 'token', expires_in: 3600 }));
        });
        return;
      }
      res.setHeader('content-type', 'application/json');
      res.end(JSON.stringify({ context: { id: 'ctx-1', title: 'Year 4 Maths' }, members }));
    });
    await new Promise<void>(resolve => lms.listen(0, '127.0.0.1', resolve));
    base = `http://127.0.0.1:${(lms.address() as AddressInfo).port}`;
  }, 60_000);

  afterAll(async () => {
    await new Promise<void>(resolve => lms?.close(() => resolve()));
    await harness?.close();
  });

  const userFor = async (email: string): Promise<AuthenticatedUser> => {
    const [row] = await db.select().from(schema.users).where(eq(schema.users.email, email));
    return { id: row.id, email: row.email, name: row.name, role: row.role };
  };

  beforeEach(async () => {
    await harness.reset();
    db = harness.db;
    members = [];

    lincoln = await createInstitution(db, 'Lincoln Unified');
    riverside = await createInstitution(db, 'Riverside Unified');

    const head = await addMember(db, lincoln.id, 'head@lincoln.test', 'institution_admin');
    await addMember(db, riverside.id, 'head@riverside.test', 'institution_admin');
    const teacherMember = await addMember(db, lincoln.id, 'teacher@lincoln.test', 'teacher');
    await db.insert(schema.users).values({ email: 'ops@acuitymath.test', role: 'admin' });

    lincolnHead = await userFor('head@lincoln.test');
    riversideHead = await userFor('head@riverside.test');
    teacher = await userFor('teacher@lincoln.test');
    platformAdmin = await userFor('ops@acuitymath.test');

    await signAgreement(db, {
      institutionId: lincoln.id,
      signedByUserId: head.userId,
      signatoryName: 'Grace Hopper',
      signatoryTitle: 'Head of School',
      agreementVersion: INSTITUTIONAL_AGREEMENT_VERSION,
    });

    await db.insert(schema.ltiPlatforms).values({
      issuer: 'https://platform.test',
      clientId: 'client-1',
      name: 'Test LMS',
      authLoginUrl: 'https://platform.test/auth',
      authTokenUrl: `${base}/token`,
      keysetUrl: 'https://platform.test/jwks',
    });
    const [platform] = await db.select().from(schema.ltiPlatforms).limit(1);
    const deployment = await addDeployment(db, platform.id, 'dep-1', lincoln.id);

    await db.insert(schema.ltiContexts).values({
      deploymentId: deployment.id,
      contextId: 'ctx-1',
      title: 'Year 4 Maths',
      membershipsUrl: `${base}/memberships`,
      defaultBirthYear: 2016,
    });
    const [context] = await db.select().from(schema.ltiContexts).limit(1);
    contextRowId = context.id;

    await db.insert(schema.ltiIdentities).values({
      platformId: platform.id,
      subject: 'teacher-sub',
      userId: teacherMember.userId,
    });
  });

  const as = (user: AuthenticatedUser | null) =>
    appRouter.createCaller({
      db,
      user,
      learnerSessionId: null,
      headers: {},
      setCookie: () => {},
    } satisfies Context);

  const teacherRow = { user_id: 'teacher-sub', roles: [INSTRUCTOR], name: 'Ada Teacher' };
  const pupilRow = { user_id: 'p-1', roles: [LEARNER], name: 'Ada Pupil' };

  describe('who may ask', () => {
    it('lets the district’s own administrator', async () => {
      members = [teacherRow, pupilRow];
      const result = await as(lincolnHead).lti.syncRoster({ contextId: contextRowId });

      expect(result.created).toBe(1);
      expect(await db.select().from(schema.learners)).toHaveLength(1);
    });

    it('lets a platform administrator, who supports every district', async () => {
      members = [teacherRow, pupilRow];
      await expect(
        as(platformAdmin).lti.syncRoster({ contextId: contextRowId }),
      ).resolves.toBeTruthy();
    });

    it('refuses another district’s administrator, indistinguishably from a missing course', async () => {
      /*
       * NOT_FOUND rather than FORBIDDEN. FORBIDDEN confirms the course exists,
       * which lets one district's administrator map another's courses one id at
       * a time — the same reasoning that governs learner ids.
       */
      members = [teacherRow, pupilRow];

      await expect(
        as(riversideHead).lti.syncRoster({ contextId: contextRowId }),
      ).rejects.toThrow(/No such course/);
      await expect(
        as(riversideHead).lti.syncRoster({ contextId: 999_999 }),
      ).rejects.toThrow(/No such course/);

      expect(await db.select().from(schema.learners)).toHaveLength(0);
    });

    it('refuses a teacher', async () => {
      // Deliberately narrow for now. A teacher syncing their own class is a
      // reasonable thing to want; it is a decision about scope, not an oversight,
      // and it should be taken rather than fall out of a missing check.
      members = [teacherRow, pupilRow];
      await expect(as(teacher).lti.syncRoster({ contextId: contextRowId })).rejects.toThrow(
        /No such course/,
      );
    });

    it('refuses somebody signed in as nobody', async () => {
      await expect(as(null).lti.syncRoster({ contextId: contextRowId })).rejects.toThrow(/Sign in/);
    });

    it('refuses an administrator whose district was taken away', async () => {
      /*
       * Read at check time, not from the session. A thirty-day cookie would
       * otherwise keep an administrator reaching a district's courses for a month
       * after they were removed from it.
       */
      members = [teacherRow, pupilRow];
      await db
        .update(schema.users)
        .set({ institutionId: null })
        .where(eq(schema.users.id, lincolnHead.id));

      await expect(
        as(lincolnHead).lti.syncRoster({ contextId: contextRowId }),
      ).rejects.toThrow(/No such course/);
    });
  });

  describe('the cooldown', () => {
    it('refuses a second sync a moment later', async () => {
      /*
       * Not a limit on people — a limit on what one human action costs somebody
       * else's server. A double-clicked button would otherwise be two full
       * roster reads against a district's LMS.
       */
      members = [teacherRow, pupilRow];
      await as(lincolnHead).lti.syncRoster({ contextId: contextRowId });

      await expect(
        as(lincolnHead).lti.syncRoster({ contextId: contextRowId }),
      ).rejects.toThrow(/synchronised a moment ago/);
    });

    it('allows it when an administrator asks explicitly', async () => {
      // Somebody who has just fixed a misconfiguration should not be told to wait.
      members = [teacherRow, pupilRow];
      await as(lincolnHead).lti.syncRoster({ contextId: contextRowId });

      await expect(
        as(lincolnHead).lti.syncRoster({ contextId: contextRowId, force: true }),
      ).resolves.toBeTruthy();
    });

    it('allows it once the cooldown has passed', async () => {
      members = [teacherRow, pupilRow];
      await as(lincolnHead).lti.syncRoster({ contextId: contextRowId });

      await db
        .update(schema.ltiContexts)
        .set({ lastSyncedAt: new Date(Date.now() - SYNC_COOLDOWN_MS - 1000) })
        .where(eq(schema.ltiContexts.id, contextRowId));

      await expect(
        as(lincolnHead).lti.syncRoster({ contextId: contextRowId }),
      ).resolves.toBeTruthy();
    });
  });

  describe('what a refusal tells the administrator', () => {
    it('passes through the sentence naming what to fix', async () => {
      // Each of these names something only they can do. Flattening them to
      // "something went wrong" sends them to a support queue to be told this.
      members = [pupilRow];

      /*
       * Read off `.message` explicitly rather than through `rejects.toThrow`.
       * The matcher walks the `cause` chain, so it still passed when the
       * procedure replaced the sentence with "something went wrong" — the
       * original was underneath, and the mutation proving this line came back
       * green because of it.
       */
      try {
        await as(lincolnHead).lti.syncRoster({ contextId: contextRowId });
        throw new Error('expected a refusal');
      } catch (error) {
        expect((error as { code?: string }).code).toBe('BAD_REQUEST');
        expect((error as Error).message).toContain('has opened AcuityMath from the LMS yet');
      }
    });

    it('distinguishes the platform failing from the request being wrong', async () => {
      /*
       * A district whose LMS is down has not made a mistake, and an
       * administrator staring at a 400 will go looking for one. The gateway
       * status says where the fault is.
       */
      await db.update(schema.ltiContexts).set({ membershipsUrl: 'https://nowhere.invalid/x' });
      members = [teacherRow, pupilRow];

      await expect(
        as(lincolnHead).lti.syncRoster({ contextId: contextRowId }),
      ).rejects.toThrow(/platform could not be read/);
    });
  });

  describe('listing what could be synchronised', () => {
    it('shows the district its own courses', async () => {
      const courses = await as(lincolnHead).lti.courses({ institutionId: lincoln.id });

      expect(courses).toHaveLength(1);
      expect(courses[0]).toMatchObject({
        contextId: 'ctx-1',
        title: 'Year 4 Maths',
        canSync: true,
        knowsYearGroup: true,
      });
      expect(courses[0].lastSyncedAt).toBeNull();
    });

    it('says plainly what is missing rather than leaving it to a failure', async () => {
      /*
       * These are the two things that stop a sync and the two things only an
       * administrator can fix — the roster URL by enabling the scope, the year
       * group by adding a custom parameter to the placement.
       */
      await db
        .update(schema.ltiContexts)
        .set({ membershipsUrl: null, defaultBirthYear: null });

      const [course] = await as(lincolnHead).lti.courses({ institutionId: lincoln.id });
      expect(course.canSync).toBe(false);
      expect(course.knowsYearGroup).toBe(false);
    });

    it('shows another district nothing of this one', async () => {
      await expect(
        as(riversideHead).lti.courses({ institutionId: lincoln.id }),
      ).rejects.toThrow(/Administrators of this institution/);
    });

    it('records the sync it just ran', async () => {
      members = [teacherRow, pupilRow];
      await as(lincolnHead).lti.syncRoster({ contextId: contextRowId });

      const [course] = await as(lincolnHead).lti.courses({ institutionId: lincoln.id });
      expect(course.lastSyncedAt).not.toBeNull();
      expect(course.classroomId).not.toBeNull();
    });
  });
});
