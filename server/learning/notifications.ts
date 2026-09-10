/**
 * Things that happened, told to whoever should know.
 *
 * ## Why this has producers rather than a list
 *
 * `INITIAL_NOTIFICATIONS` was four invented items in `src/utils/storage.ts`,
 * about children who do not exist ("Alex Rivera achieved Level 8", "Leo Chen is
 * on a 7-day streak") and repeating the invented analytics that were deleted in
 * B3f-1 ("Maya practiced 145 minutes this week with 94% accuracy").
 *
 * Unlike analytics and assignments, this was not a matter of moving data that
 * already existed somewhere — nothing in the application had ever raised a
 * notification. So the work here is mostly the two producers, and the honest
 * scope of the feature is exactly what those two can say.
 *
 * ## What can honestly be reported
 *
 * Two events, because two events actually happen:
 *
 *   - **A concept crosses into mastery.** `recordAttempt` moves the running
 *     score; a crossing of the 80 threshold is a real, dateable moment.
 *   - **An assignment is set.** `assignments.create` writes the targets.
 *
 * The front-end type also has `streak`, `reward` and `sync`. Nothing writes
 * `learner_rewards`, so there are no streaks or coins to report, and the offline
 * queue is Graft D. Those three are absent from the schema enum rather than
 * present and permanently empty.
 */

import { and, desc, eq, inArray, isNull, sql } from 'drizzle-orm';

import * as schema from '../../drizzle/schema';
import type { Database } from '../db/client';

/** The mastery score at which a concept counts as mastered, shared with `mastery.ts`. */
export const MASTERY_THRESHOLD = 80;

export interface NotificationRow {
  id: number;
  type: 'milestone' | 'assignment';
  title: string;
  message: string;
  createdAt: Date;
  read: boolean;
  aboutLearnerId: number | null;
  conceptId: string | null;
  assignmentId: number | null;
}

type Writer = Database | Parameters<Parameters<Database['transaction']>[0]>[0];

/**
 * Congratulates a learner, and tells their guardian, the first time a concept
 * is mastered.
 *
 * Called from inside `recordAttempt`'s transaction, so a notification cannot
 * exist for an attempt that was rolled back — a child being congratulated for
 * an answer the database does not have would be worse than silence.
 *
 * Returns the number of rows written, which is 0 when the threshold was not
 * crossed or the milestone was already raised.
 */
export async function raiseMasteryMilestone(
  tx: Writer,
  input: {
    learnerId: number;
    conceptId: string;
    previousMastery: number;
    currentMastery: number;
  },
): Promise<number> {
  // Cheap first: this is false for all but a handful of a learner's attempts,
  // and it saves the query below on every one of them. It is an optimisation,
  // not the guard — mastery can fall back under the threshold and cross again,
  // so on its own this congratulates a child wobbling around 80 every few
  // questions.
  const crossed =
    input.previousMastery < MASTERY_THRESHOLD && input.currentMastery >= MASTERY_THRESHOLD;
  if (!crossed) return 0;

  // The guard. Scoped to `milestone` so it constrains only these rows; an
  // assignment on the same concept is a different event and must not be
  // silenced by one. See the note on the table for why this is a query rather
  // than a unique index.
  const [existing] = await tx
    .select({ id: schema.notifications.id })
    .from(schema.notifications)
    .where(
      and(
        eq(schema.notifications.aboutLearnerId, input.learnerId),
        eq(schema.notifications.conceptId, input.conceptId),
        eq(schema.notifications.type, 'milestone'),
      ),
    )
    .limit(1);
  if (existing) return 0;

  const [learner] = await tx
    .select({
      displayName: schema.learners.displayName,
      guardianId: schema.learners.guardianId,
    })
    .from(schema.learners)
    .where(eq(schema.learners.id, input.learnerId))
    .limit(1);
  if (!learner) return 0;

  const [concept] = await tx
    .select({ title: schema.concepts.title })
    .from(schema.concepts)
    .where(eq(schema.concepts.id, input.conceptId))
    .limit(1);
  const conceptTitle = concept?.title ?? input.conceptId;

  // Two rows, two sentences. The child is addressed directly; their guardian is
  // told which child it was.
  const rows: (typeof schema.notifications.$inferInsert)[] = [
    {
      learnerId: input.learnerId,
      aboutLearnerId: input.learnerId,
      type: 'milestone',
      title: 'Concept mastered',
      message: `You have mastered ${conceptTitle}.`,
      conceptId: input.conceptId,
    },
    {
      userId: learner.guardianId,
      aboutLearnerId: input.learnerId,
      type: 'milestone',
      title: 'Concept mastered',
      message: `${learner.displayName} has mastered ${conceptTitle}.`,
      conceptId: input.conceptId,
    },
  ];

  await tx.insert(schema.notifications).values(rows);
  return rows.length;
}

