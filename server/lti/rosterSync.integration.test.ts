// @vitest-environment node

/**
 * What a roster sync is allowed to do to a child.
 *
 * Every other part of Track C answers somebody who is present and waiting. **A
 * sync runs with nobody in the room.** Whatever it does to a child's record it
 * does unobserved, which is why almost every case below asserts something it
 * did *not* do.
 *
 * The one that matters most: **an empty roster removes nobody.** A platform
 * erroring mid-request, a scope revoked, a course archived at their end — each
 * returns zero members, and each is indistinguishable from a class of thirty
 * children leaving at once.
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
import { signAgreement, withdrawAgreement } from '../learning/institutionAgreements';
import { consentStatusFor } from '../learning/consent';
import { recordingPermission } from '../learning/consentGate';
import { INSTITUTIONAL_AGREEMENT_VERSION } from '../../src/data/institutionalAgreement';
import { addDeployment } from './platforms';
import { syncRoster, SyncRefused } from './rosterSync';

const DATABASE_URL = process.env.DATABASE_URL;
if (process.env.CI && !DATABASE_URL) {
  throw new Error('DATABASE_URL is unset in CI; this suite would skip while covering nothing.');
}
const describeWithDb = DATABASE_URL ? describe : describe.skip;

const LEARNER = 'http://purl.imsglobal.org/vocab/lis/v2/membership#Learner';
const INSTRUCTOR = 'http://purl.imsglobal.org/vocab/lis/v2/membership#Instructor';

describeWithDb('synchronising a class roster', () => {
  let harness: TestDatabase;
  let db: MySql2Database<typeof schema>;
  let lms: Server;
  let base: string;
  let lincoln: { id: number };
  let platformId: number;
  let contextRowId: number;
  let teacherUserId: number;
  let members: unknown[] = [];

  beforeAll(async () => {
    harness = await createTestDatabase('ltirostersync');

    lms = createServer((req, res) => {
      const url = new URL(req.url ?? '/', base);
      if (url.pathname === '/token') {
        let body = '';
        req.on('data', c => {
          body += c;
        });
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

  beforeEach(async () => {
    await harness.reset();
    db = harness.db;
    members = [];

    lincoln = await createInstitution(db, 'Lincoln Unified');
    const head = await addMember(db, lincoln.id, 'head@lincoln.test', 'institution_admin');
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
    platformId = platform.id;

    const deployment = await addDeployment(db, platformId, 'dep-1', lincoln.id);

    await db.insert(schema.ltiContexts).values({
      deploymentId: deployment.id,
      contextId: 'ctx-1',
      title: 'Year 4 Maths',
      membershipsUrl: `${base}/memberships`,
      defaultBirthYear: 2016,
    });
    const [context] = await db.select().from(schema.ltiContexts).limit(1);
    contextRowId = context.id;

    // A teacher who has already launched once. Without one, a sync refuses —
    // asserted separately below.
    const teacher = await addMember(db, lincoln.id, 'teacher@lincoln.test', 'teacher');
    teacherUserId = teacher.userId;
    await db.insert(schema.ltiIdentities).values({
      platformId,
      subject: 'teacher-sub',
      userId: teacher.userId,
    });
  });

  const teacherRow = { user_id: 'teacher-sub', roles: [INSTRUCTOR], name: 'Ada Teacher' };
  const pupil = (id: string, extra: Record<string, unknown> = {}) => ({
    user_id: id,
    roles: [LEARNER],
    name: `Pupil ${id}`,
    ...extra,
  });

  const enrolments = async () =>
    db.select().from(schema.classroomLearners);
  const learners = async () => db.select().from(schema.learners);

  /**
   * Always forced, because these cases are about reconciliation across repeated
   * syncs rather than about the cooldown.
   *
   * C4d added a five-minute cooldown so a double-clicked button is not two full
   * roster reads against a district's LMS. Every case here that syncs twice means
   * "deliberately again", which is precisely what `force` says — and the cooldown
   * itself is proved in `syncTrigger.integration.test.ts`, where it belongs.
   */
  const sync = (now?: Date) => syncRoster(db, contextRowId, now ?? new Date(), { force: true });

  async function reasonFor(promise: Promise<unknown>): Promise<string> {
    try {
      await promise;
      return 'synced';
    } catch (error) {
      if (error instanceof SyncRefused) return error.reason;
      throw error;
    }
  }

  describe('a first sync', () => {
    it('brings the class across, consented', async () => {
      members = [teacherRow, pupil('p-1'), pupil('p-2')];

      const result = await sync();

      expect(result.created).toBe(2);
      expect(result.enrolled).toBe(0);
      expect(await enrolments()).toHaveLength(2);

      const rows = await learners();
      expect(rows).toHaveLength(2);
      for (const row of rows) {
        expect(row.institutionId).toBe(lincoln.id);
        expect(row.guardianId).toBeNull();
        expect(await consentStatusFor(db, row.id)).toBe('granted');
        expect((await recordingPermission(db, row.id)).mayRecord).toBe(true);
      }
    });

    it('makes one classroom and attaches it to the course', async () => {
      members = [teacherRow, pupil('p-1')];
      const result = await sync();

      const [classroom] = await db.select().from(schema.classrooms);
      expect(classroom.id).toBe(result.classroomId);
      expect(classroom.teacherId).toBe(teacherUserId);
      expect(classroom.name).toBe('Year 4 Maths');

      const [context] = await db.select().from(schema.ltiContexts);
      expect(context.classroomId).toBe(classroom.id);
    });

    it('does not rename a class a teacher renamed', async () => {
      // A teacher renaming their class has said something about their own
      // classroom. Overwriting it every night would make the edit pointless.
      members = [teacherRow, pupil('p-1')];
      await sync();
      await db.update(schema.classrooms).set({ name: 'Maths — Set 1' });

      await sync();
      const classrooms = await db.select().from(schema.classrooms);
      // One classroom, not a second one alongside it. Without this the test
      // passes even when every sync makes a fresh class and leaves the renamed
      // one orphaned — which is worse than renaming.
      expect(classrooms).toHaveLength(1);
      expect(classrooms[0].name).toBe('Maths — Set 1');
    });

    it('records that it ran, separately from what it changed', async () => {
      members = [teacherRow];
      // A moment just ahead of now, not a fixed date in the past: the district's
      // agreement is signed during setup, and a sync dated before it is a sync
      // with no agreement in force — which is the guard working, not this case.
      await sync(new Date(Date.now() + 60_000));

      const [context] = await db.select().from(schema.ltiContexts);
      expect(context.lastSyncedAt).not.toBeNull();
    });
  });

  describe('a second sync', () => {
    it('creates nobody twice', async () => {
      members = [teacherRow, pupil('p-1'), pupil('p-2')];
      await sync();
      const result = await sync();

      expect(result.created).toBe(0);
      expect(await learners()).toHaveLength(2);
      expect(await enrolments()).toHaveLength(2);
    });

    it('enrols a pupil the district already had without creating them again', async () => {
      members = [teacherRow, pupil('p-1')];
      await sync();

      members = [teacherRow, pupil('p-1'), pupil('p-2')];
      const result = await sync();

      expect(result.created).toBe(1);
      expect(result.enrolled).toBe(0);
      expect(await learners()).toHaveLength(2);
    });
  });

  describe('somebody leaving', () => {
    it('is unenrolled, and nothing else', async () => {
      /*
       * **The rule this module exists for.** The child, their attempts, their
       * mastery and their consent record all remain exactly as they were. A
       * pupil who left a class has not left the district, and a roster is not a
       * request to delete anybody.
       */
      members = [teacherRow, pupil('p-1'), pupil('p-2')];
      await sync();

      members = [teacherRow, pupil('p-1')];
      const result = await sync();

      expect(result.unenrolled).toBe(1);
      expect(await enrolments()).toHaveLength(1);

      const rows = await learners();
      expect(rows).toHaveLength(2);
      expect(rows.every(row => row.archivedAt === null)).toBe(true);
      expect(await db.select().from(schema.consentEvents)).toHaveLength(2);
    });

    it('is unenrolled when the platform marks them inactive rather than dropping them', async () => {
      members = [teacherRow, pupil('p-1'), pupil('p-2')];
      await sync();

      members = [teacherRow, pupil('p-1'), pupil('p-2', { status: 'Inactive' })];
      const result = await sync();

      expect(result.unenrolled).toBe(1);
      expect(await learners()).toHaveLength(2);
    });

    it('can come back without being created twice', async () => {
      members = [teacherRow, pupil('p-1')];
      await sync();
      members = [teacherRow];
      await sync();

      members = [teacherRow, pupil('p-1')];
      const result = await sync();

      expect(result.created).toBe(0);
      expect(result.enrolled).toBe(1);
      expect(await learners()).toHaveLength(1);
    });
  });

  describe('an empty roster', () => {
    it('removes nobody', async () => {
      /*
       * **The most important assertion here.** A platform erroring mid-request,
       * a scope revoked, a course archived at their end — every one returns zero
       * members, and every one is indistinguishable from a class of thirty
       * children leaving at once. Acting on it is how a sync empties a school.
       */
      members = [teacherRow, pupil('p-1'), pupil('p-2')];
      await sync();

      members = [];
      await expect(reasonFor(sync())).resolves.toBe('no_known_teacher');

      expect(await enrolments()).toHaveLength(2);
      expect(await learners()).toHaveLength(2);
    });

    it('removes nobody even when the teacher is still listed', async () => {
      // The teacher alone is enough to get past the classroom check, so this is
      // the case where the emptiness is about pupils specifically.
      members = [teacherRow, pupil('p-1'), pupil('p-2')];
      await sync();

      members = [teacherRow];
      const result = await sync();

      expect(result.unenrolled).toBe(2);
      expect(await learners()).toHaveLength(2);
    });
  });

  describe('staff on the roster', () => {
    it('are never given accounts by a sync', async () => {
      /*
       * A launch creates an adult account because a person is there, clicking. A
       * roster arriving overnight that mints teacher accounts is an LMS deciding
       * who has access to children's data here, with nobody deciding anything.
       */
      members = [
        teacherRow,
        { user_id: 'new-teacher', roles: [INSTRUCTOR], name: 'Unknown', email: 'new@lincoln.test' },
        pupil('p-1'),
      ];

      const result = await sync();

      expect(result.unknownStaff).toBe(1);
      const users = await db.select().from(schema.users);
      expect(users.map(u => u.email)).not.toContain('new@lincoln.test');

      /*
       * And not quietly made a child instead, which is the failure that would
       * follow from treating everyone on a roster as a pupil. Only `p-1` is a
       * learner; the unknown teacher is neither.
       */
      const rows = await learners();
      expect(rows).toHaveLength(1);
      expect(rows[0].displayName).toBe('Pupil p-1');
    });

    it('are never enrolled as pupils', async () => {
      members = [teacherRow, pupil('p-1')];
      await sync();

      const enrolled = await enrolments();
      const [learner] = await learners();
      expect(enrolled).toHaveLength(1);
      expect(enrolled[0].learnerId).toBe(learner.id);
    });

    it('refuse the whole sync when none of them is known here', async () => {
      // A classroom needs a teacher and this product will not invent one. The
      // message names the one thing that fixes it.
      await db.delete(schema.ltiIdentities);
      members = [teacherRow, pupil('p-1')];

      expect(await reasonFor(sync())).toBe('no_known_teacher');
      expect(await learners()).toHaveLength(0);
    });
  });

  describe('a pupil this product cannot safely take', () => {
    it('is skipped when the course does not say which year group it is for', async () => {
      // The same refusal C3f makes at a launch: no roster carries a birth date,
      // and the alternative to knowing is a made-up year in a child's record.
      await db.update(schema.ltiContexts).set({ defaultBirthYear: null });
      members = [teacherRow, pupil('p-1')];

      const result = await sync();

      expect(result.created).toBe(0);
      expect(result.skipped).toBe(1);
      expect(await learners()).toHaveLength(0);
    });

    it('is skipped rather than restored when their records were removed', async () => {
      /*
       * Somebody asked for those records to be deleted. A roster listing them
       * again is the platform's opinion, not a withdrawal of that request.
       */
      members = [teacherRow, pupil('p-1')];
      await sync();
      await db.update(schema.learners).set({ archivedAt: new Date(), archivedReason: 'requested' });
      await db.delete(schema.classroomLearners);

      const result = await sync();

      expect(result.skipped).toBe(1);
      expect(result.created).toBe(0);
      expect(await enrolments()).toHaveLength(0);
    });

    it('is skipped when the same subject is already a member of staff here', async () => {
      // A role claim disagreeing with a roster is not a reason to turn an adult
      // into a child.
      members = [teacherRow, { user_id: 'teacher-sub', roles: [LEARNER], name: 'Confused' }];

      const result = await sync();
      expect(result.created).toBe(0);
      expect(await learners()).toHaveLength(0);
    });
  });

  describe('before anything is read', () => {
    it('refuses a district whose agreement has lapsed', async () => {
      /*
       * Checked before the roster is fetched. Finding out afterwards would mean
       * we had already held a list of children's names for no permitted purpose.
       */
      const [agreement] = await db.select().from(schema.institutionAgreements);
      await withdrawAgreement(db, agreement.id);
      members = [teacherRow, pupil('p-1')];

      expect(await reasonFor(sync())).toBe('no_agreement');
      expect(await learners()).toHaveLength(0);
    });

    it('refuses a course with no roster endpoint on record', async () => {
      await db.update(schema.ltiContexts).set({ membershipsUrl: null });
      expect(await reasonFor(sync())).toBe('no_roster');
    });
  });
});
