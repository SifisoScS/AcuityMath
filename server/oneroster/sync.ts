/**
 * Turning a district's SIS into schools, classes and children in this product.
 *
 * **Written as a list of refusals, for the reason C4c was.** A sync runs with
 * nobody in the room — on a schedule, or a button pressed once — and whatever
 * it does to a child's record it does unobserved. Every rule below exists
 * because of what the opposite would cost.
 *
 * The three rules C4c settled hold here unchanged, because they are about
 * *meaning* rather than about NRPS:
 *
 * **A sync never deletes a child and never archives one.** Archiving is what
 * this product does when somebody asks for a child's records to be removed. A
 * roster that stops listing a pupil says they left a class; it does not say
 * anybody asked for anything.
 *
 * **A sync never creates an adult account.** A launch does, because a person is
 * there, clicking. A nightly file that mints teacher accounts is a SIS deciding
 * who may read children's data here, with nobody deciding anything.
 *
 * **A pupil whose record is archived is skipped, never restored.** A roster
 * listing them again is the SIS's opinion, not a withdrawal of the request that
 * archived them.
 *
 * Two things differ from C4c, and both are OneRoster's doing.
 *
 * **The hierarchy arrives, so campuses are real.** NRPS knows one course; a SIS
 * knows the district. `orgs` become `schools` and classes hang off them, which
 * is what `schools` existed for.
 *
 * **Ages arrive**, in `grades`. C4c had to refuse any pupil unless the course
 * was launched carrying a `grade_level`, because a membership list holds no age
 * at all. Here most children can be placed, and the ones who cannot are skipped
 * and counted rather than given a guessed year.
 */

import { and, eq, inArray } from 'drizzle-orm';
import type { MySql2Database } from 'drizzle-orm/mysql2';

import * as schema from '../../drizzle/schema';
import { createDistrictLearner } from '../learning/districtLearners';
import { activeAgreement } from '../learning/institutionAgreements';
import { recordInstitutionalConsent } from '../learning/consent';
import { CONSENT_POLICY_VERSION } from '../../src/data/consentPolicy';
import { readCollection, RosterUnavailable } from './client';
import { providerFor } from './providers';
import { birthYearFromGrades } from './grades';

type Db = MySql2Database<typeof schema>;

export class SyncRefused extends Error {
  readonly reason: string;

  constructor(reason: string, message: string) {
    super(message);
    this.name = 'SyncRefused';
    this.reason = reason;
  }
}

export interface OneRosterSyncResult {
  /** Campuses created by this run. */
  schoolsCreated: number;
  /** Campuses already present and matched to their `sourcedId`. */
  schoolsMatched: number;
  classroomsCreated: number;
  classroomsMatched: number;
  /** Pupils created. */
  pupilsCreated: number;
  /** Pupils already known and newly enrolled somewhere. */
  enrolled: number;
  /** Enrolments removed because the SIS no longer lists them in that class. */
  unenrolled: number;
  /**
   * Classes skipped because nobody teaching them has an account here.
   *
   * Reported rather than resolved. `classrooms.teacher_id` is not nullable and
   * this product will not invent an adult, so a class with no known teacher has
   * nowhere to live — and counting it is how an administrator learns that a
   * colleague needs to sign in once.
   */
  classesWithoutKnownTeacher: number;
  /** Pupils skipped, with a reason each. */
  skipped: Record<string, number>;
}

/** What the sync reads out of a SIS `user` row. It ignores everything else. */
interface SisUser {
  sourcedId: string;
  role: string;
  givenName: string;
  familyName: string;
  email: string | null;
  grades: unknown[] | null;
  status: string | null;
}

/** Statuses meaning the record is current. See `isCurrent`. */
const GONE_STATUSES = new Set(['tobedeleted', 'inactive']);

