/**
 * What a parent is shown about their child.
 *
 * Every figure here is derived from rows the child's own answers produced. That
 * is worth stating because the shape it fills used to be a literal in
 * `storage.ts` — seven days of invented activity, four invented mastery domains,
 * and a recommended action written by whoever typed the file.
 *
 * Where there is no honest source for a field, it is zero and says so. A
 * dashboard that invents one number teaches a parent to trust the rest of them.
 */

import { and, desc, eq, gte, inArray, sql } from 'drizzle-orm';

import * as schema from '../../drizzle/schema';
import type { Database } from '../db/client';

export interface WeeklyActivityRow {
  day: string;
  minutes: number;
  accuracy: number;
  problemsSolved: number;
}

export interface MasteryDomainRow {
  domain: string;
  score: number;
  color: string;
  level: string;
}

export interface LearnerAnalytics {
  studentId: string;
  totalTimeMinutes: number;
  weeklyActivity: WeeklyActivityRow[];
  masteryDomains: MasteryDomainRow[];
  strengths: string[];
  areasToImprove: string[];
  recommendedAction: string;
  screenTimeLimitMinutes: number;
  focusAlertsCount: number;
}

/**
 * The bands the dashboard colours by.
 *
 * Shared with `mastery.ts`'s reasoning: below 50 is struggling, 50-79
 * developing, 80+ mastered. Repeating the thresholds in a component would let
 * the label and the colour disagree with the number they describe.
 */
function bandFor(score: number): { level: string; color: string } {
  if (score >= 80) return { level: 'Mastered', color: 'bg-emerald-500' };
  if (score >= 50) return { level: 'Developing', color: 'bg-amber-500' };
  return { level: 'Target Area', color: 'bg-rose-500' };
}

const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export async function learnerAnalytics(db: Database, learnerId: number): Promise<LearnerAnalytics> {
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

  const recent = await db
    .select({
      createdAt: schema.attempts.createdAt,
      isCorrect: schema.attempts.isCorrect,
      responseTimeMs: schema.attempts.responseTimeMs,
    })
    .from(schema.attempts)
    .where(and(eq(schema.attempts.learnerId, learnerId), gte(schema.attempts.createdAt, sevenDaysAgo)));

  // Seven days, always — including the ones with nothing in them. A chart that
  // omits empty days compresses a fortnight of silence into a tidy line.
  const byDay = new Map<string, { minutes: number; correct: number; total: number }>();
  for (let back = 6; back >= 0; back--) {
    const date = new Date(Date.now() - back * 24 * 60 * 60 * 1000);
    byDay.set(date.toDateString(), { minutes: 0, correct: 0, total: 0 });
  }

  for (const attempt of recent) {
    const key = attempt.createdAt.toDateString();
    const bucket = byDay.get(key);
    if (!bucket) continue;
    bucket.total += 1;
    if (attempt.isCorrect) bucket.correct += 1;
    bucket.minutes += (attempt.responseTimeMs ?? 0) / 60_000;
  }

  const weeklyActivity: WeeklyActivityRow[] = [...byDay.entries()].map(([key, bucket]) => ({
    day: DAY_LABELS[new Date(key).getDay()],
    minutes: Math.round(bucket.minutes),
    accuracy: bucket.total > 0 ? Math.round((bucket.correct / bucket.total) * 100) : 0,
    problemsSolved: bucket.total,
  }));

  const mastery = await db
    .select({
      conceptId: schema.learnerConceptMastery.conceptId,
      masteryScore: schema.learnerConceptMastery.masteryScore,
      attemptCount: schema.learnerConceptMastery.attemptCount,
      title: schema.concepts.title,
    })
    .from(schema.learnerConceptMastery)
    .innerJoin(schema.concepts, eq(schema.concepts.id, schema.learnerConceptMastery.conceptId))
    .where(eq(schema.learnerConceptMastery.learnerId, learnerId))
    .orderBy(desc(schema.learnerConceptMastery.masteryScore));

  const masteryDomains: MasteryDomainRow[] = mastery.map(row => ({
    domain: row.title,
    score: row.masteryScore,
    ...bandFor(row.masteryScore),
  }));

  // Named from what the learner has actually done. A concept answered once is
  // not a strength however well it went, so a handful of attempts is the floor
  // for saying anything about it.
  const settled = mastery.filter(row => row.attemptCount >= 3);
  const strengths = settled.filter(row => row.masteryScore >= 80).slice(0, 3).map(row => row.title);
  const areasToImprove = [...settled]
    .filter(row => row.masteryScore < 50)
    .sort((a, b) => a.masteryScore - b.masteryScore)
    .slice(0, 3)
    .map(row => row.title);

  const [{ totalMs }] = await db
    .select({ totalMs: sql<number>`coalesce(sum(${schema.attempts.responseTimeMs}), 0)` })
    .from(schema.attempts)
    .where(eq(schema.attempts.learnerId, learnerId));

  const [rule] = await db
    .select()
    .from(schema.screenTimeRules)
    .where(eq(schema.screenTimeRules.learnerId, learnerId))
    .limit(1);

  const misconceptions = await db
    .select()
    .from(schema.learnerMisconceptions)
    .where(eq(schema.learnerMisconceptions.learnerId, learnerId))
    .orderBy(desc(schema.learnerMisconceptions.observedCount))
    .limit(1);

  return {
    studentId: String(learnerId),
    // Time spent answering, which is what the attempts record. Not screen time:
    // a child can leave the tab open, and counting that as practice would tell
    // a parent something flattering and false.
    totalTimeMinutes: Math.round(Number(totalMs) / 60_000),
    weeklyActivity,
    masteryDomains,
    strengths,
    areasToImprove,
    recommendedAction: recommend(settled, misconceptions[0]),
    screenTimeLimitMinutes: rule?.dailyLimitMinutes ?? 0,
    // No source. Nothing records a lapse in attention, and inventing a count
    // here would be the one made-up number that discredits the rest.
    focusAlertsCount: 0,
  };
}

