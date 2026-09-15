/**
 * Turning a platform's class list into children in this product.
 *
 * Every other part of Track C answers a person who is present: somebody clicked
 * a link and is waiting. **A sync runs with nobody in the room**, on a schedule
 * or a button pressed once, and whatever it does to a child's record it does
 * unobserved. That is the whole reason this module is written as a list of
 * refusals rather than a loop.
 *
 * Three rules shape it, and each exists because of what the opposite would cost.
 *
 * **A sync never deletes a child, and never archives one.** Archiving is what
 * this product does when somebody asks for a child's records to be removed. A
 * roster that no longer lists a pupil says they left a course — it does not say
 * anybody asked for anything, and reading it that way would let a platform
 * quietly erase a term's work by dropping a row.
 *
 * **A sync never creates an adult account.** A launch does, because a person is
 * there, clicking. A roster arriving overnight that mints teacher accounts is an
 * LMS deciding who has access to children's data here, with nobody deciding
 * anything. Staff already known from a launch are linked; the rest are counted
 * and reported.
 *
 * **An empty roster removes nobody**, and the line that guarantees it is not
 * the one you would expect. There was a `rosterIsSilent` check here; mutating it
 * away changed no test, because a response with zero members has no *staff*
 * either, and the requirement that a known teacher be present refuses the whole
 * sync before anything is removed. The check was dead code claiming to be a
 * safeguard, so it is gone and this paragraph says which line actually does the
 * work. The behaviour is asserted directly, because it matters more than the
 * mechanism.
 */

import { and, eq, inArray } from 'drizzle-orm';
import type { MySql2Database } from 'drizzle-orm/mysql2';

import * as schema from '../../drizzle/schema';
import { CONSENT_POLICY_VERSION } from '../../src/data/consentPolicy';
import { recordInstitutionalConsent } from '../learning/consent';
import { createDistrictLearner } from '../learning/districtLearners';
import { activeAgreement } from '../learning/institutionAgreements';
import { noteSynced, readMembership, type RosterMember } from './nrps';
import type { PlatformForToken } from './accessToken';

type Db = MySql2Database<typeof schema>;

/**
 * The statuses that mean somebody is still in the course.
 *
 * Matched positively rather than excluding `Inactive`, because the vocabulary is
 * the platform's and an unknown value must not read as "present". A status
 * nobody here recognises is treated as a departure, which unenrols and touches
 * nothing else — the cheap direction to be wrong in.
 */
const PRESENT_STATUSES = new Set(['active', 'true']);

function isPresent(member: RosterMember): boolean {
  // Absent is present: most platforms omit `status` entirely for current
  // members, and reading that as "gone" would empty every course that does.
  if (member.status === null) return true;
  return PRESENT_STATUSES.has(member.status.trim().toLowerCase());
}

/**
 * How soon a course may be synchronised again.
 *
 * Not a rate limit on people — it is a limit on **what one human action costs
 * somebody else's server**. A button double-clicked, or two administrators
 * reaching for it at the same time, would otherwise become two full roster
 * reads against a district's LMS, each of them several pages. A district is
 * entitled to rate-limit us, and being rate-limited out of a school is a worse
 * outcome than a sync somebody has to ask for twice.
 *
 * Overridable, because an administrator who has just fixed a misconfiguration
 * and wants to see it work should not be told to wait.
 */
export const SYNC_COOLDOWN_MS = 5 * 60 * 1000;

export class SyncRefused extends Error {
  readonly reason: string;

  constructor(reason: string, message: string) {
    super(message);
    this.name = 'SyncRefused';
    this.reason = reason;
  }
}

export interface SyncResult {
  classroomId: number;
  /** Pupils created by this sync. */
  created: number;
  /** Pupils already known and newly enrolled here. */
  enrolled: number;
  /** Enrolments removed because the roster no longer lists them as present. */
  unenrolled: number;
  /**
   * Staff on the roster this product does not know.
   *
   * Reported rather than created. Counting them is how an administrator finds
   * out that a colleague needs to open the tool once.
   */
  unknownStaff: number;
  /** Pupils skipped because something about them could not be resolved. */
  skipped: number;
}

/**
 * Brings one course's roster across.
 *
 * Reads, then decides, then writes — in that order and not interleaved. A loop
 * that wrote as it read would leave a half-synchronised class behind whenever a
 * page failed, and "half" is the state nobody can reason about afterwards.
 */
