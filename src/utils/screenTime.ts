/**
 * What a child's screen-time meter should say.
 *
 * Its own module because the rule that matters here is a distinction the
 * arithmetic does not make on its own: **a limit of zero means no limit has been
 * set**, not a limit of zero minutes. `screenTimeRules` has no row until a
 * parent creates one, and `learnerAnalytics` reports that absence as `0`.
 *
 * Computed inline in `App.tsx`, it went wrong twice. It read
 * `analyticsMap['user-maya'] || { totalTimeMinutes: 42, screenTimeLimitMinutes: 45 }`,
 * so a child whose parent had set no limit was shown 42 of 45 minutes used and a
 * pulsing red badge — three minutes from a cut-off nobody had configured. Fixing
 * the fallback alone would have replaced it with a worse reading:
 * `max(0, 0 - minutesPractised)` is zero remaining, so every unconfigured child
 * would sit permanently at their limit.
 */

export interface ScreenTimeMeter {
  minutesUsed: number;
  limitMinutes: number;
  /** False when no parent has set a limit; the meter is not shown at all. */
  hasLimit: boolean;
  /** `Infinity` where there is no limit, so no comparison reads as "nearly up". */
  remainingMinutes: number;
  isNearLimit: boolean;
}

/** Minutes left before a warning; five is the app's long-standing threshold. */
const WARN_AT_MINUTES = 5;

export function screenTimeMeter(
  analytics: { totalTimeMinutes: number; screenTimeLimitMinutes: number } | undefined,
): ScreenTimeMeter {
  const minutesUsed = analytics?.totalTimeMinutes ?? 0;
  const limitMinutes = analytics?.screenTimeLimitMinutes ?? 0;
  const hasLimit = limitMinutes > 0;
  const remainingMinutes = hasLimit ? Math.max(0, limitMinutes - minutesUsed) : Infinity;

  return {
    minutesUsed,
    limitMinutes,
    hasLimit,
    remainingMinutes,
    isNearLimit: hasLimit && remainingMinutes <= WARN_AT_MINUTES,
  };
}
