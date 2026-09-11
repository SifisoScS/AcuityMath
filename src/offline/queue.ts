/**
 * Answers a child has given that the server has not confirmed.
 *
 * ## Why this exists
 *
 * `App.tsx` kept a `pendingActions` array in React state, mirrored to
 * localStorage, and `triggerCloudSync` emptied it on a `setTimeout` while the
 * request it had fired went unawaited with a `.catch` that only logged. A failed
 * sync reported success and threw the child's work away.
 *
 * So the rule this module exists to keep is narrow and absolute: **an item
 * leaves the queue only when the server has said it has it.** Everything else —
 * ordering, retries, the banner — follows from that.
 *
 * ## Why IndexedDB rather than localStorage
 *
 * localStorage is synchronous, which means every write blocks the main thread
 * while a child is answering, and it is capped around 5MB shared with everything
 * else the origin stores. More importantly it has no transactions: a tab closed
 * between reading the array, pushing to it and writing it back loses whatever
 * another tab wrote in between. Two tabs open on a family tablet is not exotic.
 *
 * ## What is stored
 *
 * The `clientId` is generated when the child answers, not when the record is
 * sent. That is what makes a retry safe: the server has a unique index on
 * `(learner_id, client_id)` and returns the original result for a replay rather
 * than recording a second attempt. Generating it at send time would defeat the
 * whole mechanism, because a retry would carry a new id and count again.
 */

export interface QueuedAttempt {
  /** Made when the child answered. The server deduplicates on this. */
  clientId: string;
  learnerId: number;
  problemId: number;
  sessionId?: number;
  answer: string;
  responseTimeMs?: number;
  /** When the child answered, not when this was queued for sending. */
  answeredAt: number;
  /** How many delivery attempts have been made and failed. */
  attempts: number;
  /** Why the last attempt failed, for the banner to show rather than swallow. */
  lastError?: string;
}

const DATABASE_NAME = 'acuitymath-offline';
const STORE = 'pending-attempts';
const VERSION = 1;

/**
 * The queue's storage, as an interface.
 *
 * IndexedDB is one implementation; the tests use it through `fake-indexeddb`, so
 * the adapter below is exercised rather than stubbed. The interface exists so
 * that `Reconciler` can be tested against a trivial in-memory store without
 * standing up a database, and so a future adapter is a new file rather than a
 * rewrite.
 */
export interface AttemptQueue {
  /** Adds an answer. Re-adding the same `clientId` replaces it rather than duplicating. */
  enqueue(attempt: QueuedAttempt): Promise<void>;
  /** Everything waiting, oldest answer first. */
  all(): Promise<QueuedAttempt[]>;
  /** Removes one item. Called only once the server has confirmed it. */
  remove(clientId: string): Promise<void>;
  /** Records a failed delivery without removing the item. */
  markFailed(clientId: string, error: string): Promise<void>;
  size(): Promise<number>;
  clear(): Promise<void>;
}

function promisify<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('IndexedDB request failed'));
  });
}

/**
 * Waits for the transaction, not just the request.
 *
 * A request can succeed and its transaction still abort — a quota error, or the
 * browser reclaiming storage. Resolving on the request alone would report an
 * answer as durably queued when it was not, which is the same class of lie this
 * module exists to remove.
 */
function commit(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onabort = () => reject(tx.error ?? new Error('IndexedDB transaction aborted'));
    tx.onerror = () => reject(tx.error ?? new Error('IndexedDB transaction failed'));
  });
}

export function openQueue(databaseName = DATABASE_NAME): Promise<AttemptQueue> {
  return new Promise((resolve, reject) => {
    const open = indexedDB.open(databaseName, VERSION);

    open.onupgradeneeded = () => {
      const db = open.result;
      if (!db.objectStoreNames.contains(STORE)) {
        const store = db.createObjectStore(STORE, { keyPath: 'clientId' });
        // Ordering is by when the child answered. Insertion order would put a
        // retried item behind answers given after it, and a learner's history
        // would reach the server out of sequence.
        store.createIndex('answeredAt', 'answeredAt', { unique: false });
      }
    };

    open.onerror = () => reject(open.error ?? new Error('Could not open the offline queue'));
    open.onsuccess = () => resolve(new IndexedDbQueue(open.result));
  });
}

