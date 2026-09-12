/**
 * The screen-time limit, as the server counts it.
 *
 * The old version posted to `/api/students/:id/heartbeat` with an
 * `elapsedSeconds` the browser chose. Two things were wrong with it. The route
 * read a JSON store keyed `student_1..4` while this sends `learner-12`, so
 * every beat 404ed and `sendHeartbeat` returned `null` — **the lock never
 * engaged for anybody.** And even had the ids matched, the child being
 * restricted was the one reporting how long they had been on.
 *
 * The beat carries no duration now. The server measures the interval itself and
 * decides; this hook's only job is to knock once a minute and surface the
 * answer.
 */

import { useEffect, useState } from 'react';

import { trpc } from '../lib/trpc';

/** Matches the server's beat cap: two of these may pass before time is lost. */
export const BEAT_INTERVAL_MS = 60_000;

export interface ScreenTimeStatus {
  isLocked: boolean;
  minutesSpent: number;
  /** `null` when no parent has set a limit — which is not a limit of zero. */
  limitMinutes: number | null;
}

const UNCOUNTED: ScreenTimeStatus = { isLocked: false, minutesSpent: 0, limitMinutes: null };

/**
 * Beats for one learner while `active` holds.
 *
 * `active` is what stops a parent's dashboard from spending their child's
 * allowance: the beat runs for the profile actually practising, not for whoever
 * happens to be selected in an admin surface.
 */
export function useScreenTime(learnerId: number | null, active: boolean): ScreenTimeStatus {
  const [status, setStatus] = useState<ScreenTimeStatus>(UNCOUNTED);

  const heartbeat = trpc.learners.heartbeat.useMutation();
  const enabled = active && learnerId !== null;

  /*
   * The mount read is a query, not a beat. Beating here would bank the gap
   * since the last beat — which, on a browser reopened the next morning, is the
   * whole night. A child who stopped at the limit would be locked out of a new
   * day they have not started.
   */
  const initial = trpc.learners.screenTime.useQuery(
    { learnerId: learnerId ?? 0 },
    { enabled, retry: false, refetchOnWindowFocus: false },
  );

  useEffect(() => {
    if (!initial.data) return;
    setStatus({
      isLocked: initial.data.isLocked,
      minutesSpent: initial.data.minutesSpent,
      limitMinutes: initial.data.dailyLimitMinutes,
    });
  }, [initial.data]);

  useEffect(() => {
    if (!enabled || learnerId === null) {
      setStatus(UNCOUNTED);
      return;
    }

    let cancelled = false;
    const beat = async () => {
      try {
        const next = await heartbeat.mutateAsync({ learnerId });
        if (cancelled) return;
        setStatus({
          isLocked: next.isLocked,
          minutesSpent: next.minutesSpent,
          limitMinutes: next.dailyLimitMinutes,
        });
      } catch {
        /*
         * A failed beat is left alone deliberately. The server holds the count,
         * so a dropped request costs nothing — the next beat measures the whole
         * interval and the cap decides what that is worth. Clearing the lock on
         * error would turn an unreachable network into unlimited screen time,
         * which is the fail-open shape `apiService.verifyPin` had.
         */
      }
    };

    const interval = setInterval(beat, BEAT_INTERVAL_MS);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
    // `heartbeat` is a stable tRPC mutation handle; including it would restart
    // the interval on every render and beat far more often than once a minute.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, learnerId]);

  return status;
}
