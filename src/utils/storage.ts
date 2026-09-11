import { UserProfile, TeacherAssignment, NotificationItem, AgeTier } from '../types';
import { INITIAL_ACHIEVEMENTS } from '../data/curriculumData';
import { tierForAge } from '../services/tiers';

/*
 * `INITIAL_PROFILES` stood here: Maya, Leo, Sophia and Alex, invented, with
 * invented levels, ELO ratings, coins and streaks.
 *
 * Profiles have come from the server since B3e. This was the last piece of
 * demonstration data in this file, and by the end it was dead: imported into
 * `App.tsx` and referenced only by a comment explaining what had replaced it.
 */

/*
 * `INITIAL_ANALYTICS` stood here: three children's worth of invented weekly
 * activity, mastery domains and advice, keyed `user-maya`/`user-leo`/`user-alex`.
 *
 * It is gone because analytics are derived from the child's own attempts now
 * (`server/learning/analytics.ts`). Leaving it would not have been harmless —
 * every consumer had learned to fall back to `INITIAL_ANALYTICS['user-maya']`
 * when a lookup missed, so a parent selecting Leo saw Maya's numbers under
 * Leo's name, and a child with no screen-time limit was shown Maya's.
 */

/*
 * `INITIAL_ASSIGNMENTS` stood here: three invented quests, held in React
 * state, so a teacher who set homework and reloaded had set nothing. They were
 * not self-consistent either — one listed two target students while reporting
 * eighteen assigned and fifteen returned.
 *
 * Assignments are rows now (`server/learning/assignments.ts`), and the counts
 * are read from `assignment_targets` rather than stored beside them.
 */

/*
 * `INITIAL_NOTIFICATIONS` stood here: four invented items about children who
 * do not exist — "Alex Rivera achieved Level 8", "Leo Chen is on a 7-day
 * streak" — one of them repeating the invented analytics deleted in B3f-1
 * ("Maya practiced 145 minutes this week with 94% accuracy").
 *
 * Their timestamps were strings: a notification written as '15 mins ago' was
 * saved to localStorage saying '15 mins ago' and still said it days later.
 *
 * Notifications are rows now, raised by the two events that actually happen —
 * a concept crossing into mastery, and work being set. See
 * `server/learning/notifications.ts`.
 */

/**
 * @deprecated Import `tierForAge` from `services/tiers` instead.
 *
 * Kept as a re-export so the existing call sites keep working while they move.
 * The bands themselves now live in one place, because there were two of them and
 * they disagreed — see `services/tiers.ts`.
 */
export function determineTierForAge(age: number): AgeTier {
  return tierForAge(age);
}

/**
 * LocalStorage wrapper with fallback
 */
export function getSavedItem<T>(key: string, fallback: T): T {
  if (typeof window === 'undefined') return fallback;
  try {
    const item = localStorage.getItem(`acuity_math_${key}`);
    return item ? JSON.parse(item) : fallback;
  } catch (e) {
    console.warn(`Error reading key ${key}:`, e);
    return fallback;
  }
}

export function saveItem<T>(key: string, value: T): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(`acuity_math_${key}`, JSON.stringify(value));
  } catch (e) {
    console.warn(`Error saving key ${key}:`, e);
  }
}
