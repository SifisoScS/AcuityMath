/**
 * One queue, one reconciler, for the whole application.
 *
 * Owned here rather than inside `usePractice` so that every surface shares the
 * same queue. Two hooks each opening their own IndexedDB connection would each
 * hold a partial view of what is unsent, and the banner would report one of
 * them.
 *
 * ## When it drains
 *
 * - On mount, because the last session may have ended with answers unsent.
 * - When connectivity returns, which is the case this exists for.
 * - When the child answers while online, since one successful request is good
 *   evidence that anything still queued can go now too.
 * - When somebody presses the button.
 *
 * It is deliberately not on a timer. A poll that fires while the device is still
 * offline produces a failed request, a logged error and a raised failure count
 * every few seconds, and buries the one failure that meant something.
 */

import { useCallback, useEffect, useRef, useState } from 'react';

import { trpc } from '../lib/trpc';
import { InMemoryQueue, openQueue, type AttemptQueue, type QueuedAttempt } from './queue';
import { Reconciler, type ReconcileResult } from './reconciler';
import { useConnectivity, type Connectivity } from './useConnectivity';

export interface OfflineState {
  status: Connectivity;
  /** True when answers should be queued rather than sent. */
  shouldQueue: boolean;
  /** Answers the server has not confirmed. */
  pendingCount: number;
  /** When a reconciliation last succeeded, or null if it never has this session. */
  lastSyncedAt: number | null;
  /** Why the last reconciliation failed. Null when the last one worked. */
  lastError: string | null;
  isSyncing: boolean;
  /** True while the queue is still being opened; the count is not yet known. */
  isLoading: boolean;
  enqueue: (attempt: QueuedAttempt) => Promise<void>;
  sync: () => Promise<ReconcileResult | null>;
  reportSuccess: () => void;
  reportFailure: () => void;
  setSimulatedOffline: (simulated: boolean) => void;
  /** What is waiting, for the detail panel. */
  pending: QueuedAttempt[];
}

export function useOffline(): OfflineState {
  const connectivity = useConnectivity();
  const utils = trpc.useUtils();

  const queueRef = useRef<AttemptQueue | null>(null);
  const reconcilerRef = useRef<Reconciler | null>(null);
  /**
   * Resolves once the queue is open.
   *
   * `enqueue` waits on this rather than throwing when it is called first. A
   * child can answer within a few hundred milliseconds of the page appearing,
   * and "the queue was not ready yet" is not a reason to lose their answer —
   * which is the one thing this module exists to prevent.
   */
  const readyRef = useRef<{ promise: Promise<void>; resolve: () => void }>(null!);
  if (!readyRef.current) {
    let resolve!: () => void;
    const promise = new Promise<void>(r => {
      resolve = r;
    });
    readyRef.current = { promise, resolve };
  }

  const [pending, setPending] = useState<QueuedAttempt[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSyncing, setIsSyncing] = useState(false);
  const [lastSyncedAt, setLastSyncedAt] = useState<number | null>(null);
  const [lastError, setLastError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const queue = queueRef.current;
    if (queue) setPending(await queue.all());
  }, []);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      let queue: AttemptQueue;
      try {
        queue = await openQueue();
      } catch {
        /*
         * Private browsing, or a storage policy that refuses. Losing the queue
         * when the tab closes is bad; refusing to let a child answer at all
         * because their answers cannot be persisted is worse.
         */
        queue = new InMemoryQueue();
      }
      if (cancelled) return;

      queueRef.current = queue;
      reconcilerRef.current = new Reconciler(queue, async attempt => {
        const result = await utils.client.practice.submit.mutate({
          learnerId: attempt.learnerId,
          problemId: attempt.problemId,
          sessionId: attempt.sessionId,
          answer: attempt.answer,
          responseTimeMs: attempt.responseTimeMs,
          // The attempt was given while the device could not reach the server,
          // which is a fact about the answer worth keeping.
          wasOffline: true,
          clientId: attempt.clientId,
        });
        return { replayed: Boolean((result as { replayed?: boolean }).replayed) };
      });

      setPending(await queue.all());
      setIsLoading(false);
      readyRef.current.resolve();
    })();

    return () => {
      cancelled = true;
    };
  }, [utils]);

  const sync = useCallback(async (): Promise<ReconcileResult | null> => {
    const reconciler = reconcilerRef.current;
    if (!reconciler) return null;

    setIsSyncing(true);
    try {
      const result = await reconciler.run();

      if (result.error) {
        setLastError(result.error);
        connectivity.reportFailure();
      } else {
        setLastError(null);
        // Only on a clean pass. Stamping this after a partial failure would put
        // "all synced, just now" over a queue that still has answers in it.
        if (result.delivered > 0 || result.alreadyHad > 0) setLastSyncedAt(Date.now());
        connectivity.reportSuccess();
      }

      await refresh();

      if (result.delivered > 0) {
        // The learner's numbers moved server-side; the dashboards should re-read
        // rather than keep showing what they had before the queue drained.
        void utils.learners.list.invalidate();
        void utils.learners.snapshot.invalidate();
      }

      return result;
    } finally {
      setIsSyncing(false);
    }
  }, [connectivity, refresh, utils]);

  const enqueue = useCallback(
    async (attempt: QueuedAttempt) => {
      await readyRef.current.promise;
      await queueRef.current!.enqueue(attempt);
      await refresh();
    },
    [refresh],
  );

  // Drain when the connection comes back, and once on mount for whatever the
  // last session left behind.
  const canSync = connectivity.status === 'online' && !isLoading;
  useEffect(() => {
    if (canSync) void sync();
    // `sync` is stable enough for this; re-running on every render would poll.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canSync]);

  const reportSuccess = useCallback(() => {
    connectivity.reportSuccess();
  }, [connectivity]);

  return {
    status: connectivity.status,
    shouldQueue: connectivity.shouldQueue,
    pendingCount: pending.length,
    lastSyncedAt,
    lastError,
    isSyncing,
    isLoading,
    enqueue,
    sync,
    reportSuccess,
    reportFailure: connectivity.reportFailure,
    setSimulatedOffline: connectivity.setSimulatedOffline,
    pending,
  };
}
