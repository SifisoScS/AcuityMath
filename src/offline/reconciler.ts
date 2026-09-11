/**
 * Sending queued answers to the server, and removing only what arrived.
 *
 * The code this replaces was `triggerCloudSync` in `App.tsx`:
 *
 *     apiService.syncBatch(...).catch(err => console.warn(...));
 *     setTimeout(() => {
 *       setSyncState(prev => ({ ...prev, pendingActions: [], ... }));
 *     }, 1200);
 *
 * The request was never awaited, the rejection was logged and dropped, and the
 * timer cleared the queue regardless — writing "Synced to Server" into a log
 * whatever had happened. A child who answered ten questions on a train arrived
 * home to a dashboard that said everything was saved and a database that had
 * none of it.
 *
 * So the contract here is: **nothing leaves the queue without an answer from the
 * server.** A rejection leaves the item in place and returns it as a failure the
 * banner can show.
 */

import type { AttemptQueue, QueuedAttempt } from './queue';

/**
 * What the server said about one answer.
 *
 * `replayed` means the server already had it — which is success, and the item
 * should go, but it is not work newly done. The distinction matters for what the
 * banner reports: "12 answers saved" when eleven of them were already there is
 * the sort of small lie that makes the other numbers untrustworthy.
 */
export interface SubmitOutcome {
  replayed: boolean;
}

export type SubmitAttempt = (attempt: QueuedAttempt) => Promise<SubmitOutcome>;

export interface ReconcileResult {
  /** Answers the server accepted for the first time. */
  delivered: number;
  /** Answers the server already had — retries of something that did arrive. */
  alreadyHad: number;
  /** Still queued, because the server did not confirm them. */
  remaining: number;
  /** The first failure, if any. Kept so the banner can say what went wrong. */
  error?: string;
}

/**
 * How many times an item is retried before the reconciler stops for this run.
 *
 * Not a cap on total attempts — the item stays queued and is tried again on the
 * next run. It bounds one pass so that a server returning errors does not spin
 * through a hundred queued answers producing a hundred failures before the
 * caller learns anything.
 */
const FAILURES_BEFORE_STOPPING = 3;

/**
 * Drains the queue.
 *
 * One at a time, oldest answer first, in sequence rather than in parallel. A
 * learner's attempts are not independent: each one moves the 3PL estimate, and
 * the next problem served depends on where that estimate landed. Sending them
 * concurrently would record a child's history in an order they never answered
 * in.
 *
 * Safe to call when already running — see `Reconciler` below, which serialises.
 */
export async function reconcile(
  queue: AttemptQueue,
  submit: SubmitAttempt,
): Promise<ReconcileResult> {
  const pending = await queue.all();
  let delivered = 0;
  let alreadyHad = 0;
  let failures = 0;
  let firstError: string | undefined;

  for (const attempt of pending) {
    try {
      const outcome = await submit(attempt);
      // Only here. The server has it.
      await queue.remove(attempt.clientId);
      if (outcome.replayed) alreadyHad += 1;
      else delivered += 1;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'The request failed.';
      firstError ??= message;
      await queue.markFailed(attempt.clientId, message);

      failures += 1;
      if (failures >= FAILURES_BEFORE_STOPPING) break;
    }
  }

  return {
    delivered,
    alreadyHad,
    remaining: await queue.size(),
    error: firstError,
  };
}

/**
 * Serialises reconciliation runs.
 *
 * Two runs at once would both read the same pending list and send every item
 * twice. The server would absorb that safely — that is what the client id is
 * for — but each duplicate is still a round trip, and the counts reported back
 * would double-count what was delivered.
 *
 * A run requested while one is in flight is not dropped: the answer that
 * triggered it may have been queued after the running pass read its list, so it
 * would otherwise wait for some later trigger that might never come.
 */
export class Reconciler {
  private running: Promise<ReconcileResult> | null = null;
  private runAgain = false;

  constructor(
    private readonly queue: AttemptQueue,
    private readonly submit: SubmitAttempt,
  ) {}

  get isRunning(): boolean {
    return this.running !== null;
  }

  async run(): Promise<ReconcileResult> {
    if (this.running) {
      this.runAgain = true;
      return this.running;
    }

    this.running = this.drain();
    try {
      return await this.running;
    } finally {
      this.running = null;
    }
  }

  private async drain(): Promise<ReconcileResult> {
    let result = await reconcile(this.queue, this.submit);

    while (this.runAgain) {
      this.runAgain = false;
      const again = await reconcile(this.queue, this.submit);
      result = {
        delivered: result.delivered + again.delivered,
        alreadyHad: result.alreadyHad + again.alreadyHad,
        remaining: again.remaining,
        error: again.error ?? result.error,
      };
    }

    return result;
  }
}
