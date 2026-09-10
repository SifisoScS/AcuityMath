/**
 * Work an adult sets a child, and whether it came back.
 *
 * The shape this fills was `INITIAL_ASSIGNMENTS` in `src/utils/storage.ts` —
 * three invented quests held in React state, so a teacher who set homework and
 * reloaded the page had set nothing.
 *
 * ## Why an assignment must name a concept
 *
 * The form collected a free-text `topic`, a `tier` and a `difficulty` slider.
 * None of them existed server-side, none could be checked against anything, and
 * `difficulty` was never read back. An assignment that names a concept can be
 * measured — you can ask who has practised it and how they did — so `conceptId`
 * is required here and the topic and tier are read from the concept rather than
 * typed alongside it.
 *
 * ## Who may assign to whom
 *
 * `learnerProcedure` is guardian-or-admin, and deliberately so: a teacher must
 * not inherit a parent's powers over a child (`server/trpc/index.ts`). Setting
 * homework is the one thing a teacher *should* be able to do, so the rule lives
 * here rather than widening that procedure — a teacher reaches a learner through
 * a classroom they teach, and through nothing else.
 */

import { and, eq, inArray, sql } from 'drizzle-orm';

import * as schema from '../../drizzle/schema';
import type { Database } from '../db/client';

export interface AssignmentSummary {
  id: number;
  title: string;
  instructions: string;
  conceptId: string;
  conceptTitle: string;
  tier: 'early' | 'elementary' | 'middle' | 'high';
  /** `YYYY-MM-DD`, the day it was set. */
  assignedDate: string;
  dueDate: string | null;
  targetLearnerIds: number[];
  totalAssigned: number;
  completedCount: number;
  rewardCoins: number;
  /** Only meaningful on a learner's own view; null on the author's list. */
  status: 'pending' | 'completed' | null;
}

/**
 * Every learner this adult may set work for.
 *
 * Two routes, both explicit: their own children, and children in classrooms
 * they teach. There is no administrator bypass — a district administrator is
 * not a teacher, and giving the role a silent power over every child in the
 * system is how an access rule stops being one.
 */
export async function assignableLearnerIds(
  db: Database,
  userId: number,
): Promise<number[]> {
  const own = await db
    .select({ id: schema.learners.id })
    .from(schema.learners)
    .where(and(eq(schema.learners.guardianId, userId), sql`${schema.learners.archivedAt} is null`));

  const taught = await db
    .select({ id: schema.classroomLearners.learnerId })
    .from(schema.classroomLearners)
    .innerJoin(schema.classrooms, eq(schema.classrooms.id, schema.classroomLearners.classroomId))
    .where(eq(schema.classrooms.teacherId, userId));

  return [...new Set([...own.map(r => r.id), ...taught.map(r => r.id)])];
}

/** `YYYY-MM-DD` in the server's zone; the column is a `date`, not a timestamp. */
function isoDay(value: Date): string {
  return value.toISOString().slice(0, 10);
}

/**
 * Assignments this adult set, with how many have come back.
 *
 * The counts are read from `assignment_targets` rather than stored on the
 * assignment. A stored `completedCount` is a second source for a number the
 * rows already answer, and the two disagree the first time a write fails.
 */
export async function authoredAssignments(
  db: Database,
  userId: number,
): Promise<AssignmentSummary[]> {
  const rows = await db
    .select({
      id: schema.assignments.id,
      title: schema.assignments.title,
      description: schema.assignments.description,
      conceptId: schema.assignments.conceptId,
      conceptTitle: schema.concepts.title,
      tier: schema.concepts.tier,
      createdAt: schema.assignments.createdAt,
      dueDate: schema.assignments.dueDate,
      rewardCoins: schema.assignments.rewardCoins,
    })
    .from(schema.assignments)
    .innerJoin(schema.concepts, eq(schema.concepts.id, schema.assignments.conceptId))
    .where(eq(schema.assignments.assignedByUserId, userId))
    .orderBy(sql`${schema.assignments.createdAt} desc`);

  if (rows.length === 0) return [];

  const targets = await db
    .select({
      assignmentId: schema.assignmentTargets.assignmentId,
      learnerId: schema.assignmentTargets.learnerId,
      status: schema.assignmentTargets.status,
    })
    .from(schema.assignmentTargets)
    .where(inArray(schema.assignmentTargets.assignmentId, rows.map(r => r.id)));

  return rows.map(row => {
    const mine = targets.filter(t => t.assignmentId === row.id);
    return {
      id: row.id,
      title: row.title,
      instructions: row.description ?? '',
      conceptId: row.conceptId!,
      conceptTitle: row.conceptTitle,
      tier: row.tier,
      assignedDate: isoDay(row.createdAt),
      dueDate: row.dueDate,
      targetLearnerIds: mine.map(t => t.learnerId),
      totalAssigned: mine.length,
      completedCount: mine.filter(t => t.status === 'completed').length,
      rewardCoins: row.rewardCoins,
      status: null,
    };
  });
}

/** What one child has been set. */
export async function assignmentsForLearner(
  db: Database,
  learnerId: number,
): Promise<AssignmentSummary[]> {
  const rows = await db
    .select({
      id: schema.assignments.id,
      title: schema.assignments.title,
      description: schema.assignments.description,
      conceptId: schema.assignments.conceptId,
      conceptTitle: schema.concepts.title,
      tier: schema.concepts.tier,
      createdAt: schema.assignments.createdAt,
      dueDate: schema.assignments.dueDate,
      rewardCoins: schema.assignments.rewardCoins,
      status: schema.assignmentTargets.status,
    })
    .from(schema.assignmentTargets)
    .innerJoin(schema.assignments, eq(schema.assignments.id, schema.assignmentTargets.assignmentId))
    .innerJoin(schema.concepts, eq(schema.concepts.id, schema.assignments.conceptId))
    .where(eq(schema.assignmentTargets.learnerId, learnerId))
    .orderBy(sql`${schema.assignments.createdAt} desc`);

  return rows.map(row => ({
    id: row.id,
    title: row.title,
    instructions: row.description ?? '',
    conceptId: row.conceptId!,
    conceptTitle: row.conceptTitle,
    tier: row.tier,
    assignedDate: isoDay(row.createdAt),
    dueDate: row.dueDate,
    // A child sees their own assignment, not who else was set it.
    targetLearnerIds: [learnerId],
    totalAssigned: 1,
    completedCount: row.status === 'completed' ? 1 : 0,
    rewardCoins: row.rewardCoins,
    status: row.status,
  }));
}