/**
 * Whether a SIS row is still current.
 *
 * Matched **negatively** here, which is the opposite of C4c's rule and is
 * deliberate. OneRoster defines `status` as `active` or `tobedeleted` and most
 * exports omit it entirely for current records; treating an unknown value as
 * "gone" would empty a district that writes anything else. C4c matched
 * positively because an LTI membership status is the platform's own vocabulary
 * with no defined set — there, an unrecognised value genuinely could mean
 * anything, and unenrolling was the cheap direction to be wrong in.
 *
 * Here the cheap direction is the other one: this sync creates and enrols but
 * never deletes, so reading an odd status as "present" risks an extra enrolment,
 * while reading it as "gone" risks removing a child from a class they attend.
 */
function isCurrent(status: string | null): boolean {
  if (status === null) return true;
  return !GONE_STATUSES.has(status.trim().toLowerCase());
}

function asString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() !== '' ? value.trim() : null;
}

function readUser(row: unknown): SisUser | null {
  if (typeof row !== 'object' || row === null) return null;
  const record = row as Record<string, unknown>;

  const sourcedId = asString(record.sourcedId);
  if (!sourcedId) return null;

  return {
    sourcedId,
    role: (asString(record.role) ?? '').toLowerCase(),
    givenName: asString(record.givenName) ?? '',
    familyName: asString(record.familyName) ?? '',
    email: asString(record.email),
    grades: Array.isArray(record.grades) ? record.grades : null,
    status: asString(record.status),
  };
}

/**
 * What a child is called here.
 *
 * Given name and initial, not the full legal name the SIS holds. This string is
 * shown on a teacher's class list and in a district console, and a surname adds
 * nothing to telling two children apart in a class of thirty while adding a
 * great deal to what a leaked screenshot discloses.
 */
function displayNameFor(user: SisUser): string {
  const given = user.givenName || 'Pupil';
  const initial = user.familyName ? ` ${user.familyName[0].toUpperCase()}.` : '';
  return `${given}${initial}`.slice(0, 100);
}

/**
 * Brings a district's roster across.
 *
 * Reads everything, then decides, then writes — in that order and not
 * interleaved, the same discipline C4c uses. A loop that wrote as it read would
 * leave a half-synchronised district behind whenever a page failed, and "half"
 * is the state nobody can reason about afterwards.
 */
