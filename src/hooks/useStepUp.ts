/**
 * Proving the adult is present.
 *
 * The server side of this is finished and enforced: `elevatedProcedure` refuses
 * anything that touches one child's records on behalf of another. This hook is
 * the client's half.
 *
 * ## What is deliberately not wired yet
 *
 * `ParentPinModal` still calls the legacy `/api/auth/verify-pin`, which compares
 * a PIN against demo accounts in a JSON file. That gate stands in front of the
 * parent, teacher and district dashboards — and every one of those reads
 * demonstration data, not a real learner's records. Replacing it now would swap
 * one piece of theatre for another while the surfaces behind it still show
 * invented numbers.
 *
 * It becomes real in the same change that moves those dashboards onto the
 * server: at that point they read a real child's mastery, and they must be built
 * on `elevatedProcedure` rather than on a modal that can be reasoned around.
 * That is tracked in docs/MIGRATION_STATUS.md.
 */

import { useCallback } from 'react';

import { trpc } from '../lib/trpc';

export interface StepUpState {
  /** Whether this account has chosen a PIN. Null while the answer is arriving. */
  hasPin: boolean | null;
  /** Whether the adult has proved they are present, in the last fifteen minutes. */
  isElevated: boolean | null;
  isLoading: boolean;
}

export function useStepUpStatus(): StepUpState {
  const query = trpc.access.status.useQuery(undefined, { retry: false });

  return {
    hasPin: query.data?.hasPin ?? null,
    isElevated: query.data?.isElevated ?? null,
    isLoading: query.isLoading,
  };
}

export function useStepUp() {
  const utils = trpc.useUtils();
  // The elevation cookie changes what the server will answer, so anything that
  // reported an un-elevated state is now stale.
  const refresh = () => utils.access.status.invalidate();

  const setPinMutation = trpc.access.setPin.useMutation({ onSuccess: refresh });
  const elevateMutation = trpc.access.elevate.useMutation({ onSuccess: refresh });
  const standDownMutation = trpc.access.standDown.useMutation({ onSuccess: refresh });

  /**
   * Returns the server's message rather than a generic one.
   *
   * "Incorrect PIN, two attempts left", "Too many attempts, try again in 15
   * minutes" and "no PIN has been set" have different next steps for the person
   * at the screen, and the server is the only thing that knows which applies.
   */
  const elevate = useCallback(
    async (pin: string): Promise<{ ok: true } | { ok: false; message: string }> => {
      try {
        await elevateMutation.mutateAsync({ pin });
        return { ok: true };
      } catch (error) {
        return { ok: false, message: (error as { message?: string })?.message ?? 'Could not verify that PIN.' };
      }
    },
    [elevateMutation],
  );

  const setPin = useCallback(
    async (pin: string): Promise<{ ok: true } | { ok: false; message: string }> => {
      try {
        await setPinMutation.mutateAsync({ pin });
        return { ok: true };
      } catch (error) {
        return { ok: false, message: (error as { message?: string })?.message ?? 'Could not set that PIN.' };
      }
    },
    [setPinMutation],
  );

  /** Hands the device back to a child. */
  const standDown = useCallback(async () => {
    await standDownMutation.mutateAsync();
  }, [standDownMutation]);

  return {
    elevate,
    setPin,
    standDown,
    isWorking: elevateMutation.isPending || setPinMutation.isPending,
  };
}

/**
 * Whether a failure was the server asking for a step-up.
 *
 * `elevatedProcedure` answers FORBIDDEN with this exact message so the client
 * can tell "prove you are the adult" apart from "you may not have this at all"
 * — the first should open a PIN prompt, the second should not.
 */
export function isStepUpRequired(error: unknown): boolean {
  return (error as { message?: string })?.message === 'STEP_UP_REQUIRED';
}
