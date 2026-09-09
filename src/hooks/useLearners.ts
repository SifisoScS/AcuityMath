/**
 * Learners, from the server.
 *
 * The service layer between `App.tsx` and tRPC. Components ask for "the
 * learners" and "the active learner"; they do not know a query exists. That is
 * what lets the lift proceed one component at a time — a component moved onto
 * these hooks does not change again when the next one moves.
 *
 * Every hook here returns the same three-part shape: the data, whether it is
 * still arriving, and whether it failed. `App.tsx` currently has no notion of
 * either of the last two — its state is simply present, because it came from
 * `localStorage` synchronously. Making loading and failure explicit is the
 * substance of this migration, not an incidental cost of it.
 */

import { useCallback, useEffect, useState } from 'react';

import { trpc } from '../lib/trpc';
import type { AgeTier } from '../services/tiers';

export interface Learner {
  id: number;
  displayName: string;
  avatar: string;
  birthYear: number;
  age: number;
  tier: AgeTier;
}

const ACTIVE_LEARNER_KEY = 'acuity_math_active_learner_id';

/**
 * The signed-in guardian's children.
 *
 * Returns an empty list rather than a failure when nobody is signed in, because
 * the landing page renders for anonymous visitors and a thrown error there
 * would blank the page for someone who has not been asked to sign in yet.
 */
export function useLearners() {
  const query = trpc.learners.list.useQuery(undefined, {
    retry: false,
  });

  return {
    learners: (query.data ?? []) as Learner[],
    isLoading: query.isLoading,
    error: query.error,
    /** True when the caller is not signed in, as opposed to having no children. */
    isSignedOut: query.error?.data?.code === 'UNAUTHORIZED',
    refetch: query.refetch,
  };
}

/**
 * Which child is being looked at.
 *
 * The selection is a client concern — it is about this browser tab, not about
 * the account — so it stays in `localStorage`. What changes is that the
 * *learners themselves* now come from the server; only the pointer is local.
 *
 * A stored id that is no longer among the guardian's children resolves to the
 * first one instead of to nothing. That happens after a child is archived, and
 * a parent should not meet an empty screen because of it.
 */
export function useActiveLearner() {
  const { learners, isLoading, error, isSignedOut } = useLearners();
  const [storedId, setStoredId] = useState<number | null>(() => readStoredId());

  const active =
    learners.find(learner => learner.id === storedId) ?? learners[0] ?? null;

  // Keep the stored pointer honest: if it named a learner who has gone, write
  // back the one actually being shown so a reload is consistent with this view.
  useEffect(() => {
    if (!active) return;
    if (active.id !== storedId) {
      writeStoredId(active.id);
      setStoredId(active.id);
    }
  }, [active, storedId]);

  const selectLearner = useCallback((id: number) => {
    writeStoredId(id);
    setStoredId(id);
  }, []);

  return { learner: active, learners, selectLearner, isLoading, error, isSignedOut };
}

export function useCreateLearner() {
  const utils = trpc.useUtils();
  const mutation = trpc.learners.create.useMutation({
    // The list is stale the moment a child is added, and a parent who has just
    // created one expects to see them.
    onSuccess: () => utils.learners.list.invalidate(),
  });

  return {
    createLearner: mutation.mutateAsync,
    isCreating: mutation.isPending,
    error: mutation.error,
  };
}

/**
 * Everything one child's dashboard needs.
 *
 * `enabled` guards the query rather than the caller: a hook called with no
 * learner yet — during the first render, before the list has arrived — should
 * not fire a request for learner `undefined`.
 */
export function useLearnerSnapshot(learnerId: number | null | undefined) {
  const query = trpc.learners.snapshot.useQuery(
    { learnerId: learnerId ?? 0 },
    { enabled: typeof learnerId === 'number' && learnerId > 0 },
  );

  return {
    snapshot: query.data ?? null,
    isLoading: query.isLoading && query.fetchStatus !== 'idle',
    error: query.error,
  };
}

function readStoredId(): number | null {
  if (typeof window === 'undefined') return null;
  const raw = window.localStorage.getItem(ACTIVE_LEARNER_KEY);
  const parsed = raw ? Number(raw) : NaN;
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function writeStoredId(id: number): void {
  try {
    window.localStorage.setItem(ACTIVE_LEARNER_KEY, String(id));
  } catch {
    // Private browsing, or a full quota. Losing the selection across a reload
    // is a smaller failure than refusing to switch learner at all.
  }
}
