/**
 * A parent's view of their children, from the server.
 *
 * Replaces `INITIAL_ANALYTICS` — seven days of invented activity, four invented
 * mastery domains, and a recommended action somebody typed into `storage.ts`.
 *
 * The query is elevated, so it returns nothing until the parent has entered
 * their PIN. That is not a limitation to work around: the dashboard it feeds is
 * exactly what the step-up exists to protect, and a hook that quietly fell back
 * to demonstration data when refused would undo the gate it sits behind.
 */

import { useMemo } from 'react';

import { trpc } from '../lib/trpc';
import type { ParentAnalytics } from '../types';
import { isStepUpRequired } from './useStepUp';

export interface FamilyAnalytics {
  /** Re-reads the family's analytics. */
  refresh: () => void;
  /**
   * Sets one child's daily limit, server-side.
   *
   * It lived in browser state before, where the learner it restricts could
   * clear it — and the parent's setting did not survive changing device.
   */
  setScreenTimeLimit: (studentId: string, dailyLimitMinutes: number) => Promise<void>;
  /** Keyed by profile id (`learner-12`), matching the ids the dashboards hold. */
  analyticsMap: Record<string, ParentAnalytics>;
  isLoading: boolean;
  /** True when the parent is signed in but has not proved they are present. */
  needsStepUp: boolean;
}

/**
 * Re-keys the server's answer to the ids the dashboards hold.
 *
 * The server keys by learner id — `12` — because that is what a learner is.
 * Profiles are `learner-12`, prefixed so a stale selection from the
 * demonstration era cannot resolve to the wrong child. The dashboards look up
 * `analyticsMap[student.id]`, so without this every lookup misses and the
 * component dereferences undefined: "Cannot read properties of undefined
 * (reading 'totalTimeMinutes')", which is exactly what it did.
 *
 * Exported so the correspondence can be tested directly. It is one line of
 * mapping between two id vocabularies, and a mismatch there is invisible to
 * every test on either side of it.
 */
export function keyByProfileId(
  raw: Record<string, ParentAnalytics>,
): Record<string, ParentAnalytics> {
  return Object.fromEntries(
    Object.entries(raw).map(([learnerId, analytics]) => [
      `learner-${learnerId}`,
      { ...analytics, studentId: `learner-${learnerId}` },
    ]),
  );
}

/** The learner id inside a profile id, accepting either vocabulary. */
export function learnerIdFrom(studentId: string): number {
  return Number(studentId.replace(/^learner-/, ''));
}

export function useFamilyAnalytics(enabled: boolean): FamilyAnalytics {
  const utils = trpc.useUtils();
  const query = trpc.analytics.forFamily.useQuery(undefined, {
    enabled,
    retry: false,
  });

  const limitMutation = trpc.learners.setScreenTimeLimit.useMutation({
    onSuccess: () => utils.analytics.forFamily.invalidate(),
  });

  const refresh = () => {
    utils.analytics.forFamily.invalidate();
    utils.learners.list.invalidate();
  };

  const setScreenTimeLimit = async (studentId: string, dailyLimitMinutes: number) => {
    const learnerId = learnerIdFrom(studentId);
    // The analytics map is keyed by learner id as a string; anything else came
    // from the placeholder and has no row to update.
    if (!Number.isInteger(learnerId) || learnerId <= 0) return;
    await limitMutation.mutateAsync({ learnerId, dailyLimitMinutes });
  };

  const analyticsMap = useMemo(() => keyByProfileId((query.data as Record<string, ParentAnalytics>) ?? {}), [query.data]);

  return {
    refresh,
    setScreenTimeLimit,
    // Empty rather than invented when the answer has not arrived or was
    // refused. A dashboard showing last week's fiction while the real numbers
    // are still in flight is worse than one showing nothing.
    analyticsMap,
    isLoading: query.isLoading && query.fetchStatus !== 'idle',
    needsStepUp: isStepUpRequired(query.error),
  };
}
