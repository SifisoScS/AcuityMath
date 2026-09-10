/**
 * The profiles the app shows, built from the server.
 *
 * ## Why this adapts rather than replaces
 *
 * `UserProfile` is the shape fourteen components already render. Replacing it
 * with the server's types would touch every one of them at once, guarded by
 * four front-end test files. So the type stays and its *source* changes: what
 * was demonstration seed data in `localStorage` is now the signed-in adult and
 * their real children.
 *
 * The components do not know the difference, which is the point — this slice
 * moves the data, and the next one can move the types with the data already
 * proven.
 *
 * ## What a signed-out visitor sees
 *
 * A placeholder, with every number zero. Not a child's record and not pretending
 * to be one: the dashboard reads `isSignedIn` and offers a sign-in prompt
 * instead of statistics. The placeholder exists so the shell renders at all —
 * sixty-seven places in `App.tsx` assume an active profile — rather than to fill
 * the screen with invented progress.
 */

import { useMemo } from 'react';

import { trpc } from '../lib/trpc';
import { tierForAge } from '../services/tiers';
import type { AgeTier, UserProfile } from '../types';

const ACTIVE_PROFILE_KEY = 'acuity_math_active_profile_id';

/** Who is signed in, if anybody. */
export function useSession() {
  const query = trpc.me.useQuery(undefined, { retry: false });

  return {
    user: query.data ?? null,
    isSignedIn: Boolean(query.data),
    // Distinguishes "still asking" from "asked, and nobody is signed in", which
    // the shell needs so it does not flash a sign-in prompt on every load.
    isResolving: query.isLoading,
  };
}

/**
 * A visitor who has not signed in.
 *
 * Zeroed rather than invented. A dashboard showing 980 ELO to somebody with no
 * account is the kind of thing that makes a demo feel finished and a product
 * feel dishonest.
 */
function placeholderProfile(): UserProfile {
  return {
    id: 'guest',
    name: 'Guest',
    role: 'student',
    age: 8,
    avatar: '🌱',
    tier: 'elementary',
    dynamicLevel: 0,
    eloRating: 0,
    xp: 0,
    coins: 0,
    streakDays: 0,
    streakShields: 0,
    accuracyRate: 0,
    completedLessonsCount: 0,
    unlockedAvatars: [],
  };
}

export interface ProfilesState {
  profiles: UserProfile[];
  activeProfile: UserProfile;
  activeProfileId: string;
  selectProfile: (id: string) => void;
  /** Re-reads the children and their progress from the server. */
  refresh: () => void;
  /** Adds a child to the signed-in guardian's account. */
  createLearner: (input: { displayName: string; birthYear: number; avatar?: string }) => Promise<void>;
  isSignedIn: boolean;
  isResolving: boolean;
  /** True when the shown profile is the placeholder rather than a real child. */
  isPlaceholder: boolean;
}

export function useProfiles(): ProfilesState {
  const { user, isSignedIn, isResolving: sessionResolving } = useSession();
  const learners = trpc.learners.list.useQuery(undefined, { retry: false, enabled: isSignedIn });
  const utils = trpc.useUtils();

  const profiles = useMemo<UserProfile[]>(() => {
    const rows = learners.data ?? [];
    return rows.map(learner => ({
      // Prefixed so it cannot collide with the adult's id below, and so a stale
      // stored selection from the demo era resolves to nothing rather than to
      // the wrong child.
      id: `learner-${learner.id}`,
      learnerId: learner.id,
      name: learner.displayName,
      role: 'student' as const,
      age: learner.age,
      avatar: learner.avatar,
      tier: learner.tier as AgeTier,
      // Real progress, from the same query. These were zeroed at first, on the
      // reasoning that progress belonged to the snapshot — which put "Level 0"
      // and "0 ELO" on the dashboard of a child who had answered eighteen
      // questions. Zeros about a real child are worse than the invented numbers
      // they replaced.
      dynamicLevel: learner.dynamicLevel,
      eloRating: learner.eloRating,
      xp: learner.xp,
      coins: learner.coins,
      streakDays: learner.streakDays,
      streakShields: learner.streakShields,
      accuracyRate: learner.accuracyRate,
      completedLessonsCount: learner.conceptsMastered,
      unlockedAvatars: [],
      parentContact: user?.email,
    }));
  }, [learners.data, user?.email]);

  const storedId = readStoredId();
  const active =
    profiles.find(profile => profile.id === storedId) ?? profiles[0] ?? placeholderProfile();

  const createMutation = trpc.learners.create.useMutation({
    onSuccess: () => utils.learners.list.invalidate(),
  });

  /**
   * Everything a component used to change by writing to local state.
   *
   * Progress moved to the server with the profiles, so a component that has
   * just recorded something asks for the new numbers rather than computing
   * them. Two sources for one figure is how a dashboard ends up disagreeing
   * with itself after a refresh.
   */
  const refresh = () => {
    utils.learners.list.invalidate();
    utils.learners.snapshot.invalidate();
  };

  const createLearner = async (input: { displayName: string; birthYear: number; avatar?: string }) => {
    await createMutation.mutateAsync(input);
  };

  const selectProfile = (id: string) => {
    writeStoredId(id);
    // The snapshot belongs to whichever learner is being looked at, so the one
    // cached for the previous child is stale the moment the switch happens.
    utils.learners.snapshot.invalidate();
  };

  return {
    profiles,
    activeProfile: active,
    activeProfileId: active.id,
    selectProfile,
    refresh,
    createLearner,
    isSignedIn,
    isResolving: sessionResolving || (isSignedIn && learners.isLoading),
    isPlaceholder: active.id === 'guest',
  };
}

function readStoredId(): string | null {
  if (typeof window === 'undefined') return null;
  return window.localStorage.getItem(ACTIVE_PROFILE_KEY);
}

function writeStoredId(id: string): void {
  try {
    window.localStorage.setItem(ACTIVE_PROFILE_KEY, id);
  } catch {
    // Private browsing. Losing the selection across a reload is a smaller
    // failure than refusing to switch child at all.
  }
}
