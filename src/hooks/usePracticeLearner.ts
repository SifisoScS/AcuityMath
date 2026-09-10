/**
 * A server learner for the profile the app is currently showing.
 *
 * ## This is a bridge, and it is meant to be removed
 *
 * The practice view can serve 1,132 verified problems as soon as it has a
 * numeric learner id. The profile system cannot give it one: profiles are demo
 * seed data with string ids like `user-maya`, held in `localStorage`, and moving
 * them to the server means moving guardianship, the profile switcher and the
 * PIN gates with them — which is Graft C's territory, not this slice's.
 *
 * So this finds or creates a server learner matching the visible profile, and
 * remembers the pairing locally. It lets real content reach a learner now
 * without touching a single identity surface, and it deletes itself when the
 * profile system moves: at that point `useActiveLearner` already returns the id
 * this hook is standing in for.
 *
 * What it is *not* is an identity mechanism. Every learner it creates belongs to
 * whoever the server says is signed in, which in development is one account. It
 * would be actively wrong in production, and the procedures it calls refuse
 * unauthenticated callers, so it fails closed rather than inventing anybody.
 */

import { useEffect, useRef, useState } from 'react';

import { trpc } from '../lib/trpc';
import type { UserProfile } from '../types';

/** Where the profile-to-learner pairing is remembered between visits. */
const PAIRING_KEY = 'acuity_math_profile_learner_pairing';

type Pairing = Record<string, number>;

function readPairing(): Pairing {
  try {
    return JSON.parse(window.localStorage.getItem(PAIRING_KEY) ?? '{}') as Pairing;
  } catch {
    return {};
  }
}

function writePairing(profileId: string, learnerId: number): void {
  try {
    window.localStorage.setItem(
      PAIRING_KEY,
      JSON.stringify({ ...readPairing(), [profileId]: learnerId }),
    );
  } catch {
    // Losing the pairing costs one extra lookup next time, nothing more.
  }
}

export interface PracticeLearner {
  /** Null while resolving, or when the server is unreachable. */
  learnerId: number | null;
  isResolving: boolean;
  /** True when the server cannot be reached, so the caller can fall back. */
  isUnavailable: boolean;
}

export function usePracticeLearner(profile: UserProfile | null | undefined): PracticeLearner {
  const [learnerId, setLearnerId] = useState<number | null>(null);
  const [isResolving, setIsResolving] = useState(false);
  const [isUnavailable, setIsUnavailable] = useState(false);

  const list = trpc.learners.list.useQuery(undefined, { retry: false });
  const create = trpc.learners.create.useMutation();

  // Guards against creating the same learner twice when React re-runs the
  // effect — in StrictMode it runs twice on mount, and a second create would
  // leave a duplicate child on the account.
  const claiming = useRef<string | null>(null);

  useEffect(() => {
    if (!profile || profile.role !== 'student') {
      setLearnerId(null);
      return;
    }

    if (list.isLoading) return;

    if (list.error) {
      setIsUnavailable(true);
      setLearnerId(null);
      return;
    }

    setIsUnavailable(false);

    const remembered = readPairing()[profile.id];
    const learners = list.data ?? [];

    if (remembered && learners.some(learner => learner.id === remembered)) {
      setLearnerId(remembered);
      return;
    }

    // No pairing, or it names a learner who has gone. Match on the name the
    // profile shows before creating anything, so a page reload does not add a
    // second Maya.
    const byName = learners.find(learner => learner.displayName === profile.name);
    if (byName) {
      writePairing(profile.id, byName.id);
      setLearnerId(byName.id);
      return;
    }

    if (claiming.current === profile.id) return;
    claiming.current = profile.id;
    setIsResolving(true);

    create
      .mutateAsync({
        displayName: profile.name,
        // The server stores a birth year rather than an age, because an age is
        // wrong within a year of being written.
        birthYear: new Date().getFullYear() - profile.age,
        avatar: profile.avatar,
      })
      .then(created => {
        writePairing(profile.id, created.id);
        setLearnerId(created.id);
      })
      .catch(() => {
        setIsUnavailable(true);
        setLearnerId(null);
      })
      .finally(() => {
        setIsResolving(false);
        claiming.current = null;
      });
    // `create` is a new object each render; depending on it would loop.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile?.id, profile?.name, profile?.age, profile?.role, list.isLoading, list.error, list.data]);

  return { learnerId, isResolving, isUnavailable };
}