/**
 * One sentence a parent can act on.
 *
 * Built from the weakest settled concept and the error seen most often, because
 * those are the two things the data actually supports saying. The alternative —
 * a fixed sentence, as this was — reads as advice and is a decoration.
 */
function recommend(
  settled: { title: string; masteryScore: number }[],
  topMisconception?: { misconceptionCode: string; observedCount: number },
): string {
  if (settled.length === 0) {
    return 'Not enough practice yet to suggest anything. A few more sessions will show where to help.';
  }

  const weakest = [...settled].sort((a, b) => a.masteryScore - b.masteryScore)[0];
  if (weakest.masteryScore >= 80) {
    return `Everything practised so far is secure. ${weakest.title} is the least settled at ${weakest.masteryScore}%, so it is worth revisiting occasionally.`;
  }

  const because = topMisconception
    ? ` The error seen most often is ${readableCode(topMisconception.misconceptionCode)}.`
    : '';
  return `Spend the next few sessions on ${weakest.title} — mastery is ${weakest.masteryScore}%.${because}`;
}

/**
 * A misconception code as a sentence fragment.
 *
 * Two vocabularies reach here: the generator's ten fixed codes and the imported
 * corpus's concept-specific ones. Rather than a lookup that silently mislabels
 * anything unrecognised — which is how `size-middle-not-extreme` once displayed
 * as "Arithmetic calculation step slip" — an unknown code is spelled out from
 * its own words.
 */
function readableCode(code: string): string {
  const known: Record<string, string> = {
    SIGN_ERROR: 'losing track of a negative sign',
    ORDER_OF_OPERATIONS: 'working left to right instead of by precedence',
    INVERTED_FRACTION: 'swapping the numerator and denominator',
    ADDITIVE_INSTEAD_OF_MULTIPLICATIVE: 'adding where the problem multiplies',
    OFF_BY_ONE_COUNTING: 'counting one too many or too few',
    RECIPROCAL_MISAPPLIED: 'applying a reciprocal in the wrong place',
    DISTRIBUTIVE_OMISSION: 'dropping a term when expanding',
    UNIT_CONVERSION_CONFUSION: 'mixing up units',
    COORDINATE_AXIS_SWAP: 'reading the axes the wrong way round',
    GENERAL_CALCULATION_SLIP: 'a slip in the arithmetic',
  };
  return known[code] ?? code.replace(/[-_]/g, ' ').toLowerCase();
}

/** Every learner's analytics, for the surfaces that list a family. */
export async function analyticsForLearners(
  db: Database,
  learnerIds: number[],
): Promise<Record<string, LearnerAnalytics>> {
  const entries = await Promise.all(
    learnerIds.map(async id => [String(id), await learnerAnalytics(db, id)] as const),
  );
  return Object.fromEntries(entries);
}

export { inArray };