export async function syncRoster(
  db: Db,
  contextRowId: number,
  now: Date = new Date(),
  options: { force?: boolean } = {},
): Promise<SyncResult> {
  const [context] = await db
    .select()
    .from(schema.ltiContexts)
    .where(eq(schema.ltiContexts.id, contextRowId))
    .limit(1);
  if (!context) throw new SyncRefused('no_context', `No such course ${contextRowId}.`);

  /*
   * Checked before the agreement and before the network, because the cheapest
   * refusal is the one that touches nothing. A sync asked for twice in a minute
   * is almost always a double click.
   */
  if (
    !options.force &&
    context.lastSyncedAt &&
    now.getTime() - context.lastSyncedAt.getTime() < SYNC_COOLDOWN_MS
  ) {
    throw new SyncRefused(
      'too_soon',
      'This course was synchronised a moment ago. Wait a few minutes, or ask for ' +
        'it again explicitly if something has just been fixed.',
    );
  }

  if (!context.membershipsUrl) {
    throw new SyncRefused(
      'no_roster',
      'This course has no roster endpoint on record. The platform only tells us ' +
        'where it is during a launch, and it has not done so — usually because the ' +
        'Names and Roles scope is not enabled for this tool.',
    );
  }

  const [deployment] = await db
    .select()
    .from(schema.ltiDeployments)
    .where(eq(schema.ltiDeployments.id, context.deploymentId))
    .limit(1);
  if (!deployment) throw new SyncRefused('no_deployment', 'This course has no installation.');

  const [platformRow] = await db
    .select()
    .from(schema.ltiPlatforms)
    .where(eq(schema.ltiPlatforms.id, deployment.platformId))
    .limit(1);
  if (!platformRow) throw new SyncRefused('no_platform', 'This course has no platform.');

  const institutionId = deployment.institutionId;

  /*
   * Checked before a single row is read, let alone written. A district whose
   * agreement has lapsed must not have its children synchronised in — and
   * finding that out after fetching a roster means we have already held a list
   * of their names for no permitted purpose.
   */
  const agreement = await activeAgreement(db, institutionId, now);
  if (!agreement) {
    throw new SyncRefused(
      'no_agreement',
      'This institution has no agreement in force, so its pupils cannot be brought ' +
        'across from its LMS. An administrator needs to accept the terms first.',
    );
  }

  const platform: PlatformForToken = {
    id: platformRow.id,
    clientId: platformRow.clientId,
    authTokenUrl: platformRow.authTokenUrl,
  };

  const roster = await readMembership(db, platform, context.membershipsUrl, { now });

  const identities = await db
    .select()
    .from(schema.ltiIdentities)
    .where(eq(schema.ltiIdentities.platformId, platformRow.id));
  const bySubject = new Map(identities.map(row => [row.subject, row]));

  /*
   * A classroom needs a teacher, and this product will not invent one. The
   * refusal names the one thing that fixes it, because "open the tool once" is
   * something a teacher can do in a minute and nobody can guess at.
   *
   * It is also what makes a **failed read safe**. A platform erroring
   * mid-request, a scope revoked, a course archived at their end — each returns
   * zero members, which is indistinguishable from a class of thirty children
   * leaving at once. Zero members means no staff either, so the sync stops here
   * and removes nothing.
   */
  const knownTeacher = roster.members
    .filter(member => member.isStaff)
    .map(member => bySubject.get(member.userId))
    .find(identity => identity?.userId != null);

  if (!knownTeacher?.userId) {
    throw new SyncRefused(
      'no_known_teacher',
      'Nobody who teaches this course has opened AcuityMath from the LMS yet, so ' +
        'there is no account to attach the class to. A teacher launching it once ' +
        'is enough.',
    );
  }

  const pupils = roster.members.filter(member => !member.isStaff);
  const present = pupils.filter(isPresent);

  const classroomId = await findOrCreateClassroom(db, context, knownTeacher.userId);

  const result: SyncResult = {
    classroomId,
    created: 0,
    enrolled: 0,
    unenrolled: 0,
    unknownStaff: roster.members.filter(
      member => member.isStaff && !bySubject.has(member.userId),
    ).length,
    skipped: 0,
  };

  const shouldBeEnrolled = new Set<number>();
  /** Separately, so "newly created" and "newly enrolled" stay distinguishable. */
  const createdNow = new Set<number>();

  for (const pupil of present) {
    const existing = bySubject.get(pupil.userId);

    if (existing?.learnerId) {
      const [learner] = await db
        .select()
        .from(schema.learners)
        .where(eq(schema.learners.id, existing.learnerId))
        .limit(1);

      /*
       * A pupil whose record is archived is skipped, never restored. Somebody
       * asked for those records to be removed, and a roster listing them again
       * is the platform's opinion rather than a withdrawal of that request.
       */
      if (!learner || learner.archivedAt || learner.institutionId !== institutionId) {
        result.skipped += 1;
        continue;
      }

      shouldBeEnrolled.add(learner.id);
      continue;
    }

    if (existing && existing.learnerId === null) {
      // Known here as a member of staff. A role claim disagreeing with a roster
      // is not a reason to turn an adult into a child.
      result.skipped += 1;
      continue;
    }

    if (context.defaultBirthYear === null) {
      /*
       * The same refusal C3f makes at a launch, for the same reason: no roster
       * carries a birth date, and the alternative to knowing is writing a
       * made-up year into a child's record.
       */
      result.skipped += 1;
      continue;
    }

    const learner = await createDistrictLearner(db, {
      institutionId,
      displayName: pupil.name?.trim() || 'Pupil',
      birthYear: context.defaultBirthYear,
    });

    await recordInstitutionalConsent(
      db,
      {
        institutionId,
        decision: 'granted',
        policyVersion: CONSENT_POLICY_VERSION,
        learnerIds: [learner.id],
      },
      now,
    );

    await db.insert(schema.ltiIdentities).values({
      platformId: platformRow.id,
      subject: pupil.userId,
      learnerId: learner.id,
      lastLaunchedAt: now,
    });

    shouldBeEnrolled.add(learner.id);
    createdNow.add(learner.id);
    result.created += 1;
  }

  const enrolled = await db
    .select()
    .from(schema.classroomLearners)
    .where(eq(schema.classroomLearners.classroomId, classroomId));
  const alreadyEnrolled = new Set(enrolled.map(row => row.learnerId));

  const toAdd = [...shouldBeEnrolled].filter(id => !alreadyEnrolled.has(id));
  if (toAdd.length > 0) {
    await db
      .insert(schema.classroomLearners)
      .values(toAdd.map(learnerId => ({ classroomId, learnerId })));
  }
  // Counted apart from `created`, so a caller can tell "thirty new children" from
  // "thirty children this district already had, joining a class".
  result.enrolled = toAdd.filter(id => !createdNow.has(id)).length;

  /*
   * Departures, and the narrowest possible action for them.
   *
   * An enrolment row is removed and **nothing else happens**: the child, their
   * attempts, their mastery, their consent record all remain exactly as they
   * were. A pupil who leaves a class has not left the district, and a roster is
   * not a request to delete anybody.
   */
  const toRemove = [...alreadyEnrolled].filter(id => !shouldBeEnrolled.has(id));
  if (toRemove.length > 0) {
    await db
      .delete(schema.classroomLearners)
      .where(
        and(
          eq(schema.classroomLearners.classroomId, classroomId),
          inArray(schema.classroomLearners.learnerId, toRemove),
        ),
      );
    result.unenrolled = toRemove.length;
  }

  await noteSynced(db, contextRowId, now);
  return result;
}

/**
 * The classroom this course maps to, made once and found thereafter.
 *
 * Named from the course, and **not renamed** on later syncs. A teacher who
 * renames a class here has said something about their own classroom; letting the
 * platform overwrite it every night would make that edit pointless.
 */
async function findOrCreateClassroom(
  db: Db,
  context: typeof schema.ltiContexts.$inferSelect,
  teacherId: number,
): Promise<number> {
  if (context.classroomId) {
    const [existing] = await db
      .select({ id: schema.classrooms.id })
      .from(schema.classrooms)
      .where(eq(schema.classrooms.id, context.classroomId))
      .limit(1);
    if (existing) return existing.id;
  }

  const [created] = await db
    .insert(schema.classrooms)
    .values({
      teacherId,
      name: context.title ?? `Course ${context.contextId}`,
    })
    .$returningId();

  await db
    .update(schema.ltiContexts)
    .set({ classroomId: created.id })
    .where(eq(schema.ltiContexts.id, context.id));

  return created.id;
}
