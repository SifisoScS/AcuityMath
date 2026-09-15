/**
 * Holding a teacher's request to choose content, between the launch and the
 * choice.
 *
 * The same shape as `launchState.ts`, and for the same reasons. A deep-linking
 * launch carries everything needed to answer the platform — where to post back,
 * what it will accept, the opaque `data` it wants echoed — and that token is
 * spent the instant it arrives. The teacher picks some time later, and by then
 * the only place any of it still exists is here.
 *
 * Single-use, because a choice is a **creation**: submitting the same page twice
 * would put two copies of the same link in somebody's course, and a teacher
 * pressing the back button is not an unusual thing to do.
 */

import { and, eq, isNull, lt } from 'drizzle-orm';
import type { MySql2Database } from 'drizzle-orm/mysql2';

import * as schema from '../../drizzle/schema';

type Db = MySql2Database<typeof schema>;

/**
 * How long a teacher has to choose.
 *
 * An hour, against the ten minutes a launch gets. A launch is two redirects and
 * is over in seconds; choosing content is a person reading a list and thinking,
 * possibly with a lesson happening around them. Ten minutes would expire on
 * somebody who was interrupted, and the cost of the longer window is small —
 * this row lets a teacher create a link they were already entitled to create.
 */
export const DEEP_LINK_WINDOW_MS = 60 * 60 * 1000;

export interface PendingChoice {
  id: number;
  platformId: number;
  userId: number;
  deploymentId: string;
  returnUrl: string;
  acceptTypes: string[];
  acceptMultiple: boolean;
  data: string | null;
}

export interface BeginChoiceInput {
  platformId: number;
  userId: number;
  deploymentId: string;
  returnUrl: string;
  acceptTypes: string[];
  acceptMultiple: boolean;
  data: string | null;
}

/** Records a request, returning the row the picker will read back. */
export async function beginChoice(
  db: Db,
  input: BeginChoiceInput,
  now: Date = new Date(),
): Promise<number> {
  /*
   * Any earlier unspent request from this teacher is abandoned first.
   *
   * A teacher who starts, wanders off and starts again should not find two
   * pending requests and a picker that has to guess between them — and the
   * older one names a return URL the platform has already given up on.
   */
  await db
    .update(schema.ltiDeepLinkRequests)
    .set({ consumedAt: now })
    .where(
      and(
        eq(schema.ltiDeepLinkRequests.userId, input.userId),
        isNull(schema.ltiDeepLinkRequests.consumedAt),
      ),
    );

  const [created] = await db
    .insert(schema.ltiDeepLinkRequests)
    .values({
      platformId: input.platformId,
      userId: input.userId,
      deploymentId: input.deploymentId,
      returnUrl: input.returnUrl,
      acceptTypes: input.acceptTypes.join(' '),
      acceptMultiple: input.acceptMultiple,
      data: input.data,
      expiresAt: new Date(now.getTime() + DEEP_LINK_WINDOW_MS),
    })
    .$returningId();

  return created.id;
}

/** The request this teacher is currently answering, if any. */
export async function pendingChoice(
  db: Db,
  userId: number,
  now: Date = new Date(),
): Promise<PendingChoice | null> {
  const [row] = await db
    .select()
    .from(schema.ltiDeepLinkRequests)
    .where(
      and(
        eq(schema.ltiDeepLinkRequests.userId, userId),
        isNull(schema.ltiDeepLinkRequests.consumedAt),
      ),
    )
    .limit(1);

  if (!row || row.expiresAt.getTime() <= now.getTime()) return null;
  return toPending(row);
}

/**
 * Claims a request exactly once, or returns nothing.
 *
 * **Atomic, for the reason `consumeState` is.** Reading the row, checking
 * `consumedAt`, then writing it leaves a window in which two submissions both
 * see it unspent — and here that means two identical links appearing in a
 * teacher's course, which only they can tidy up.
 *
 * Expiry is evaluated after claiming, so an expired request is still burned.
 * Leaving it unspent would let a stale page be submitted later, once whoever
 * held it had been forgotten about.
 */
export async function consumeChoice(
  db: Db,
  requestId: number,
  userId: number,
  now: Date = new Date(),
): Promise<PendingChoice | null> {
  const [row] = await db
    .select()
    .from(schema.ltiDeepLinkRequests)
    .where(eq(schema.ltiDeepLinkRequests.id, requestId))
    .limit(1);

  /*
   * The request must belong to the person submitting it. Without this, a
   * teacher holding one request id could answer somebody else's — creating a
   * link in a course they have nothing to do with, signed by us.
   */
  if (!row || row.userId !== userId) return null;

  const result = await db
    .update(schema.ltiDeepLinkRequests)
    .set({ consumedAt: now })
    .where(
      and(
        eq(schema.ltiDeepLinkRequests.id, requestId),
        isNull(schema.ltiDeepLinkRequests.consumedAt),
      ),
    );

  const changed =
    (result as unknown as { affectedRows?: number })?.affectedRows ??
    (Array.isArray(result) ? (result[0] as { affectedRows?: number })?.affectedRows : 0);
  if (!changed) return null;

  if (row.expiresAt.getTime() <= now.getTime()) return null;

  return toPending(row);
}

function toPending(row: typeof schema.ltiDeepLinkRequests.$inferSelect): PendingChoice {
  return {
    id: row.id,
    platformId: row.platformId,
    userId: row.userId,
    deploymentId: row.deploymentId,
    returnUrl: row.returnUrl,
    acceptTypes: row.acceptTypes ? row.acceptTypes.split(/\s+/).filter(Boolean) : [],
    acceptMultiple: row.acceptMultiple,
    data: row.data,
  };
}

/** Removes requests nobody came back for. */
export async function purgeExpiredChoices(db: Db, now: Date = new Date()): Promise<void> {
  await db
    .delete(schema.ltiDeepLinkRequests)
    .where(lt(schema.ltiDeepLinkRequests.expiresAt, now));
}
