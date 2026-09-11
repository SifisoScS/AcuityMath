/**
 * Coins, experience and streaks.
 *
 * `learner_rewards` has had a table since B1 and nothing has ever written to it,
 * so every child's coins, XP, streak and shields have read zero on every
 * dashboard, the Rewards Vault has been unusable, and there were no streak
 * notifications to raise. This is the producer.
 *
 * ## Why the rules live here rather than in the component that celebrates them
 *
 * They were in `InfiniteAdaptiveModal`, as `coinsEarned: correct ? 3 : 0` and
 * `xpEarned: correct ? 15 : 5` written into local state and a legacy endpoint.
 * A reward decided by the surface that displays it is a reward that differs
 * between surfaces, and one a determined child can award themselves from the
 * console. Every figure here is written by the same transaction that records the
 * answer.
 *
 * ## Why a wrong answer still earns something
 *
 * Two XP rather than none. This is a practice product for children as young as
 * three, and a reward schedule that pays only for correctness teaches a child to
 * avoid questions they might get wrong — which is precisely the practice that
 * moves them. Coins pay only for correct answers, so the two currencies say
 * different things: XP is *turning up*, coins are *getting it right*.
 */

import { and, eq, sql } from 'drizzle-orm';

import * as schema from '../../drizzle/schema';
import type { Database } from '../db/client';

/** What one answer is worth. */
export const XP_FOR_CORRECT = 10;
export const XP_FOR_ATTEMPT = 2;
export const COINS_FOR_CORRECT = 3;

/** Consecutive days of practice that earn a shield. */
export const DAYS_PER_SHIELD = 7;
/**
 * The most shields a learner may hold.
 *
 * Unbounded, a child who practised daily for a year could miss two months and
 * keep an unbroken streak, which makes the streak meaningless. Three is enough
 * to cover an illness or a holiday.
 */
export const MAX_SHIELDS = 3;

type Writer = Database | Parameters<Parameters<Database['transaction']>[0]>[0];

export interface RewardChange {
  coins: number;
  xp: number;
  streakDays: number;
  streakShields: number;
  /** XP added by this answer. */
  xpEarned: number;
  /** Coins added by this answer. */
  coinsEarned: number;
  /** True when the streak advanced today. */
  streakExtended: boolean;
  /** True when a shield was spent to survive a missed day. */
  shieldSpent: boolean;
  /** True when this answer earned a new shield. */
  shieldEarned: boolean;
}

/** `YYYY-MM-DD`, matching the `date` column's `mode: 'string'`. */
export function dayOf(at: Date): string {
  return `${at.getFullYear()}-${String(at.getMonth() + 1).padStart(2, '0')}-${String(at.getDate()).padStart(2, '0')}`;
}

function daysBetween(earlier: string, later: string): number {
  const a = Date.parse(`${earlier}T00:00:00Z`);
  const b = Date.parse(`${later}T00:00:00Z`);
  return Math.round((b - a) / 86_400_000);
}

/**
 * What a day's gap does to a streak.
 *
 * Pure, so the rule can be tested without a database — the awkward cases are all
 * about dates, and standing up MySQL to ask what happens after a two-day gap
 * would make them tedious enough to skip.
 *
 * Note the day is the *server's*. A child practising at 11pm in a timezone six
 * hours behind can have an answer land on the following day and lose a streak
 * they kept. Fixing that needs the learner's timezone stored alongside them;
 * recorded as a gap rather than papered over with a guess.
 */
