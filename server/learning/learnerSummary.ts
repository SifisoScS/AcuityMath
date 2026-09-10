/**
 * A learner's headline progress, for any surface that lists children.
 *
 * Extracted from `learners.list`, which is guardian-scoped by definition. A
 * teacher's roster is the same summary over a different set of children — their
 * classroom — and computing it a second time in the assignments router would be
 * two implementations of "what does this child's progress look like" that drift
 * the first time one is changed.
 *
 * The scoping stays with the caller. This takes learner ids and answers about
 * them; deciding *which* ids an adult may see is the job of the procedure that
 * calls it, and keeping that decision out of here means it cannot be
 * accidentally widened by a change to the aggregation.
 */

import { inArray, sql } from 'drizzle-orm';

import * as schema from '../../drizzle/schema';
import { approximateAge, tierForAge } from '../../src/services/tiers';
import type { Database } from '../db/client';

export interface LearnerSummary {
  id: number;
  displayName: string;
  avatar: string | null;
  birthYear: number;
  age: number;
  tier: 'early' | 'elementary' | 'middle' | 'high';
  dynamicLevel: number;
  eloRating: number;
  answered: number;
  coins: number;
  xp: number;
  streakDays: number;
  streakShields: number;
  accuracyRate: number;
  conceptsMastered: number;
}

/**
 * Three aggregate queries over the whole set, not three per child. An N+1 here
 * is four times the work for the same answer in a family of four, and rather
 * more in a classroom of thirty.
 */
export async function learnerSummaries(
  db: Database,
  learnerIds: number[],
): Promise<LearnerSummary[]> {
  if (learnerIds.length === 0) return [];

  const rows = await db
    .select()
    .from(schema.learners)
    .where(inArray(schema.learners.id, learnerIds))
    .orderBy(schema.learners.birthYear);

  if (rows.length === 0) return [];
  const ids = rows.map(row => row.id);

  const abilities = await db
    .select()
    .from(schema.learnerAbility)
    .where(inArray(schema.learnerAbility.learnerId, ids));

  const rewards = await db
    .select()
    .from(schema.learnerRewards)
    .where(inArray(schema.learnerRewards.learnerId, ids));

  const mastery = await db
    .select({
      learnerId: schema.learnerConceptMastery.learnerId,
      attempts: sql<number>`sum(${schema.learnerConceptMastery.attemptCount})`,
      weightedAccuracy: sql<number>`sum(${schema.learnerConceptMastery.accuracy} * ${schema.learnerConceptMastery.attemptCount})`,
      mastered: sql<number>`sum(case when ${schema.learnerConceptMastery.masteryScore} >= 80 then 1 else 0 end)`,
    })
    .from(schema.learnerConceptMastery)
    .where(inArray(schema.learnerConceptMastery.learnerId, ids))
    .groupBy(schema.learnerConceptMastery.learnerId);

  return rows.map(learner => {
    const age = approximateAge(learner.birthYear);
    const ability = abilities.find(row => row.learnerId === learner.id);
    const reward = rewards.find(row => row.learnerId === learner.id);
    const progress = mastery.find(row => row.learnerId === learner.id);

    const attempts = Number(progress?.attempts ?? 0);
    return {
      id: learner.id,
      displayName: learner.displayName,
      avatar: learner.avatar,
      birthYear: learner.birthYear,
      age,
      tier: tierForAge(age),
      // Zero for a learner who has never answered, which is true rather than a
      // placeholder — a child with no attempts has no ability estimate.
      dynamicLevel: ability ? Number(ability.dynamicLevel) : 0,
      eloRating: ability?.eloRating ?? 0,
      answered: ability?.historyCount ?? 0,
      coins: reward?.coins ?? 0,
      xp: reward?.xp ?? 0,
      streakDays: reward?.streakDays ?? 0,
      streakShields: reward?.streakShields ?? 0,
      // Weighted by attempts, so a concept answered once does not count as much
      // as one answered twenty times.
      accuracyRate:
        attempts > 0 ? Math.round(Number(progress?.weightedAccuracy ?? 0) / attempts) : 0,
      conceptsMastered: Number(progress?.mastered ?? 0),
    };
  });
}
