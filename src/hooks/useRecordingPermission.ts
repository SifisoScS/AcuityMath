/**
 * Whether this learner's practice may be recorded.
 *
 * The policy is **allow practice, block recording, make it visible**. A child
 * without consent keeps practising — the generator runs here in the browser —
 * and nothing about that practice leaves the device.
 *
 * The server refuses `practice.submit` on its own authority too. This hook is
 * not the enforcement; it is what stops an unconsented child being sent to a
 * server that would refuse them, so the session is ordinary rather than a wall
 * of errors.
 */

import { trpc } from '../lib/trpc';

export interface RecordingPermission {
  mayRecord: boolean;
  /** Whether consent applies to this learner at all — under-13s only. */
  requiresConsent: boolean;
  /** True until the answer is known. Nothing is recorded while it is. */
  isDeciding: boolean;
}

/**
 * Blocked until told otherwise.
 *
 * The default matters more than the query. If this returned `mayRecord: true`
 * while the request was in flight, the first question of every session would be
 * submitted before the answer arrived — and for a child with no consent that is
 * precisely the record the gate exists to prevent. An unknown answer is not a
 * yes.
 */
const DECIDING: RecordingPermission = {
  mayRecord: false,
  requiresConsent: true,
  isDeciding: true,
};

export function useRecordingPermission(learnerId: number | null | undefined): RecordingPermission {
  const enabled = typeof learnerId === 'number' && learnerId > 0;

  const query = trpc.consent.statusForLearner.useQuery(
    { learnerId: learnerId ?? 0 },
    {
      enabled,
      retry: false,
      // Consent changes when a parent acts, which is rare and never mid-session.
      staleTime: 5 * 60 * 1000,
    },
  );

  // No learner means no session to record, so the question does not arise.
  if (!enabled) return { mayRecord: false, requiresConsent: false, isDeciding: false };

  /*
   * The last answer survives a failed refetch, deliberately.
   *
   * React Query keeps `data` when a later fetch fails, and that is the
   * behaviour wanted here: a consented child who walks into a tunnel should
   * keep the offline queue Graft D built for them, not lose it because the
   * permission check could not be repeated. Consent does not lapse because the
   * network did.
   *
   * A child whose permission was *never* fetched still gets `DECIDING` — which
   * blocks. The difference is between a fact that has gone stale and one that
   * was never established, and only the second is a reason to refuse.
   */
  if (!query.data) return DECIDING;

  return {
    mayRecord: query.data.mayRecord,
    requiresConsent: query.data.requiresConsent,
    isDeciding: false,
  };
}