export function advanceStreak(
  previous: { streakDays: number; streakShields: number; lastPracticedOn: string | null },
  today: string,
): { streakDays: number; streakShields: number; extended: boolean; shieldSpent: boolean; shieldEarned: boolean } {
  const { streakShields } = previous;

  // Already practised today: the streak is a count of days, not of answers.
  if (previous.lastPracticedOn === today) {
    return {
      streakDays: previous.streakDays,
      streakShields,
      extended: false,
      shieldSpent: false,
      shieldEarned: false,
    };
  }

  const gap = previous.lastPracticedOn ? daysBetween(previous.lastPracticedOn, today) : null;

  let streakDays: number;
  let shields = streakShields;
  let shieldSpent = false;

  if (gap === null || gap < 0) {
    // First ever, or a clock that went backwards. Start at one either way rather
    // than trusting arithmetic on a date that should not exist.
    streakDays = 1;
  } else if (gap === 1) {
    streakDays = previous.streakDays + 1;
  } else if (shields > 0) {
    /*
     * A shield covers the whole gap, however long. Spending one per missed day
     * would burn a child's whole reserve on a single holiday without them ever
     * choosing to, which is not a protection they would recognise as one.
     */
    shields -= 1;
    shieldSpent = true;
    streakDays = previous.streakDays + 1;
  } else {
    streakDays = 1;
  }

  // Earned on reaching a multiple of seven, and only when the streak actually
  // moved — otherwise a child sitting on day 7 would earn one per answer.
  const shieldEarned = streakDays % DAYS_PER_SHIELD === 0 && shields < MAX_SHIELDS;
  if (shieldEarned) shields += 1;

  return { streakDays, streakShields: shields, extended: true, shieldSpent, shieldEarned };
}

/**
 * Records what one answer earned.
 *
 * Called from inside `recordAttempt`'s transaction, after the replay check — so
 * a queued answer that is delivered twice is paid for once. Awarding before that
 * check would let an offline learner mint coins by losing their connection.
 */
export async function awardForAttempt(
  tx: Writer,
  input: { learnerId: number; isCorrect: boolean; at?: Date },
): Promise<RewardChange> {
  const today = dayOf(input.at ?? new Date());

  const [existing] = await tx
    .select()
    .from(schema.learnerRewards)
    .where(eq(schema.learnerRewards.learnerId, input.learnerId))
    .limit(1);

  const xpEarned = input.isCorrect ? XP_FOR_CORRECT : XP_FOR_ATTEMPT;
  const coinsEarned = input.isCorrect ? COINS_FOR_CORRECT : 0;

  const streak = advanceStreak(
    {
      streakDays: existing?.streakDays ?? 0,
      streakShields: existing?.streakShields ?? 0,
      lastPracticedOn: existing?.lastPracticedOn ?? null,
    },
    today,
  );

  const next = {
    coins: (existing?.coins ?? 0) + coinsEarned,
    xp: (existing?.xp ?? 0) + xpEarned,
    streakDays: streak.streakDays,
    streakShields: streak.streakShields,
    lastPracticedOn: today,
  };

  if (existing) {
    await tx
      .update(schema.learnerRewards)
      .set(next)
      .where(eq(schema.learnerRewards.id, existing.id));
  } else {
    await tx.insert(schema.learnerRewards).values({ learnerId: input.learnerId, ...next });
  }

  return {
    ...next,
    xpEarned,
    coinsEarned,
    streakExtended: streak.extended,
    shieldSpent: streak.shieldSpent,
    shieldEarned: streak.shieldEarned,
  };
}

/**
 * Spends coins.
 *
 * Conditional in the UPDATE rather than read-then-write: two tabs spending the
 * same coins at once would both read the same balance and both succeed. Returns
 * false when the learner could not afford it, which the caller must surface
 * rather than treating as success.
 */
export async function spendCoins(
  db: Database,
  learnerId: number,
  price: number,
): Promise<boolean> {
  const result = await db
    .update(schema.learnerRewards)
    .set({ coins: sql`${schema.learnerRewards.coins} - ${price}` })
    .where(
      and(
        eq(schema.learnerRewards.learnerId, learnerId),
        sql`${schema.learnerRewards.coins} >= ${price}`,
      ),
    );

  const [{ affectedRows }] = result as unknown as [{ affectedRows: number }];
  return affectedRows > 0;
}
