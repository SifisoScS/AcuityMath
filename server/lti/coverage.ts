/**
 * The one number this product puts in a teacher's gradebook.
 *
 * Practice here is continuous rather than a submission, so there is no natural
 * "score" to hand over — a decision had to be made about what a column labelled
 * *AcuityMath* means, and this module is that decision written down.
 *
 * **It is the share of a child's own year group they have mastered**, with
 * concepts they have never touched counting as nothing. A teacher reading 20 is
 * reading "a fifth of Year 4". It starts near zero for everybody in September
 * and climbs all year, which is the honest shape of the thing being measured.
 *
 * The two alternatives were rejected for reasons worth keeping.
 *
 * Averaging only over *concepts already practised* starts high and stays high,
 * which reads as encouraging and says almost nothing: a child who took one easy
 * concept to 90 would outrank one who worked through ten averaging 70. It
 * rewards narrowness, and a gradebook column that rewards narrowness will get
 * exactly that.
 *
 * Counting *concepts fully mastered* is the most literally interpretable — "3 of
 * 20" needs no explanation — but it is a step function. Weeks of real movement
 * below the threshold show nothing at all, and a child going 79 to 81 jumps a
 * whole point for a single answer.
 *
 * **This is a product decision, not a technical one**, and it is confined to one
 * function so that changing it is one edit and one conversation rather than an
 * archaeology exercise.
 */

import { and, eq, inArray } from 'drizzle-orm';
import type { MySql2Database } from 'drizzle-orm/mysql2';

import * as schema from '../../drizzle/schema';
import { approximateAge, tierForAge } from '../../src/services/tiers';

type Db = MySql2Database<typeof schema>;

export interface Coverage {
  /** Out of 100. The number a teacher sees. */
  percent: number;
  /** How many concepts the year group contains. The denominator, shown for context. */
  conceptsInTier: number;
  /** How many the child has any recorded mastery on at all. */
  conceptsTouched: number;
}

/**
 * How much of their year group a child has covered.
 *
 * Returns `null` rather than zero when the tier has no concepts, which is not
 * the same statement. Zero means "has covered none of it"; null means "there is
 * nothing to have covered", which is true of age 7 today and would otherwise
 * report every child in that band as failing at a curriculum that does not
 * exist yet.
 */
export async function curriculumCoverage(
  db: Db,
  learnerId: number,
  now: Date = new Date(),
): Promise<Coverage | null> {
  const [learner] = await db
    .select({ birthYear: schema.learners.birthYear })
    .from(schema.learners)
    .where(eq(schema.learners.id, learnerId))
    .limit(1);
  if (!learner) return null;

  const tier = tierForAge(approximateAge(learner.birthYear, now));

  const tierConcepts = await db
    .select({ id: schema.concepts.id })
    .from(schema.concepts)
    .where(eq(schema.concepts.tier, tier));

  if (tierConcepts.length === 0) return null;

  const ids = tierConcepts.map(concept => concept.id);
  const mastery = await db
    .select({
      conceptId: schema.learnerConceptMastery.conceptId,
      masteryScore: schema.learnerConceptMastery.masteryScore,
    })
    .from(schema.learnerConceptMastery)
    .where(
      and(
        eq(schema.learnerConceptMastery.learnerId, learnerId),
        /*
         * Restricted to this tier, deliberately. A child who reached forward
         * into next year's work has done something worth celebrating, and it is
         * still not coverage of *their* year — counting it would let the column
         * exceed what the denominator describes.
         */
        inArray(schema.learnerConceptMastery.conceptId, ids),
      ),
    );

  const total = mastery.reduce((sum, row) => sum + row.masteryScore, 0);

  return {
    /*
     * Rounded to a whole number, because a gradebook column showing 19.4 invites
     * a teacher to wonder what the fraction means. Rounded rather than floored:
     * flooring would leave a child sitting on 19 through a whole afternoon of
     * work that took them from 19.1 to 19.9.
     */
    percent: Math.round(total / tierConcepts.length),
    conceptsInTier: tierConcepts.length,
    conceptsTouched: mastery.length,
  };
}
