// @vitest-environment node

/**
 * A district's SIS becoming schools, classes and children.
 *
 * Every assertion here is about **what a sync must not do**, because a sync runs
 * with nobody in the room. The three rules C4c settled are restated against this
 * code rather than assumed from it: no child is archived, no adult account is
 * created, and an archived pupil is never restored.
 *
 * The fake SIS serves the four collections and can be edited between runs, which
 * is how the second-run assertions — idempotency, a departure, a leaver — are
 * made without a second fixture.
 */

import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { and, eq } from 'drizzle-orm';
import type { MySql2Database } from 'drizzle-orm/mysql2';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import * as schema from '../../drizzle/schema';
import { createTestDatabase, type TestDatabase } from '../test-support/database';
import { createInstitution } from '../learning/institutions';
import { signAgreement } from '../learning/institutionAgreements';
import { INSTITUTIONAL_AGREEMENT_VERSION } from '../../src/data/institutionalAgreement';
import { registerProvider } from './providers';
import { syncDistrict, SyncRefused } from './sync';

const DATABASE_URL = process.env.DATABASE_URL;
if (process.env.CI && !DATABASE_URL) {
  throw new Error('DATABASE_URL is unset in CI; this suite would skip while covering nothing.');
}
const describeWithDb = DATABASE_URL ? describe : describe.skip;

const KEY = Buffer.alloc(32, 11).toString('base64');
const SECRET = 'sis-secret';
const NOW = new Date('2026-03-01T12:00:00Z');

type Row = Record<string, unknown>;

interface Sis {
  orgs: Row[];
  classes: Row[];
  users: Row[];
  enrollments: Row[];
}