/**
 * Tells each child they have been set work.
 *
 * Only the children, not their guardians. A teacher setting a class exercise is
 * routine, and a parent whose bell rings for every piece of homework stops
 * reading the bell — which costs them the milestone notifications that are worth
 * reading.
 *
 * `conceptId` is recorded, so the row can be traced to what it was about. It is
 * also `raiseMasteryMilestone`'s dedup key, which is why that query filters on
 * `type = 'milestone'` — without the filter, setting a second piece of work on a
 * concept a child had already mastered would be read as a repeat and dropped.
 */
export async function announceAssignment(
  tx: Writer,
  input: { assignmentId: number; title: string; conceptId: string; learnerIds: number[] },
): Promise<number> {
  if (input.learnerIds.length === 0) return 0;

  const rows = input.learnerIds.map(learnerId => ({
    learnerId,
    aboutLearnerId: learnerId,
    type: 'assignment' as const,
    title: 'New work set',
    message: `You have been set "${input.title}".`,
    assignmentId: input.assignmentId,
    conceptId: input.conceptId,
  }));

  await tx.insert(schema.notifications).values(rows);
  return rows.length;
}

function toRow(row: typeof schema.notifications.$inferSelect): NotificationRow {
  return {
    id: row.id,
    type: row.type,
    title: row.title,
    message: row.message,
    createdAt: row.createdAt,
    read: row.readAt !== null,
    aboutLearnerId: row.aboutLearnerId,
    conceptId: row.conceptId,
    assignmentId: row.assignmentId,
  };
}

/** What one adult has been told. Newest first. */
export async function notificationsForUser(
  db: Database,
  userId: number,
  limit = 50,
): Promise<NotificationRow[]> {
  const rows = await db
    .select()
    .from(schema.notifications)
    .where(eq(schema.notifications.userId, userId))
    .orderBy(desc(schema.notifications.createdAt))
    .limit(limit);
  return rows.map(toRow);
}

/** What one child has been told. Newest first. */
export async function notificationsForLearner(
  db: Database,
  learnerId: number,
  limit = 50,
): Promise<NotificationRow[]> {
  const rows = await db
    .select()
    .from(schema.notifications)
    .where(eq(schema.notifications.learnerId, learnerId))
    .orderBy(desc(schema.notifications.createdAt))
    .limit(limit);
  return rows.map(toRow);
}

/**
 * The condition matching every notification a caller may act on.
 *
 * Built once and reused by every mutation, so marking one read, marking all
 * read and clearing cannot disagree about what the caller owns. An adult owns
 * the rows addressed to them and the rows addressed to their own children —
 * clearing the family bell is a parent's job. A teacher owns only their own:
 * `guardianId` is the test, not classroom membership, because a teacher tidying
 * a child's notifications is not a thing a teacher should be able to do.
 */
function ownedBy(userId: number) {
  const myLearners = sql`select ${schema.learners.id} from ${schema.learners} where ${schema.learners.guardianId} = ${userId}`;
  return sql`(${schema.notifications.userId} = ${userId} or ${schema.notifications.learnerId} in (${myLearners}))`;
}

/** Marks one read, or unread. Returns false when the caller does not own it. */
export async function setNotificationRead(
  db: Database,
  userId: number,
  notificationId: number,
  read: boolean,
): Promise<boolean> {
  const [owned] = await db
    .select({ id: schema.notifications.id })
    .from(schema.notifications)
    .where(and(eq(schema.notifications.id, notificationId), ownedBy(userId)))
    .limit(1);
  if (!owned) return false;

  await db
    .update(schema.notifications)
    .set({ readAt: read ? new Date() : null })
    .where(eq(schema.notifications.id, notificationId));
  return true;
}

/** Marks everything the caller owns as read. Returns how many were unread. */
export async function markAllRead(db: Database, userId: number): Promise<number> {
  const unread = await db
    .select({ id: schema.notifications.id })
    .from(schema.notifications)
    .where(and(isNull(schema.notifications.readAt), ownedBy(userId)));
  if (unread.length === 0) return 0;

  await db
    .update(schema.notifications)
    .set({ readAt: new Date() })
    .where(
      inArray(
        schema.notifications.id,
        unread.map(row => row.id),
      ),
    );
  return unread.length;
}

/** Deletes everything the caller owns. Returns how many went. */
export async function clearNotifications(db: Database, userId: number): Promise<number> {
  const mine = await db
    .select({ id: schema.notifications.id })
    .from(schema.notifications)
    .where(ownedBy(userId));
  if (mine.length === 0) return 0;

  await db.delete(schema.notifications).where(
    inArray(
      schema.notifications.id,
      mine.map(row => row.id),
    ),
  );
  return mine.length;
}
