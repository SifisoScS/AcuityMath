/**
 * Sending a child's progress to the gradebook their school keeps.
 *
 * C5a built the protocol and deliberately called none of it. This is the part
 * that decides **when** a score goes out, and it is written around one rule that
 * outranks everything else here:
 *
 * **A gradebook must never break a child's practice.** Every path through this
 * module either sends a score or returns a reason it did not. Nothing throws.
 * A district's LMS being down, a scope not granted, a certificate expired —
 * none of those is the child's problem, and a nine-year-old finishing a session
 * must not see an error because somebody else's server did.
 *
 * That makes the failure mode silence, which is the other thing worth being
 * careful about: a column that quietly stops updating looks exactly like a child
 * who stopped working. Every refusal is returned with a reason and logged, so
 * the difference is recoverable from a log rather than guessed at.
 */

import { and, eq } from 'drizzle-orm';
import type { MySql2Database } from 'drizzle-orm/mysql2';

import * as schema from '../../drizzle/schema';
import {
  GradebookUnavailable,
  postScore,
  resolveLineItem,
  type LineItem,
} from './ags';
import { curriculumCoverage } from './coverage';

type Db = MySql2Database<typeof schema>;

export type ScoreOutcome =
  | { sent: true; percent: number; lineItem: LineItem }
  | { sent: false; reason: ScoreSkipped };

/**
 * Why a score was not sent.
 *
 * An enumeration rather than a message, because these are read by code and
 * counted in logs. Most of them are ordinary: a family learner has no gradebook
 * to go to, and a district that never granted the scope is configured that way
 * on purpose.
 */
export type ScoreSkipped =
  | 'not_a_district_learner'
  | 'no_lti_identity'
  | 'no_course'
  | 'no_gradebook'
  | 'no_curriculum'
  | 'platform_refused';

export interface ReportScoreInput {
  learnerId: number;
  /**
   * The placement to report against.
   *
   * A child may be enrolled through more than one link, and a score belongs to
   * the column of the one they are working in. When it is not known — practice
   * started outside a launch — nothing is sent, because guessing a column means
   * writing a mark somewhere nobody chose.
   */
  contextRowId: number;
  resourceLinkId: string;
  now?: Date;
}

/**
 * Works out the score and sends it, or says why it did not.
 *
 * The cheap refusals come first and touch no network: a family learner, a child
 * with no link to this platform, a course with no gradebook. Reaching out to a
 * district's server to discover something a local row already knew would be a
 * request nobody needed to make.
 */
export async function reportScore(
  db: Db,
  input: ReportScoreInput,
): Promise<ScoreOutcome> {
  const now = input.now ?? new Date();

  const [learner] = await db
    .select({
      id: schema.learners.id,
      institutionId: schema.learners.institutionId,
      archivedAt: schema.learners.archivedAt,
    })
    .from(schema.learners)
    .where(eq(schema.learners.id, input.learnerId))
    .limit(1);

  /*
   * A family's child has no school gradebook to appear in, and archiving means
   * somebody asked for a child's records to be removed — continuing to publish
   * their progress to a district afterwards would be the opposite of honouring
   * that.
   */
  if (!learner?.institutionId || learner.archivedAt) {
    return { sent: false, reason: 'not_a_district_learner' };
  }

  const [context] = await db
    .select({
      id: schema.ltiContexts.id,
      deploymentId: schema.ltiContexts.deploymentId,
    })
    .from(schema.ltiContexts)
    .where(eq(schema.ltiContexts.id, input.contextRowId))
    .limit(1);
  if (!context) return { sent: false, reason: 'no_course' };

  const [deployment] = await db
    .select()
    .from(schema.ltiDeployments)
    .where(eq(schema.ltiDeployments.id, context.deploymentId))
    .limit(1);

  /*
   * The district on the course must be the district that owns the child. Without
   * this, a learner id from one district paired with a course id from another
   * would publish a child's progress into a gradebook belonging to a school
   * that has never heard of them.
   */
  if (!deployment || deployment.institutionId !== learner.institutionId) {
    return { sent: false, reason: 'no_course' };
  }

  const [platformRow] = await db
    .select()
    .from(schema.ltiPlatforms)
    .where(eq(schema.ltiPlatforms.id, deployment.platformId))
    .limit(1);
  if (!platformRow) return { sent: false, reason: 'no_course' };

  const [identity] = await db
    .select({ subject: schema.ltiIdentities.subject })
    .from(schema.ltiIdentities)
    .where(
      and(
        eq(schema.ltiIdentities.platformId, platformRow.id),
        eq(schema.ltiIdentities.learnerId, learner.id),
      ),
    )
    .limit(1);

  /*
   * Without the platform's own identifier there is nobody to post against. A
   * score needs their `sub`, and inventing one would put a mark on whichever of
   * their users happened to match.
   */
  if (!identity) return { sent: false, reason: 'no_lti_identity' };

  const coverage = await curriculumCoverage(db, learner.id, now);
  /*
   * Null means the year group has no concepts authored yet — true of age 7
   * today. Reporting zero would tell a teacher their class is failing at a
   * curriculum that does not exist.
   */
  if (!coverage) return { sent: false, reason: 'no_curriculum' };

  const platform = {
    id: platformRow.id,
    clientId: platformRow.clientId,
    authTokenUrl: platformRow.authTokenUrl,
  };

  try {
    const lineItem = await resolveLineItem(
      db,
      platform,
      {
        contextRowId: context.id,
        resourceLinkId: input.resourceLinkId,
        label: 'AcuityMath',
      },
      now,
    );

    await postScore(
      db,
      platform,
      lineItem,
      { platformUserId: identity.subject, scoreGiven: coverage.percent, timestamp: now },
      now,
    );

    return { sent: true, percent: coverage.percent, lineItem };
  } catch (error) {
    if (error instanceof GradebookUnavailable) {
      /*
       * **Swallowed on purpose, and logged because of it.** A child finishing a
       * session must not see an error because a district's server is down. The
       * cost is that a column quietly ceasing to update looks like a child who
       * stopped working, so the log line is the only thing that tells those
       * apart — which is why it names the learner and the status rather than
       * saying "failed".
       */
      console.warn(
        `[lti] could not report learner ${learner.id} to course ${context.id} ` +
          `(status ${error.status}): ${error.message}`,
      );
      return { sent: false, reason: 'platform_refused' };
    }
    throw error;
  }
}