export async function syncDistrict(
  db: Db,
  institutionId: number,
  now: Date = new Date(),
): Promise<OneRosterSyncResult> {
  const provider = await providerFor(db, institutionId);
  if (!provider) {
    throw new SyncRefused(
      'no_provider',
      'This district has no student information system registered.',
    );
  }

  /*
   * Checked before a single row is read, let alone written. A district whose
   * agreement has lapsed must not have its children synchronised in — and
   * finding out afterwards means we have already held a list of their names for
   * no permitted purpose.
   */
  const agreement = await activeAgreement(db, institutionId, now);
  if (!agreement) {
    throw new SyncRefused(
      'no_agreement',
      'This institution has no agreement in force, so its pupils cannot be brought ' +
        'across from its student information system. An administrator needs to ' +
        'accept the terms first.',
    );
  }

  const result: OneRosterSyncResult = {
    schoolsCreated: 0,
    schoolsMatched: 0,
    classroomsCreated: 0,
    classroomsMatched: 0,
    pupilsCreated: 0,
    enrolled: 0,
    unenrolled: 0,
    classesWithoutKnownTeacher: 0,
    skipped: {},
  };

  const skip = (reason: string) => {
    result.skipped[reason] = (result.skipped[reason] ?? 0) + 1;
  };

  const [orgRows, classRows, userRows, enrolmentRows] = [
    await readCollection(db, institutionId, 'orgs'),
    await readCollection(db, institutionId, 'classes'),
    await readCollection(db, institutionId, 'users'),
    await readCollection(db, institutionId, 'enrollments'),
  ];

  /*
   * A district that reports no classes at all is treated as a failed read
   * rather than as an empty district.
   *
   * This is the guard C4c gets *for free* from requiring a known teacher: there,
   * zero members means zero staff, and the sync stops before removing anything.
   * Nothing here provides that — unenrolment is driven by the enrolment list, and
   * an empty one would unenrol every child in the district. A SIS erroring
   * mid-export, a scope revoked, a term rolled over at their end: each returns
   * an empty collection that is indistinguishable from a district that has
   * genuinely emptied, and only one of those readings is recoverable.
   */
  if (classRows.rows.length === 0) {
    throw new SyncRefused(
      'empty_roster',
      `${provider.name} returned no classes. Nothing has been changed — an empty ` +
        'roster is treated as a failed read rather than as a district with no ' +
        'classes, because the two look identical and only one is recoverable.',
    );
  }

  // ---- campuses -----------------------------------------------------------

  const schoolLinks = await db
    .select()
    .from(schema.onerosterSchoolLinks)
    .where(eq(schema.onerosterSchoolLinks.providerId, provider.id));
  const schoolBySourcedId = new Map(schoolLinks.map(row => [row.sourcedId, row.schoolId]));

  for (const row of orgRows.rows) {
    if (typeof row !== 'object' || row === null) continue;
    const record = row as Record<string, unknown>;
    const sourcedId = asString(record.sourcedId);
    const type = (asString(record.type) ?? '').toLowerCase();
    const name = asString(record.name);

    // Only campuses. A `district` org is the institution itself, which exists
    // already and is not this sync's to create or rename.
    if (!sourcedId || type !== 'school' || !name) continue;
    if (!isCurrent(asString(record.status))) continue;

    if (schoolBySourcedId.has(sourcedId)) {
      result.schoolsMatched += 1;
      continue;
    }

    /*
     * Matched by name before a new campus is created. A district that typed in
     * "Lincoln Elementary" before connecting their SIS should end with one
     * campus, not two — and `school_name_idx` would refuse the second anyway,
     * with a message about an index.
     */
    const [existing] = await db
      .select({ id: schema.schools.id })
      .from(schema.schools)
      .where(and(eq(schema.schools.institutionId, institutionId), eq(schema.schools.name, name)))
      .limit(1);

    let schoolId = existing?.id;
    if (schoolId === undefined) {
      await db.insert(schema.schools).values({ institutionId, name });
      const [created] = await db
        .select({ id: schema.schools.id })
        .from(schema.schools)
        .where(and(eq(schema.schools.institutionId, institutionId), eq(schema.schools.name, name)))
        .limit(1);
      schoolId = created.id;
      result.schoolsCreated += 1;
    } else {
      result.schoolsMatched += 1;
    }

    await db
      .insert(schema.onerosterSchoolLinks)
      .values({ providerId: provider.id, sourcedId, schoolId });
    schoolBySourcedId.set(sourcedId, schoolId);
  }

  // ---- people -------------------------------------------------------------

  const identities = await db
    .select()
    .from(schema.onerosterIdentities)
    .where(eq(schema.onerosterIdentities.providerId, provider.id));
  const identityBySourcedId = new Map(identities.map(row => [row.sourcedId, row]));

  const users = userRows.rows.map(readUser).filter((user): user is SisUser => user !== null);
  const staff = users.filter(user => user.role === 'teacher' || user.role === 'administrator');
  const pupils = users.filter(user => user.role === 'student');

  /*
   * Staff are **linked, never created**, and only to an adult already
   * affiliated with this district.
   *
   * The email match is how a SIS names a person this product already knows. The
   * affiliation requirement is C3c's `unaffiliated` refusal restated: linking a
   * district's class to an adult who has no relationship with it would pull a
   * private account into a district's reach on the strength of a matching
   * address in somebody else's file.
   */
  const staffEmails = staff.map(user => user.email).filter((mail): mail is string => mail !== null);
  const knownAdults = staffEmails.length
    ? await db
        .select({
          id: schema.users.id,
          email: schema.users.email,
          institutionId: schema.users.institutionId,
        })
        .from(schema.users)
        .where(inArray(schema.users.email, staffEmails))
    : [];
  const adultByEmail = new Map(
    knownAdults
      .filter(adult => adult.institutionId === institutionId)
      .map(adult => [adult.email.toLowerCase(), adult.id]),
  );

  const userIdBySourcedId = new Map<string, number>();
  for (const member of staff) {
    const existing = identityBySourcedId.get(member.sourcedId);
    if (existing?.userId) {
      userIdBySourcedId.set(member.sourcedId, existing.userId);
      continue;
    }
    if (existing) continue; // Known here as a child. A role claim does not change that.

    const adultId = member.email ? adultByEmail.get(member.email.toLowerCase()) : undefined;
    if (adultId === undefined) continue;

    await db
      .insert(schema.onerosterIdentities)
      .values({ providerId: provider.id, sourcedId: member.sourcedId, userId: adultId });
    userIdBySourcedId.set(member.sourcedId, adultId);
  }

  const learnerIdBySourcedId = new Map<string, number>();
  for (const pupil of pupils) {
    if (!isCurrent(pupil.status)) {
      // Not archived, not deleted — simply not brought across. A SIS marking a
      // leaver is not a request to erase what they did here.
      skip('left_the_district');
      continue;
    }

    const existing = identityBySourcedId.get(pupil.sourcedId);
    if (existing?.learnerId) {
      const [learner] = await db
        .select()
        .from(schema.learners)
        .where(eq(schema.learners.id, existing.learnerId))
        .limit(1);

      if (!learner) {
        skip('learner_missing');
        continue;
      }
      if (learner.archivedAt) {
        skip('archived');
        continue;
      }
      if (learner.institutionId !== institutionId) {
        skip('belongs_to_another_district');
        continue;
      }

      learnerIdBySourcedId.set(pupil.sourcedId, learner.id);
      continue;
    }

    if (existing) {
      skip('known_here_as_staff');
      continue;
    }

    const grade = birthYearFromGrades(pupil.grades, now);
    if (!grade) {
      /*
       * The refusal C3f and C4c both make, reached far less often here because
       * a SIS carries grades. The alternative is writing a made-up year into a
       * child's record, and that record decides what mathematics they see and
       * whether the consent gate treats them as under thirteen.
       */
      skip('no_usable_grade');
      continue;
    }

    const learner = await createDistrictLearner(db, {
      institutionId,
      displayName: displayNameFor(pupil),
      birthYear: grade.birthYear,
    });

    /*
     * Consented in the same act that creates them, as C3f does. A district
     * pupil who exists without consent is a child this product may record
     * nothing about — and creating them first and consenting second leaves that
     * child in existence if the second step fails.
     */
    await recordInstitutionalConsent(
      db,
      {
        institutionId,
        decision: 'granted',
        policyVersion: CONSENT_POLICY_VERSION,
        /*
         * Named explicitly, exactly as C4c does. Omitting `learnerIds` consents
         * for **every pupil the district owns**, which is right for an
         * administrator accepting terms and catastrophic in a loop — the second
         * child would re-consent the first, and the thousandth would rewrite a
         * thousand ledger rows on every run.
         */
        learnerIds: [learner.id],
      },
      now,
    );

    await db
      .insert(schema.onerosterIdentities)
      .values({ providerId: provider.id, sourcedId: pupil.sourcedId, learnerId: learner.id });

    learnerIdBySourcedId.set(pupil.sourcedId, learner.id);
    result.pupilsCreated += 1;
  }

  // ---- classes ------------------------------------------------------------

  const classLinks = await db
    .select()
    .from(schema.onerosterClassLinks)
    .where(eq(schema.onerosterClassLinks.providerId, provider.id));
  const classroomBySourcedId = new Map(classLinks.map(row => [row.sourcedId, row.classroomId]));

  /** Enrolments grouped by class, so each class is decided once. */
  const enrolmentsByClass = new Map<string, Array<{ userSourcedId: string; role: string }>>();
  for (const row of enrolmentRows.rows) {
    if (typeof row !== 'object' || row === null) continue;
    const record = row as Record<string, unknown>;
    if (!isCurrent(asString(record.status))) continue;

    const classRef = record.class as Record<string, unknown> | undefined;
    const userRef = record.user as Record<string, unknown> | undefined;
    const classSourcedId = asString(classRef?.sourcedId);
    const userSourcedId = asString(userRef?.sourcedId);
    if (!classSourcedId || !userSourcedId) continue;

    const list = enrolmentsByClass.get(classSourcedId) ?? [];
    list.push({ userSourcedId, role: (asString(record.role) ?? '').toLowerCase() });
    enrolmentsByClass.set(classSourcedId, list);
  }

  for (const row of classRows.rows) {
    if (typeof row !== 'object' || row === null) continue;
    const record = row as Record<string, unknown>;
    const sourcedId = asString(record.sourcedId);
    const title = asString(record.title);
    if (!sourcedId || !title) continue;
    if (!isCurrent(asString(record.status))) continue;

    const enrolments = enrolmentsByClass.get(sourcedId) ?? [];

    let classroomId = classroomBySourcedId.get(sourcedId);
    if (classroomId !== undefined) {
      result.classroomsMatched += 1;
    } else {
      const teacherSourcedId = enrolments.find(entry => entry.role === 'teacher')?.userSourcedId;
      const teacherId = teacherSourcedId
        ? userIdBySourcedId.get(teacherSourcedId)
        : undefined;

      if (teacherId === undefined) {
        /*
         * `classrooms.teacher_id` is not nullable and this product will not
         * invent an adult, so the class has nowhere to live. Counted, because
         * "a colleague needs to sign in once" is something an administrator can
         * act on and nobody can guess at.
         */
        result.classesWithoutKnownTeacher += 1;
        continue;
      }

      const schoolRef = record.school as Record<string, unknown> | undefined;
      const schoolSourcedId = asString(schoolRef?.sourcedId);
      const schoolId = schoolSourcedId ? schoolBySourcedId.get(schoolSourcedId) : undefined;

      await db.insert(schema.classrooms).values({
        teacherId,
        schoolId: schoolId ?? null,
        name: title.slice(0, 200),
      });
      const [created] = await db
        .select({ id: schema.classrooms.id })
        .from(schema.classrooms)
        .where(and(eq(schema.classrooms.teacherId, teacherId), eq(schema.classrooms.name, title.slice(0, 200))))
        .orderBy(schema.classrooms.id)
        .limit(1);

      classroomId = created.id;
      await db
        .insert(schema.onerosterClassLinks)
        .values({ providerId: provider.id, sourcedId, classroomId });
      classroomBySourcedId.set(sourcedId, classroomId);
      result.classroomsCreated += 1;
    }

    // ---- enrolments -------------------------------------------------------

    const shouldBeEnrolled = new Set<number>();
    for (const entry of enrolments) {
      if (entry.role !== 'student') continue;
      const learnerId = learnerIdBySourcedId.get(entry.userSourcedId);
      if (learnerId !== undefined) shouldBeEnrolled.add(learnerId);
    }

    const current = await db
      .select()
      .from(schema.classroomLearners)
      .where(eq(schema.classroomLearners.classroomId, classroomId));
    const currentIds = new Set(current.map(entry => entry.learnerId));

    for (const learnerId of shouldBeEnrolled) {
      if (currentIds.has(learnerId)) continue;
      await db.insert(schema.classroomLearners).values({ classroomId, learnerId });
      result.enrolled += 1;
    }

    /*
     * Unenrolled, not archived and not deleted. A child who left a class keeps
     * every answer they ever gave; what changes is which list a teacher sees
     * them on.
     */
    const departed = current.filter(entry => !shouldBeEnrolled.has(entry.learnerId));
    if (departed.length > 0) {
      await db.delete(schema.classroomLearners).where(
        inArray(
          schema.classroomLearners.id,
          departed.map(entry => entry.id),
        ),
      );
      result.unenrolled += departed.length;
    }
  }

  return result;
}

export { RosterUnavailable };
