/**
 * Proving the adult is present.
 *
 * The server side of this is finished and enforced: `elevatedProcedure` refuses
 * anything that touches one child's records on behalf of another. This hook is
 * the client's half.
 *
 * ## This gate is real
 *
 * This comment used to say `ParentPinModal` still called the legacy
 * `/api/auth/verify-pin` and that the gate was theatre. Both halves are now
 * false: the modal calls `useStepUp` below, C3 moved the gate onto real
 * elevation, and the route was deleted with the rest of the credential surface.
 * A reader trusting the old text would have concluded the PIN check was a prop.
 *
 * What it guards is real too. The parent and teacher dashboards read a child's
 * own attempts, and the procedures behind them are `elevatedProcedure` — the
 * modal is the prompt, not the check, so reasoning around it reaches nothing.
 *
 * The district and LMS dashboards still read demonstration data. Graft E4
 * quarantines them.
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
