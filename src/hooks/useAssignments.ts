/**
 * Assignments, from the server.
 *
 * Replaces `INITIAL_ASSIGNMENTS` — three invented quests held in React state, so
 * a teacher who set homework and reloaded the page had set nothing. The invented
 * rows were not even self-consistent: one listed two target students and
 * reported eighteen assigned with fifteen returned.
 *
 * Counts here are read from `assignment_targets`, so `totalAssigned` is the
 * number of children who were actually set the work.
 */

import { useMemo } from 'react';

import { trpc } from '../lib/trpc';
import type { AgeTier, TeacherAssignment, UserProfile } from '../types';
import { isStepUpRequired } from './useStepUp';

interface ServerAssignment {
  id: number;
  title: string;
  instructions: string;
  conceptId: string;
  conceptTitle: string;
  tier: AgeTier;
  assignedDate: string;
  dueDate: string | null;
  targetLearnerIds: number[];
  totalAssigned: number;
  completedCount: number;
  rewardCoins: number;
  status: 'pending' | 'completed' | null;
}

/**
 * The server's row in the shape the dashboards render.
 *
 * `targetStudents` holds profile ids (`learner-12`) rather than learner ids,
 * because `StudentDashboard` filters with `targetStudents.includes(user.id)` and
 * `user.id` is a profile id. Keying analytics by the wrong one of these two
 * vocabularies crashed the parent dashboard on every load; the mapping is done
 * here, once, for the same reason.
 */
export function toTeacherAssignment(row: ServerAssignment): TeacherAssignment {
  return {
    id: String(row.id),
    title: row.title,
    // The concept is the topic. It used to be free text typed beside a tier
    // that nothing checked it against.
    topic: row.conceptTitle,
    tier: row.tier,
    assignedDate: row.assignedDate,
    dueDate: row.dueDate ?? '',
    targetStudents: row.targetLearnerIds.map(id => `learner-${id}`),
    totalAssigned: row.totalAssigned,
    completedCount: row.completedCount,
    customInstructions: row.instructions,
  };
}

export interface NewAssignment {
  title: string;
  instructions: string;
  conceptId: string;
  dueDate?: string;
  rewardCoins?: number;
  /** Profile ids (`learner-12`), as the picker holds them. */
  targetStudents: string[];
}

export function useAuthoredAssignments(enabled: boolean) {
  const utils = trpc.useUtils();
  const query = trpc.assignments.authored.useQuery(undefined, { enabled, retry: false });
  const concepts = trpc.curriculum.concepts.useQuery(undefined, { enabled, retry: false });
  const assignable = trpc.assignments.assignableLearners.useQuery(undefined, {
    enabled,
    retry: false,
  });

  const createMutation = trpc.assignments.create.useMutation({
    onSuccess: () => {
      void utils.assignments.authored.invalidate();
    },
  });

  const assignments = useMemo(
    () => ((query.data as ServerAssignment[] | undefined) ?? []).map(toTeacherAssignment),
    [query.data],
  );

  const create = async (input: NewAssignment) => {
    await createMutation.mutateAsync({
      title: input.title,
      instructions: input.instructions,
      conceptId: input.conceptId,
      dueDate: input.dueDate || undefined,
      rewardCoins: input.rewardCoins ?? 0,
      learnerIds: input.targetStudents.map(id => Number(id.replace(/^learner-/, ''))),
    });
  };

  /**
   * The children this adult may set work for, as profiles the views render.
   *
   * This is the teacher's roster as well as the assignment picker. `useProfiles`
   * cannot supply it: `learners.list` returns the signed-in *guardian's* own
   * children, so a teacher signing in saw an empty class and a form with nobody
   * in it. A teacher reaches a learner through a classroom they teach.
   */
  const assignableStudents = useMemo<UserProfile[]>(
    () =>
      (assignable.data ?? []).map(row => ({
        id: `learner-${row.id}`,
        learnerId: row.id,
        name: row.displayName,
        role: 'student' as const,
        age: row.age,
        avatar: row.avatar,
        tier: row.tier as AgeTier,
        dynamicLevel: row.dynamicLevel,
        eloRating: row.eloRating,
        xp: row.xp,
        coins: row.coins,
        streakDays: row.streakDays,
        streakShields: row.streakShields,
        accuracyRate: row.accuracyRate,
        completedLessonsCount: row.conceptsMastered,
        unlockedAvatars: [],
      })),
    [assignable.data],
  );

  return {
    assignments,
    concepts: concepts.data ?? [],
    assignableStudents,
    /** The children this adult may set work for; a teacher sees their classroom. */
    assignableLearnerIds: assignableStudents.map(row => row.id),
    create,
    isCreating: createMutation.isPending,
    /** The reason a create failed, for the form to show rather than swallow. */
    createError: createMutation.error?.message ?? null,
    isLoading: query.isLoading,
    needsStepUp: isStepUpRequired(createMutation.error),
  };
}

/** What one child has been set. */
export function useLearnerAssignments(learnerId: number | null) {
  const query = trpc.assignments.forLearner.useQuery(
    { learnerId: learnerId ?? 0 },
    { enabled: learnerId !== null, retry: false },
  );

  return useMemo(
    () => ((query.data as ServerAssignment[] | undefined) ?? []).map(toTeacherAssignment),
    [query.data],
  );
}
