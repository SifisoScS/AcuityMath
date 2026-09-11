/**
 * The offline queue, reachable from anywhere that records an answer.
 *
 * A context rather than a prop, because the alternative is threading `offline`
 * from `App` through `StudentDashboard` into `InfiniteAdaptiveModal` — three
 * components, two of which have no interest in it — and any surface added later
 * that records an answer would have to be threaded too. The one thing that must
 * never happen is a new answer path quietly bypassing the queue, and a prop
 * chain makes that the path of least resistance.
 *
 * The default is deliberately a working, online-only implementation rather than
 * a thrown error. A test rendering a component in isolation should exercise the
 * ordinary path, not fail on plumbing; and if a provider is ever forgotten the
 * application still sends answers, it just stops queueing them.
 */

import React, { createContext, useContext } from 'react';

import type { QueuedAttempt } from './queue';

export interface OfflineSupport {
  shouldQueue: boolean;
  enqueue: (attempt: QueuedAttempt) => Promise<void>;
  reportSuccess: () => void;
  reportFailure: () => void;
}

const ALWAYS_ONLINE: OfflineSupport = {
  shouldQueue: false,
  enqueue: async () => {},
  reportSuccess: () => {},
  reportFailure: () => {},
};

const OfflineContext = createContext<OfflineSupport>(ALWAYS_ONLINE);

/**
 * Provides the queue to everything that records an answer.
 *
 * Takes the state rather than calling `useOffline` itself, so the hook runs
 * exactly once. Calling it here *and* in `App` — which needs the counts for the
 * banner — would open two IndexedDB connections, each holding a partial view of
 * what is unsent.
 */
export const OfflineProvider: React.FC<{
  value: OfflineSupport;
  children: React.ReactNode;
}> = ({ value, children }) => (
  <OfflineContext.Provider value={value}>{children}</OfflineContext.Provider>
);

export function useOfflineSupport(): OfflineSupport {
  return useContext(OfflineContext);
}