describeWithDb('synchronising a district from its SIS', () => {
  let harness: TestDatabase;
  let db: MySql2Database<typeof schema>;
  let sis: Server;
  let base: string;
  let lincoln: { id: number };
  let data: Sis;
  let originalKey: string | undefined;
  let tokenCounter = 0;
  let overstateTotals = false;
  let omitTotals = false;

  beforeAll(async () => {
    harness = await createTestDatabase('onerostersync');

    sis = createServer((req, res) => {
      const url = new URL(req.url ?? '/', base);

      if (url.pathname === '/token') {
        req.on('data', () => {});
        req.on('end', () => {
          tokenCounter += 1;
          res.setHeader('content-type', 'application/json');
          res.end(JSON.stringify({ access_token: `tok-${tokenCounter}`, expires_in: 3600 }));
        });
        return;
      }

      const collection = url.pathname.split('/').pop() ?? '';
      const rows = (data as unknown as Record<string, Row[]>)[collection];
      if (!rows) {
        res.statusCode = 404;
        res.end(JSON.stringify({ error: 'no such collection' }));
        return;
      }

      const limit = Number(url.searchParams.get('limit') ?? '100');
      const offset = Number(url.searchParams.get('offset') ?? '0');

      /*
       * `X-Total-Count`, which is how a provider says how big a collection is.
       * `overstateTotals` makes it disagree with what actually arrives, which is
       * what a collection changing underneath a paged read looks like from here;
       * `omitTotals` is the provider that never sends it at all.
       */
      if (!omitTotals) {
        res.setHeader('x-total-count', String(rows.length + (overstateTotals ? 1 : 0)));
      }
      res.setHeader('content-type', 'application/json');
      res.end(JSON.stringify({ [collection]: rows.slice(offset, offset + limit) }));
    });

    await new Promise<void>(resolve => sis.listen(0, '127.0.0.1', resolve));
    base = `http://127.0.0.1:${(sis.address() as AddressInfo).port}`;
  }, 60_000);

  afterAll(async () => {
    await new Promise<void>(resolve => sis?.close(() => resolve()));
    await harness?.close();
  });

  beforeEach(async () => {
    await harness.reset();
    db = harness.db;

    originalKey = process.env.ONEROSTER_CREDENTIAL_KEY;
    process.env.ONEROSTER_CREDENTIAL_KEY = KEY;

    overstateTotals = false;
    omitTotals = false;

    lincoln = await createInstitution(db, 'Lincoln Unified');

    /* A district, a campus, one teacher, two pupils, one class. */
    data = {
      orgs: [
        { sourcedId: 'org-district', type: 'district', name: 'Lincoln Unified' },
        { sourcedId: 'org-elm', type: 'school', name: 'Elm Street Elementary' },
      ],
      classes: [
        {
          sourcedId: 'cls-4a',
          title: 'Grade 4 Mathematics',
          school: { sourcedId: 'org-elm' },
        },
      ],
      users: [
        {
          sourcedId: 'usr-teacher',
          role: 'teacher',
          givenName: 'Ada',
          familyName: 'Lovelace',
          email: 'ada@lincoln.test',
        },
        {
          sourcedId: 'usr-bram',
          role: 'student',
          givenName: 'Bram',
          familyName: 'Stoker',
          grades: ['04'],
        },
        {
          sourcedId: 'usr-cleo',
          role: 'student',
          givenName: 'Cleo',
          familyName: 'Nguyen',
          grades: ['04'],
        },
      ],
      enrollments: [
        { sourcedId: 'enr-1', role: 'teacher', class: { sourcedId: 'cls-4a' }, user: { sourcedId: 'usr-teacher' } },
        { sourcedId: 'enr-2', role: 'student', class: { sourcedId: 'cls-4a' }, user: { sourcedId: 'usr-bram' } },
        { sourcedId: 'enr-3', role: 'student', class: { sourcedId: 'cls-4a' }, user: { sourcedId: 'usr-cleo' } },
      ],
    };
  });

  afterEach(() => {
    if (originalKey === undefined) delete process.env.ONEROSTER_CREDENTIAL_KEY;
    else process.env.ONEROSTER_CREDENTIAL_KEY = originalKey;
  });

  /** An adult this product already knows, affiliated with the district. */
  async function knownTeacher(institutionId: number | null = lincoln.id) {
    await db
      .insert(schema.users)
      .values({ email: 'ada@lincoln.test', role: 'teacher', institutionId });
    const [row] = await db
      .select()
      .from(schema.users)
      .where(eq(schema.users.email, 'ada@lincoln.test'))
      .limit(1);
    return row;
  }

  /** An agreement in force, signed by this district's own head. */
  async function agree() {
    await db.insert(schema.users).values({
      email: 'head@lincoln.test',
      /*
       * `institution_admin`, not `admin`. C3e deliberately does not wave a
       * *platform* administrator through this gate: reading a district's data
       * to support them is one thing, agreeing to terms on their behalf is
       * another. Writing `admin` here failed, which is the gate working.
       */
      role: 'institution_admin',
      institutionId: lincoln.id,
    });
    const [head] = await db
      .select()
      .from(schema.users)
      .where(eq(schema.users.email, 'head@lincoln.test'))
      .limit(1);

    await signAgreement(
      db,
      {
        institutionId: lincoln.id,
        signedByUserId: head.id,
        signatoryName: 'Grace Hopper',
        signatoryTitle: 'Head of School',
        agreementVersion: INSTITUTIONAL_AGREEMENT_VERSION,
      },
      new Date(NOW.getTime() - 60_000),
    );
  }

  const register = () =>
    registerProvider(db, {
      institutionId: lincoln.id,
      name: 'PowerSchool',
      baseUrl: `${base}/v1p2`,
      tokenUrl: `${base}/token`,
      clientId: 'acuity',
      clientSecret: SECRET,
      scopes: 'roster-core.readonly',
    });

  async function setUp() {
    await agree();
    await register();
    return knownTeacher();
  }

  describe('the hierarchy', () => {
    it('creates a campus from a school org and ignores the district org', async () => {
      /*
       * A `district` org **is** the institution, which exists already. Creating
       * a campus for it would give every district a phantom school named after
       * itself, and every class would then have two plausible homes.
       */
      await setUp();
      const result = await syncDistrict(db, lincoln.id, NOW);

      const schools = await db.select().from(schema.schools);
      expect(schools).toHaveLength(1);
      expect(schools[0].name).toBe('Elm Street Elementary');
      expect(result.schoolsCreated).toBe(1);
    });

    it('matches a campus somebody typed in rather than creating a second', async () => {
      // A district that added "Elm Street Elementary" before connecting their
      // SIS should end with one campus. `school_name_idx` would refuse the
      // second anyway, with a message about an index.
      await setUp();
      await db
        .insert(schema.schools)
        .values({ institutionId: lincoln.id, name: 'Elm Street Elementary' });

      const result = await syncDistrict(db, lincoln.id, NOW);

      expect(await db.select().from(schema.schools)).toHaveLength(1);
      expect(result.schoolsCreated).toBe(0);
      expect(result.schoolsMatched).toBe(1);
    });

    it('puts the class on its campus', async () => {
      await setUp();
      await syncDistrict(db, lincoln.id, NOW);

      const [classroom] = await db.select().from(schema.classrooms);
      const [school] = await db.select().from(schema.schools);
      expect(classroom.schoolId).toBe(school.id);
      expect(classroom.name).toBe('Grade 4 Mathematics');
    });
  });

  describe('children', () => {
    it('creates pupils with a birth year read from their grade', async () => {
      /*
       * **What OneRoster gives that NRPS does not.** C4c must refuse any pupil
       * unless the course was launched carrying a `grade_level`; a SIS carries
       * grades as a matter of course.
       */
      await setUp();
      const result = await syncDistrict(db, lincoln.id, NOW);

      const learners = await db.select().from(schema.learners);
      expect(learners).toHaveLength(2);
      expect(learners.every(learner => learner.birthYear === 2026 - 10)).toBe(true);
      expect(result.pupilsCreated).toBe(2);
    });

    it('names a child by given name and initial, not their full legal name', async () => {
      /*
       * The SIS holds the full name; this product does not need it. A surname
       * adds nothing to telling two children apart in a class of thirty, and a
       * great deal to what a leaked screenshot discloses.
       */
      await setUp();
      await syncDistrict(db, lincoln.id, NOW);

      const names = (await db.select().from(schema.learners)).map(l => l.displayName).sort();
      expect(names).toEqual(['Bram S.', 'Cleo N.']);
    });

    it('consents each child as it creates them, one row each', async () => {
      /*
       * `learnerIds` named explicitly, as C4c does. Omitting it consents for
       * **every pupil the district owns** — right for an administrator
       * accepting terms, catastrophic in a loop, where the thousandth child
       * would rewrite a thousand ledger rows.
       */
      await setUp();
      await syncDistrict(db, lincoln.id, NOW);

      const learners = await db.select().from(schema.learners);
      for (const learner of learners) {
        const events = await db
          .select()
          .from(schema.consentEvents)
          .where(eq(schema.consentEvents.learnerId, learner.id));
        expect(events).toHaveLength(1);
        expect(events[0].method).toBe('institutional_agreement');
      }
    });

    it('skips a pupil whose grade it cannot read, and counts why', async () => {
      // Never a guessed birth year. That record decides what mathematics the
      // child sees and whether the consent gate treats them as under thirteen.
      await setUp();
      data.users[1].grades = ['Year 4'];

      const result = await syncDistrict(db, lincoln.id, NOW);

      expect(result.pupilsCreated).toBe(1);
      expect(result.skipped.no_usable_grade).toBe(1);
    });

    it('does not bring across a pupil the SIS has marked as gone', async () => {
      await setUp();
      data.users[1].status = 'tobedeleted';

      const result = await syncDistrict(db, lincoln.id, NOW);

      expect(result.pupilsCreated).toBe(1);
      expect(result.skipped.left_the_district).toBe(1);
    });

    it('treats an unrecognised status as present', async () => {
      /*
       * The opposite of C4c's rule, deliberately. OneRoster defines the
       * vocabulary, so an odd value is a district writing something else rather
       * than an unknowable platform term — and here the cheap direction is to
       * keep the child, because this sync never deletes.
       */
      await setUp();
      data.users[1].status = 'enrolled';

      const result = await syncDistrict(db, lincoln.id, NOW);
      expect(result.pupilsCreated).toBe(2);
    });
  });

  describe('adults', () => {
    it('never creates an account, and counts the class it could not place', async () => {
      /*
       * **The rule that matters most here.** A nightly file that mints teacher
       * accounts is a SIS deciding who may read children's data in this
       * product, with nobody deciding anything.
       */
      await agree();
      await register();
      // No teacher account exists. The district's own head does, because
      // somebody had to sign the agreement — so the assertion counts accounts
      // before and after rather than counting them all.
      const before = (await db.select().from(schema.users)).length;

      const result = await syncDistrict(db, lincoln.id, NOW);

      expect(await db.select().from(schema.users)).toHaveLength(before);
      expect(
        await db.select().from(schema.users).where(eq(schema.users.email, 'ada@lincoln.test')),
      ).toHaveLength(0);
      expect(await db.select().from(schema.classrooms)).toHaveLength(0);
      expect(result.classesWithoutKnownTeacher).toBe(1);
    });

    it('refuses to link an adult who is not affiliated with this district', async () => {
      /*
       * C3c's `unaffiliated` refusal restated. A matching address in somebody
       * else's file must not pull a private account into a district's reach.
       */
      await agree();
      await register();
      await knownTeacher(null);

      const result = await syncDistrict(db, lincoln.id, NOW);

      expect(result.classesWithoutKnownTeacher).toBe(1);
      expect(await db.select().from(schema.onerosterIdentities)).toHaveLength(2);
    });

    it('links a teacher who already belongs to the district', async () => {
      const teacher = await setUp();
      await syncDistrict(db, lincoln.id, NOW);

      const [classroom] = await db.select().from(schema.classrooms);
      expect(classroom.teacherId).toBe(teacher.id);
    });

    it('does not change the role of the adult it links', async () => {
      // Linking says "this SIS identifier is that person". It says nothing
      // about what they may do here.
      await agree();
      await register();
      await db
        .insert(schema.users)
        .values({ email: 'ada@lincoln.test', role: 'parent', institutionId: lincoln.id });

      await syncDistrict(db, lincoln.id, NOW);

      const [adult] = await db
        .select()
        .from(schema.users)
        .where(eq(schema.users.email, 'ada@lincoln.test'));
      expect(adult.role).toBe('parent');
    });
  });

  describe('enrolment', () => {
    it('enrols the class’s pupils', async () => {
      await setUp();
      const result = await syncDistrict(db, lincoln.id, NOW);

      expect(await db.select().from(schema.classroomLearners)).toHaveLength(2);
      expect(result.enrolled).toBe(2);
    });

    it('unenrols a departure without touching anything else about them', async () => {
      /*
       * **A child who left a class keeps every answer they ever gave.** What
       * changes is which list a teacher sees them on. A sync reading a
       * departure as a deletion would let a SIS erase a term's work by dropping
       * one row.
       */
      await setUp();
      await syncDistrict(db, lincoln.id, NOW);

      data.enrollments = data.enrollments.filter(row => row.sourcedId !== 'enr-3');
      const result = await syncDistrict(db, lincoln.id, NOW);

      expect(result.unenrolled).toBe(1);
      expect(await db.select().from(schema.classroomLearners)).toHaveLength(1);

      const cleo = (await db.select().from(schema.learners)).find(
        l => l.displayName === 'Cleo N.',
      );
      expect(cleo).toBeDefined();
      expect(cleo?.archivedAt).toBeNull();
    });

    it('never archives a child', async () => {
      await setUp();
      await syncDistrict(db, lincoln.id, NOW);

      data.users = data.users.filter(row => row.sourcedId !== 'usr-cleo');
      data.enrollments = data.enrollments.filter(row => row.sourcedId !== 'enr-3');
      await syncDistrict(db, lincoln.id, NOW);

      const archived = (await db.select().from(schema.learners)).filter(l => l.archivedAt !== null);
      expect(archived).toHaveLength(0);
    });

    it('will not enrol a child who now belongs to another district', async () => {
      /*
       * **Unreachable through any surface today**, and tested directly because
       * of it — the same reasoning as `tablesLeftBehind` in E3 and the refusal
       * escaping in C3c. Nothing in this product moves a learner between
       * districts, so the identity row and the learner always agree.
       *
       * The state is representable in the database, though, and the cost of the
       * guard's absence is not small: Lincoln's nightly sync would enrol a child
       * who is now another district's pupil into a Lincoln classroom, where a
       * Lincoln teacher would see their name and their work.
       *
       * Found by mutation. Deleting the check changed no test, because every
       * other case stops earlier.
       */
      await setUp();
      await syncDistrict(db, lincoln.id, NOW);

      const elsewhere = await createInstitution(db, 'Madison Unified');
      const [bram] = await db
        .select()
        .from(schema.learners)
        .where(eq(schema.learners.displayName, 'Bram S.'));
      await db
        .update(schema.learners)
        .set({ institutionId: elsewhere.id })
        .where(eq(schema.learners.id, bram.id));
      await db
        .delete(schema.classroomLearners)
        .where(eq(schema.classroomLearners.learnerId, bram.id));

      const result = await syncDistrict(db, lincoln.id, NOW);

      expect(result.skipped.belongs_to_another_district).toBe(1);
      expect(
        await db
          .select()
          .from(schema.classroomLearners)
          .where(eq(schema.classroomLearners.learnerId, bram.id)),
      ).toHaveLength(0);
    });

    it('skips a pupil a person archived, and never restores them', async () => {
      /*
       * Somebody hid this child through a surface. A roster listing them again
       * is the SIS's opinion, not a withdrawal of that decision — and D3 made
       * this the *narrow* case rather than the general one: a sync may restore
       * a child **it** archived, and may not touch one a person did.
       *
       * `archived_reason` is what separates them. Setting `archivedAt` alone now
       * violates `learner_archival_has_a_reason`, which is how this test found
       * out that it had been describing a state the database no longer allows.
       */
      await setUp();
      await syncDistrict(db, lincoln.id, NOW);

      const [bram] = await db
        .select()
        .from(schema.learners)
        .where(eq(schema.learners.displayName, 'Bram S.'));
      await db
        .update(schema.learners)
        .set({ archivedAt: NOW, archivedReason: 'requested' })
        .where(eq(schema.learners.id, bram.id));
      await db
        .delete(schema.classroomLearners)
        .where(eq(schema.classroomLearners.learnerId, bram.id));

      const result = await syncDistrict(db, lincoln.id, NOW);

      expect(result.skipped.archived).toBe(1);
      const [after] = await db
        .select()
        .from(schema.learners)
        .where(eq(schema.learners.id, bram.id));
      expect(after.archivedAt).not.toBeNull();
      expect(
        await db
          .select()
          .from(schema.classroomLearners)
          .where(eq(schema.classroomLearners.learnerId, bram.id)),
      ).toHaveLength(0);
    });
  });

  describe('a pupil the SIS says has left', () => {
    it('is deactivated, which C4c forbade and E3 made correct', async () => {
      /*
       * **The rule D3 replaced.** C4c says a sync must never archive a child,
       * because "archiving is what this product does when somebody asks for a
       * child's records to be removed." That was true when written. E3 changed
       * it: the schema now says archiving is for a child who has stopped —
       * "they left the school, the family paused, **a roster no longer lists
       * them**" — and that deletion is the other thing. The rule outlived its
       * reason, and D2 carried it forward.
       */
      await setUp();
      await syncDistrict(db, lincoln.id, NOW);

      data.users[1].status = 'tobedeleted';
      const result = await syncDistrict(db, lincoln.id, NOW);

      const [bram] = await db
        .select()
        .from(schema.learners)
        .where(eq(schema.learners.displayName, 'Bram S.'));
      expect(bram.archivedAt).not.toBeNull();
      expect(bram.archivedReason).toBe('roster_departure');
      expect(result.archived).toBe(1);
    });

    it('keeps every answer they ever gave', async () => {
      // Deactivated, not deleted. That distinction is the whole of E3, and a
      // roster is not a request to erase anybody.
      await setUp();
      await syncDistrict(db, lincoln.id, NOW);

      const [bram] = await db
        .select()
        .from(schema.learners)
        .where(eq(schema.learners.displayName, 'Bram S.'));
      await db.insert(schema.practiceSessions).values({ learnerId: bram.id, targetLength: 8 });

      data.users[1].status = 'tobedeleted';
      await syncDistrict(db, lincoln.id, NOW);

      expect(
        await db
          .select()
          .from(schema.practiceSessions)
          .where(eq(schema.practiceSessions.learnerId, bram.id)),
      ).toHaveLength(1);
    });

    it('comes off every class list as well', async () => {
      /*
       * A child hidden from surfaces who is still enrolled would appear in a
       * teacher's count and nowhere else — the kind of discrepancy nobody can
       * explain a term later.
       */
      await setUp();
      await syncDistrict(db, lincoln.id, NOW);

      data.users[1].status = 'tobedeleted';
      await syncDistrict(db, lincoln.id, NOW);

      const [bram] = await db
        .select()
        .from(schema.learners)
        .where(eq(schema.learners.displayName, 'Bram S.'));
      expect(
        await db
          .select()
          .from(schema.classroomLearners)
          .where(eq(schema.classroomLearners.learnerId, bram.id)),
      ).toHaveLength(0);
    });

    it('comes off a class the SIS has also stopped listing', async () => {
      /*
       * **Found by mutation, and the reason the archival does its own
       * unenrolment.** Deleting that line changed nothing in any other test,
       * because the class loop had already unenrolled the leaver — a pupil
       * whose status is not current never reaches `shouldBeEnrolled`.
       *
       * It is not dead code, though. The class loop only visits classes the SIS
       * still lists. When a term ends both the class and the pupil disappear
       * together, nothing walks that classroom, and without this delete the
       * child would stay enrolled in it while being hidden from every surface —
       * counted in a teacher's class size and visible nowhere.
       *
       * So a second class is needed to reach it: one that survives, keeping the
       * roster non-empty, and one that goes.
       */
      data.classes.push({
        sourcedId: 'cls-5b',
        title: 'Grade 5 Mathematics',
        school: { sourcedId: 'org-elm' },
      });
      data.enrollments.push({
        sourcedId: 'enr-4',
        role: 'teacher',
        class: { sourcedId: 'cls-5b' },
        user: { sourcedId: 'usr-teacher' },
      });
      data.enrollments.push({
        sourcedId: 'enr-5',
        role: 'student',
        class: { sourcedId: 'cls-5b' },
        user: { sourcedId: 'usr-cleo' },
      });

      await setUp();
      await syncDistrict(db, lincoln.id, NOW);
      expect(await db.select().from(schema.classrooms)).toHaveLength(2);

      const [cleo] = await db
        .select()
        .from(schema.learners)
        .where(eq(schema.learners.displayName, 'Cleo N.'));
      const enrolledIn = await db
        .select()
        .from(schema.classroomLearners)
        .where(eq(schema.classroomLearners.learnerId, cleo.id));
      expect(enrolledIn).toHaveLength(2);

      // The term ends: the class and the pupil both stop being listed.
      data.classes = data.classes.filter(row => row.sourcedId !== 'cls-5b');
      data.enrollments = data.enrollments.filter(
        row => row.sourcedId !== 'enr-4' && row.sourcedId !== 'enr-5',
      );
      data.users[2].status = 'tobedeleted';

      const result = await syncDistrict(db, lincoln.id, NOW);

      expect(result.archived).toBe(1);
      expect(
        await db
          .select()
          .from(schema.classroomLearners)
          .where(eq(schema.classroomLearners.learnerId, cleo.id)),
      ).toHaveLength(0);
    });

    it('comes back in one run when the SIS lists them again', async () => {
      /*
       * **And in one run, not two.** The restoration block was written after
       * the enrolment loop, which worked and meant a returning child rejoined
       * their class the *following* night — correct, and a day of a child's
       * week. It now runs before the pupil loop.
       */
      await setUp();
      await syncDistrict(db, lincoln.id, NOW);
      data.users[1].status = 'tobedeleted';
      await syncDistrict(db, lincoln.id, NOW);

      delete data.users[1].status;
      const result = await syncDistrict(db, lincoln.id, NOW);

      const [bram] = await db
        .select()
        .from(schema.learners)
        .where(eq(schema.learners.displayName, 'Bram S.'));
      expect(bram.archivedAt).toBeNull();
      expect(bram.archivedReason).toBeNull();
      expect(result.restored).toBe(1);
      expect(
        await db
          .select()
          .from(schema.classroomLearners)
          .where(eq(schema.classroomLearners.learnerId, bram.id)),
      ).toHaveLength(1);
    });

    it('does not create a second record for them', async () => {
      // The identity link survives the archival, so a returner is the same
      // child rather than a new one with an empty history.
      await setUp();
      await syncDistrict(db, lincoln.id, NOW);
      data.users[1].status = 'tobedeleted';
      await syncDistrict(db, lincoln.id, NOW);
      delete data.users[1].status;
      await syncDistrict(db, lincoln.id, NOW);

      expect(await db.select().from(schema.learners)).toHaveLength(2);
    });
  });

  describe('a read that might be incomplete', () => {
    it('performs no departure when fewer rows arrived than were promised', async () => {
      /*
       * **The question D1 left open on purpose.** OneRoster pages by `limit`
       * and `offset`, so a collection changing under a minute-long read skips
       * records — a pupil created on page three shifts everyone after them back
       * across a boundary already passed. A skipped child and a departed child
       * look identical.
       *
       * So a short read still creates and enrols, which is additive and costs a
       * child who arrives a day late, and performs no departure at all.
       */
      await setUp();
      await syncDistrict(db, lincoln.id, NOW);

      data.users[1].status = 'tobedeleted';
      overstateTotals = true;

      const result = await syncDistrict(db, lincoln.id, NOW);

      expect(result.partial).toBe(true);
      expect(result.archived).toBe(0);

      const [bram] = await db
        .select()
        .from(schema.learners)
        .where(eq(schema.learners.displayName, 'Bram S.'));
      expect(bram.archivedAt).toBeNull();
    });

    it('unenrols nobody on a short read either', async () => {
      // Same reasoning one step down. An enrolment missing from a skipped page
      // is not a child who left the class.
      await setUp();
      await syncDistrict(db, lincoln.id, NOW);

      data.enrollments = data.enrollments.filter(row => row.sourcedId !== 'enr-3');
      overstateTotals = true;

      const result = await syncDistrict(db, lincoln.id, NOW);

      expect(result.partial).toBe(true);
      expect(result.unenrolled).toBe(0);
      expect(await db.select().from(schema.classroomLearners)).toHaveLength(2);
    });

    it('believes a provider that reports no total at all', async () => {
      /*
       * Advisory, not authoritative. Refusing every sync against a provider
       * that omits `X-Total-Count` would refuse a great many of them, so its
       * absence is believed and only a *contradiction* is treated as doubt.
       */
      await setUp();
      omitTotals = true;

      const result = await syncDistrict(db, lincoln.id, NOW);
      expect(result.partial).toBe(false);
      expect(result.pupilsCreated).toBe(2);
    });
  });

  describe('the record of what a run did', () => {
    it('writes a row for a completed run', async () => {
      /*
       * A sync runs with nobody watching. "Why is this child not in her class
       * any more" cannot be answered from the current state, because the
       * current state is the answer and not the reason.
       */
      await setUp();
      const result = await syncDistrict(db, lincoln.id, NOW);

      const [run] = await db.select().from(schema.onerosterSyncRuns);
      expect(run.outcome).toBe('completed');
      expect(run.refusedReason).toBeNull();
      expect(run.partial).toBe(false);
      expect(run.counts).toMatchObject({ pupilsCreated: result.pupilsCreated });
    });

    it('writes a row for a refusal, which is the more important half', async () => {
      /*
       * Three weeks of "nothing changed" is invisible in the data and obvious
       * here. A sync that has been refusing every night since somebody rotated
       * a credential leaves no other trace.
       */
      await setUp();
      await syncDistrict(db, lincoln.id, NOW);
      data.classes = [];

      await expect(syncDistrict(db, lincoln.id, NOW)).rejects.toThrow(SyncRefused);

      const runs = await db.select().from(schema.onerosterSyncRuns);
      expect(runs).toHaveLength(2);
      expect(runs[1].outcome).toBe('refused');
      expect(runs[1].refusedReason).toBe('empty_roster');
    });

    it('records a partial run as partial', async () => {
      await setUp();
      overstateTotals = true;

      await syncDistrict(db, lincoln.id, NOW);

      const [run] = await db.select().from(schema.onerosterSyncRuns);
      expect(run.partial).toBe(true);
    });
  });

  describe('running it twice', () => {
    it('changes nothing the second time', async () => {
      /*
       * The property D3 is named for, asserted here because D2 is where it is
       * either true or not. The `sourcedId` links are what make it true — the
       * alternative is matching on names, which creates a second copy of every
       * child the first time somebody is married or corrected.
       */
      await setUp();
      const first = await syncDistrict(db, lincoln.id, NOW);
      const second = await syncDistrict(db, lincoln.id, NOW);

      expect(first.pupilsCreated).toBe(2);
      expect(second).toMatchObject({
        pupilsCreated: 0,
        enrolled: 0,
        unenrolled: 0,
        schoolsCreated: 0,
        classroomsCreated: 0,
        classroomsMatched: 1,
        schoolsMatched: 1,
      });

      expect(await db.select().from(schema.learners)).toHaveLength(2);
      expect(await db.select().from(schema.schools)).toHaveLength(1);
      expect(await db.select().from(schema.classrooms)).toHaveLength(1);
      expect(await db.select().from(schema.classroomLearners)).toHaveLength(2);
    });

    it('does not consent a child twice', async () => {
      await setUp();
      await syncDistrict(db, lincoln.id, NOW);
      await syncDistrict(db, lincoln.id, NOW);

      const events = await db.select().from(schema.consentEvents);
      expect(events).toHaveLength(2);
    });
  });

  describe('refusals', () => {
    it('will not sync a district with no agreement in force', async () => {
      /*
       * Checked before a single row is read. Finding out afterwards means we
       * have already held a list of children's names for no permitted purpose.
       */
      await register();
      await knownTeacher();

      try {
        await syncDistrict(db, lincoln.id, NOW);
        throw new Error('expected a refusal');
      } catch (error) {
        expect((error as SyncRefused).reason).toBe('no_agreement');
      }
      expect(await db.select().from(schema.learners)).toHaveLength(0);
    });

    it('will not sync a district with no provider', async () => {
      await agree();
      await expect(syncDistrict(db, lincoln.id, NOW)).rejects.toThrow(SyncRefused);
    });

    it('treats an empty class list as a failed read, not an empty district', async () => {
      /*
       * **The guard C4c gets for free and this one does not.** There, zero
       * members means zero staff and the sync stops before removing anything.
       * Here unenrolment is driven by the enrolment list, so an empty read would
       * unenrol every child in the district. A SIS erroring mid-export and a
       * district that has genuinely emptied look identical — and only one of
       * those readings is recoverable.
       */
      await setUp();
      await syncDistrict(db, lincoln.id, NOW);

      data.classes = [];
      data.enrollments = [];

      try {
        await syncDistrict(db, lincoln.id, NOW);
        throw new Error('expected a refusal');
      } catch (error) {
        expect((error as SyncRefused).reason).toBe('empty_roster');
      }

      // Nothing removed.
      expect(await db.select().from(schema.classroomLearners)).toHaveLength(2);
    });

    it('reports a SIS that cannot be reached rather than emptying anything', async () => {
      await agree();
      await registerProvider(db, {
        institutionId: lincoln.id,
        name: 'PowerSchool',
        baseUrl: 'https://127.0.0.1:1/v1p2',
        tokenUrl: 'https://127.0.0.1:1/token',
        clientId: 'acuity',
        clientSecret: SECRET,
        scopes: 'roster-core.readonly',
      });

      await expect(syncDistrict(db, lincoln.id, NOW)).rejects.toThrow(/Could not reach/);
      expect(await db.select().from(schema.learners)).toHaveLength(0);
    });
  });

  describe('the identity rows', () => {
    it('records one person per sourcedId, never both kinds', async () => {
      /*
       * `oneroster_identity_is_one_person` in the database. A link to neither
       * resolves to nobody, which reads as "not seen before" and provisions a
       * second record on every run.
       */
      await setUp();
      await syncDistrict(db, lincoln.id, NOW);

      const identities = await db.select().from(schema.onerosterIdentities);
      expect(identities.length).toBeGreaterThan(0);
      for (const row of identities) {
        expect((row.userId === null) !== (row.learnerId === null)).toBe(true);
      }
    });

    it('does not turn an adult into a child because a role changed', async () => {
      // A role claim disagreeing with what this product already knows is not a
      // reason to create a learner out of a member of staff.
      await setUp();
      await syncDistrict(db, lincoln.id, NOW);

      data.users[0].role = 'student';
      data.users[0].grades = ['04'];

      const result = await syncDistrict(db, lincoln.id, NOW);
      expect(result.skipped.known_here_as_staff).toBe(1);

      const [provider] = await db.select().from(schema.onerosterProviders);
      const [identity] = await db
        .select()
        .from(schema.onerosterIdentities)
        .where(
          and(
            eq(schema.onerosterIdentities.sourcedId, 'usr-teacher'),
            eq(schema.onerosterIdentities.providerId, provider.id),
          ),
        );
      expect(identity.learnerId).toBeNull();
      expect(identity.userId).not.toBeNull();
    });
  });
});