class IndexedDbQueue implements AttemptQueue {
  constructor(private readonly db: IDBDatabase) {}

  async enqueue(attempt: QueuedAttempt): Promise<void> {
    const tx = this.db.transaction(STORE, 'readwrite');
    // `put` rather than `add`: the same answer being queued twice is a bug
    // upstream, not a reason to store it twice and send it twice.
    tx.objectStore(STORE).put(attempt);
    await commit(tx);
  }

  async all(): Promise<QueuedAttempt[]> {
    const tx = this.db.transaction(STORE, 'readonly');
    const rows = await promisify<QueuedAttempt[]>(
      tx.objectStore(STORE).index('answeredAt').getAll() as IDBRequest<QueuedAttempt[]>,
    );
    await commit(tx);
    return rows;
  }

  async remove(clientId: string): Promise<void> {
    const tx = this.db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).delete(clientId);
    await commit(tx);
  }

  async markFailed(clientId: string, error: string): Promise<void> {
    const tx = this.db.transaction(STORE, 'readwrite');
    const store = tx.objectStore(STORE);
    const existing = await promisify<QueuedAttempt | undefined>(
      store.get(clientId) as IDBRequest<QueuedAttempt | undefined>,
    );
    // Gone already — reconciled by another tab between the read and here. That
    // is not an error: the answer arrived, which is the outcome wanted.
    if (existing) {
      store.put({ ...existing, attempts: existing.attempts + 1, lastError: error });
    }
    await commit(tx);
  }

  async size(): Promise<number> {
    const tx = this.db.transaction(STORE, 'readonly');
    const count = await promisify<number>(tx.objectStore(STORE).count());
    await commit(tx);
    return count;
  }

  async clear(): Promise<void> {
    const tx = this.db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).clear();
    await commit(tx);
  }
}

/**
 * A queue held in memory.
 *
 * Used by the reconciler's tests, and as the fallback when IndexedDB is
 * unavailable — private browsing in some browsers, or a storage policy that
 * refuses. Losing the queue when the tab closes is bad; refusing to let a child
 * answer at all because their answers cannot be persisted is worse.
 */
export class InMemoryQueue implements AttemptQueue {
  private items = new Map<string, QueuedAttempt>();

  async enqueue(attempt: QueuedAttempt): Promise<void> {
    this.items.set(attempt.clientId, attempt);
  }

  async all(): Promise<QueuedAttempt[]> {
    return [...this.items.values()].sort((a, b) => a.answeredAt - b.answeredAt);
  }

  async remove(clientId: string): Promise<void> {
    this.items.delete(clientId);
  }

  async markFailed(clientId: string, error: string): Promise<void> {
    const existing = this.items.get(clientId);
    if (existing) {
      this.items.set(clientId, { ...existing, attempts: existing.attempts + 1, lastError: error });
    }
  }

  async size(): Promise<number> {
    return this.items.size;
  }

  async clear(): Promise<void> {
    this.items.clear();
  }
}

/**
 * An id for one answer.
 *
 * `crypto.randomUUID` where it exists. The fallback is not a security boundary —
 * this id only has to be unique among one learner's unsent answers — but it is
 * still drawn from `crypto.getRandomValues` where that exists, because
 * `Math.random` collisions across two tabs answering at once would silently drop
 * one child's answer as a replay of the other's.
 */
export function newClientId(): string {
  const c = globalThis.crypto;
  if (c?.randomUUID) return c.randomUUID();

  if (c?.getRandomValues) {
    const bytes = c.getRandomValues(new Uint8Array(16));
    return [...bytes].map(b => b.toString(16).padStart(2, '0')).join('');
  }

  return `${Date.now().toString(16)}-${Math.random().toString(16).slice(2, 14)}`;
}
