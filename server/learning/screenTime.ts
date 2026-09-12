/**
 * Screen time, counted and enforced by the server.
 *
 * The limit has been real since B1 — `screen_time_rules` has a writer
 * (`learners.setScreenTimeLimit`), a reader (`learnerAnalytics`) and a control
 * in the parent dashboard that confirms the save. What it never had was
 * enforcement. `screen_time_usage` had no writer outside tests, and the legacy
 * heartbeat it was supposed to receive could not match a child: the browser
 * sent `learner-12` while `server/db.ts` held `student_1..4`, so every beat
 * 404ed, the client swallowed it, and **no child has ever been locked out.**
 *
 * A parent set a limit, saw it saved, saw it displayed, and it did nothing.
 * That is the same defect as the consent ledger one layer over: the product
 * reporting a control it does not apply.
 */

import { and, eq } from 'drizzle-orm';
import type { MySql2Database } from 'drizzle-orm/mysql2';

import * as schema from '../../drizzle/schema';

type Db = MySql2Database<typeof schema>;

/**
 * The most one beat may bank, in seconds.
 *
 * The client beats once a minute. Two minutes' worth absorbs ordinary jitter, a
 * slow request or a tab the browser throttled in the background, while keeping
 * a laptop that slept for six hours from charging the child for the nap. The
 * cap is what makes a missed beat cost nothing rather than cost the gap.
 */
export const MAX_BEAT_SECONDS = 120;

export interface ScreenTimeState {
  /** The day counted, as the server resolved it. */
  day: string;
  minutesSpent: number;
  /**
   * `null` when no rule exists, which is **not** a limit of zero.
   *
   * `screen_time_rules` has no row until a parent sets one, and treating the
   * absence as zero would lock out every child whose parent never opened the
   * control. `src/utils/screenTime.ts` already carries this distinction for the
   * meter; enforcement has to agree with it.
   */
  dailyLimitMinutes: number | null;
  isLocked: boolean;
  /** `null` when there is no limit to remain within. */
  remainingMinutes: number | null;
}

/**
 * The calendar day, as the server sees it.
 *
 * Deliberately not UTC and deliberately not the guardian's zone. See the note
 * on `screenTimeUsage.day`: nothing stores a timezone, and streaks already
 * resolve their day this way.
 */
export function serverDay(now: Date): string {
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const dayOfMonth = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${dayOfMonth}`;
}

/** The rule for one learner, or `null` when a parent has never set one. */
async function limitFor(db: Db, learnerId: number): Promise<number | null> {
  const [rule] = await db
    .select({ dailyLimitMinutes: schema.screenTimeRules.dailyLimitMinutes })
    .from(schema.screenTimeRules)
    .where(eq(schema.screenTimeRules.learnerId, learnerId))
    .limit(1);
  return rule ? rule.dailyLimitMinutes : null;
}

function decide(
  day: string,
  minutesSpent: number,
  dailyLimitMinutes: number | null,
): ScreenTimeState {
  if (dailyLimitMinutes === null) {
    return { day, minutesSpent, dailyLimitMinutes: null, isLocked: false, remainingMinutes: null };
  }
  return {
    day,
    minutesSpent,
    dailyLimitMinutes,
    isLocked: minutesSpent >= dailyLimitMinutes,
    remainingMinutes: Math.max(0, dailyLimitMinutes - minutesSpent),
  };
}

/**
 * What the limit says right now, without counting anything.
 *
 * Used by surfaces that need to know whether a child is locked without
 * advancing the clock — a dashboard, or a reload that must not bank the time
 * the browser spent closed.
 */
export async function screenTimeState(
  db: Db,
  learnerId: number,
  now: Date = new Date(),
): Promise<ScreenTimeState> {
  const day = serverDay(now);
  const [usage] = await db
    .select({ minutesSpent: schema.screenTimeUsage.minutesSpent })
    .from(schema.screenTimeUsage)
    .where(and(eq(schema.screenTimeUsage.learnerId, learnerId), eq(schema.screenTimeUsage.day, day)))
    .limit(1);

  return decide(day, usage?.minutesSpent ?? 0, await limitFor(db, learnerId));
}

/**
 * Bank the time since the last beat, and say where that leaves the child.
 *
 * The caller supplies no duration. Elapsed is measured from `countedThrough`,
 * capped at `MAX_BEAT_SECONDS`, and only whole minutes are banked — the
 * remainder stays in `countedThrough` for the next beat rather than being
 * rounded away.
 *
 * The first beat of a day banks nothing. There is no earlier mark to measure
 * from, and inventing one would charge the child for the gap since midnight.
 */
export async function recordScreenTime(
  db: Db,
  learnerId: number,
  now: Date = new Date(),
): Promise<ScreenTimeState> {
  const day = serverDay(now);

  const [existing] = await db
    .select({
      minutesSpent: schema.screenTimeUsage.minutesSpent,
      countedThrough: schema.screenTimeUsage.countedThrough,
    })
    .from(schema.screenTimeUsage)
    .where(and(eq(schema.screenTimeUsage.learnerId, learnerId), eq(schema.screenTimeUsage.day, day)))
    .limit(1);

  if (!existing) {
    await db
      .insert(schema.screenTimeUsage)
      .values({ learnerId, day, minutesSpent: 0, countedThrough: now })
      // A second beat racing the first must not fail; it simply finds the row
      // next time and measures from it.
      .onDuplicateKeyUpdate({ set: { learnerId } });
    return decide(day, 0, await limitFor(db, learnerId));
  }

  const elapsedSeconds = Math.min(
    MAX_BEAT_SECONDS,
    Math.max(0, Math.floor((now.getTime() - existing.countedThrough.getTime()) / 1000)),
  );
  const banked = Math.floor(elapsedSeconds / 60);

  if (banked < 1) {
    // Nothing whole to add. `countedThrough` is left alone on purpose: moving it
    // to `now` here is exactly how the leftover seconds would be lost.
    return decide(day, existing.minutesSpent, await limitFor(db, learnerId));
  }

  const minutesSpent = Math.min(existing.minutesSpent + banked, 32767);
  await db
    .update(schema.screenTimeUsage)
    .set({
      minutesSpent,
      countedThrough: new Date(existing.countedThrough.getTime() + banked * 60_000),
    })
    .where(and(eq(schema.screenTimeUsage.learnerId, learnerId), eq(schema.screenTimeUsage.day, day)));

  return decide(day, minutesSpent, await limitFor(db, learnerId));
}
