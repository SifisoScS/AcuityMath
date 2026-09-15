/**
 * Deleting a child, as the institutional agreement says this product will.
 *
 * The agreement districts sign contains a sentence that was not true: *"deletion
 * removes their practice history rather than hiding it."* What existed was
 * `archivedAt`, a soft delete — and the schema's own comment called it the
 * answer to "a COPPA deletion request". Two documents in this repository
 * disagreed and the code implemented the weaker one.
 *
 * **Archiving and deleting are now different acts with different meanings.**
 * Archiving is for a child who has stopped: they left the school, the family
 * paused, a roster dropped them. Their records stay and they vanish from every
 * surface. Deletion is for a child somebody asked to erase, and it removes the
 * row so every cascade fires.
 *
 * What is left behind is the design decision worth reading. A district that
 * asked for an erasure may later need to show they asked; this product may need
 * to show it complied. Neither needs the child's name, their answers, or their
 * guardian's address — so a tombstone holds a number that resolves to nobody, a
 * date, which adult asked, and a count of what went.
 */

import { eq, sql } from 'drizzle-orm';
import type { MySql2Database } from 'drizzle-orm/mysql2';

import * as schema from '../../drizzle/schema';
import { ABOUT_LEARNER_TABLES, LEARNER_TABLES } from './learnerExport';

type Db = MySql2Database<typeof schema>;

export interface DeletionReceipt {
  learnerId: number;
  deletedAt: Date;
  /** Rows removed, by table. The only evidence afterwards that anything went. */
  removed: Record<string, number>;
  /** Rows the cascades did **not** remove. Must be empty; see `deleteLearner`. */
  remaining: Record<string, number>;
}

export class CannotDelete extends Error {
  readonly reason: string;

  constructor(reason: string, message: string) {
    super(message);
    this.name = 'CannotDelete';
    this.reason = reason;
  }
}

/**
 * Which tables still hold rows for a learner who should be gone.
 *
 * **Unreachable today, and that is said rather than implied.** Every foreign key
 * pointing at `learners` cascades, so `deleteLearner` empties everything and this
 * always returns nothing. It exists for the foreign key somebody adds later
 * without `onDelete: cascade` — at which point a child's answers would survive
 * their deletion while the function reported success, and a district would be
 * told an erasure happened that did not.
 *
 * Pulled out as a pure function so it can be tested with counts that cannot
 * occur yet. An unreachable guard with no test is a claim rather than a defence,
 * which is the same reasoning that applies to the refusal-page escaping in C3c.
 */
export function tablesLeftBehind(remaining: Record<string, number>): string[] {
  return Object.entries(remaining)
    .filter(([, count]) => count > 0)
    .map(([table, count]) => `${table} (${count})`);
}

async function countRows(db: Db, learnerId: number): Promise<Record<string, number>> {
  const counts: Record<string, number> = {};

  for (const [name, { table, column }] of [
    ...Object.entries(LEARNER_TABLES),
    ...Object.entries(ABOUT_LEARNER_TABLES),
  ]) {
    const rows = await db.select().from(table).where(eq(column, learnerId));
    counts[name] = rows.length;
  }

  /*
   * Counted separately because it is not in the export's map — an LTI link is a
   * fact about a *platform account*, not a record of a child's learning, so it
   * has no place in what a parent is shown. It still has to go: an identity
   * surviving its learner would resolve the next launch to a child who no longer
   * exists.
   */
  const identities = await db
    .select()
    .from(schema.ltiIdentities)
    .where(eq(schema.ltiIdentities.learnerId, learnerId));
  counts.lti_identities = identities.length;

  return counts;
}

/**
 * Removes a child and everything recorded about them.
 *
 * The definition of "everything" is **the export's**, not a second list. Two
 * lists would eventually disagree, and the disagreement would be silent in the
 * worst direction: an export showing a parent a table that deletion does not
 * empty.
 *
 * The count is taken before, the row is deleted, and then the same count is
 * taken again — because the cascades are what actually do the work here, and a
 * foreign key added later without `onDelete: cascade` would leave a child's
 * answers behind while this function reported success. The second count is how
 * that becomes a failure rather than a quiet lie.
 */
export async function deleteLearner(
  db: Db,
  learnerId: number,
  requestedBy: { userId: number | null; email: string },
  now: Date = new Date(),
): Promise<DeletionReceipt> {
  const [learner] = await db
    .select()
    .from(schema.learners)
    .where(eq(schema.learners.id, learnerId))
    .limit(1);

  if (!learner) {
    throw new CannotDelete('no_such_learner', `No such learner ${learnerId}.`);
  }

  const removed = await countRows(db, learnerId);

  await db.delete(schema.learners).where(eq(schema.learners.id, learnerId));

  const remaining = await countRows(db, learnerId);
  const leftBehind = tablesLeftBehind(remaining);

  if (leftBehind.length > 0) {
    /*
     * Thrown **after** the delete, deliberately, and not rolled back. The child's
     * row is already gone and putting it back would be worse — a half-deleted
     * child who still appears in surfaces. What matters is that somebody finds
     * out immediately rather than a district believing an erasure happened.
     */
    throw new CannotDelete(
      'incomplete',
      `Deleting learner ${learnerId} left rows behind in ${leftBehind.join(', ')}. ` +
        'A foreign key is missing its cascade.',
    );
  }

  await db.insert(schema.learnerDeletions).values({
    learnerId,
    institutionId: learner.institutionId,
    requestedByUserId: requestedBy.userId,
    requestedByEmail: requestedBy.email,
    removedCounts: removed,
    deletedAt: now,
  });

  return { learnerId, deletedAt: now, removed, remaining };
}

/** What a district has erased, for the district that erased it. */
export async function deletionsForInstitution(db: Db, institutionId: number) {
  return db
    .select()
    .from(schema.learnerDeletions)
    .where(eq(schema.learnerDeletions.institutionId, institutionId))
    .orderBy(sql`${schema.learnerDeletions.deletedAt} desc`);
}
