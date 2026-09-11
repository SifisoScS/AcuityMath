/**
 * Parental consent, from the server.
 *
 * `CoppaConsentModal` used to post to `/api/auth/coppa-consent` with a hardcoded
 * `'parent_sarah_1'`, which wrote to a gitignored JSON file. The endpoint now
 * returns 410 naming `consent.record`, and this is what calls it.
 *
 * The hook sends no user id, no learner ids and no policy hash. All three come
 * from the server, which is what stops a record describing something that did
 * not happen.
 */

import { useMemo } from 'react';

import { trpc } from '../lib/trpc';
import { isStepUpRequired } from './useStepUp';

export type ConsentStatus = 'granted' | 'withdrawn' | 'superseded' | 'none';

export interface ConsentState {
  learnerId: number;
  status: ConsentStatus;
  recordedAt: string | Date | null;
  policyVersion: string | null;
  attestedName: string | null;
  verifiedEmail: string | null;
  emailVerifiedAt: string | Date | null;
  secondStepSent: boolean;
}

export interface ConsentPolicy {
  version: string;
  clauses: string[];
  summary: string;
  verification: string;
}

export interface FamilyConsent {
  policy: ConsentPolicy | null;
  /** Keyed by profile id (`learner-12`), as every other client surface is. */
  byProfileId: Record<string, ConsentState>;
  /**
   * True only when every child on the account is covered under the current
   * policy.
   *
   * Deliberately not "any child is covered". A household where one child was
   * consented for and another was added afterwards is not a consented household,
   * and the old `hasCoppaConsent` — which defaulted to `true` and was corrected
   * only if a legacy endpoint answered — would have called it one.
   */
  allCovered: boolean;
  /** Children with no consent, or consent under a superseded policy. */
  uncovered: ConsentState[];
  isLoading: boolean;
  needsStepUp: boolean;
  record: (input: { decision: 'granted' | 'withdrawn'; attestedName: string }) => Promise<void>;
  isRecording: boolean;
  error: string | null;
}

export function useConsent(enabled: boolean): FamilyConsent {
  const utils = trpc.useUtils();
  const policy = trpc.consent.policy.useQuery(undefined, { enabled, retry: false });
  const family = trpc.consent.forFamily.useQuery(undefined, { enabled, retry: false });

  const mutation = trpc.consent.record.useMutation({
    onSuccess: () => {
      void utils.consent.forFamily.invalidate();
    },
  });

  const states = useMemo(
    () => Object.values((family.data as Record<string, ConsentState> | undefined) ?? {}),
    [family.data],
  );

  const byProfileId = useMemo(
    () =>
      Object.fromEntries(
        Object.entries((family.data as Record<string, ConsentState> | undefined) ?? {}).map(
          ([learnerId, state]) => [`learner-${learnerId}`, state],
        ),
      ),
    [family.data],
  );

  const uncovered = states.filter(state => state.status !== 'granted');

  return {
    policy: (policy.data as ConsentPolicy | undefined) ?? null,
    byProfileId,
    // `states.length > 0` matters: an account with no children has nothing
    // covered, and reporting that as "all covered" would be the fail-open
    // default in a new place.
    allCovered: states.length > 0 && uncovered.length === 0,
    uncovered,
    isLoading: policy.isLoading || family.isLoading,
    needsStepUp: isStepUpRequired(family.error) || isStepUpRequired(mutation.error),
    record: async ({ decision, attestedName }) => {
      const version = (policy.data as ConsentPolicy | undefined)?.version;
      if (!version) throw new Error('The consent terms have not loaded yet.');
      // The version the parent was *shown*. The server refuses it if a deploy
      // has moved on, which is the only honest response to a form that has been
      // open across one.
      await mutation.mutateAsync({ decision, attestedName, policyVersion: version });
    },
    isRecording: mutation.isPending,
    error: mutation.error?.message ?? null,
  };
}
