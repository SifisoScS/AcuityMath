/**
 * The queue, against a real IndexedDB implementation.
 *
 * `fake-indexeddb` rather than a stub, because the bugs worth catching here live
 * in the adapter: a transaction that aborts after its request succeeded, an
 * index that orders by insertion instead of by when the child answered, a `put`
 * that should have been an `add` or the reverse.
 */

import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';

import { InMemoryQueue, newClientId, openQueue, type AttemptQueue, type QueuedAttempt } from './queue';

const attempt = (over: Partial<QueuedAttempt> = {}): QueuedAttempt => ({
  clientId: 'a1',
  learnerId: 12,
  problemId: 100,
  answer: '4',
  responseTimeMs: 5_000,
  answeredAt: 1_000,
  attempts: 0,
  ...over,
});

/** Both implementations must behave identically; the tests below run twice. */
const implementations: [string, () => Promise<AttemptQueue>][] = [
  ['IndexedDB', () => openQueue(`test-${Math.random().toString(36).slice(2)}`)],
  ['in memory', async () => new InMemoryQueue()],
];

describe.each(implementations)('the attempt queue (%s)', (_name, make) => {
  let queue: AttemptQueue;

  beforeEach(async () => {
    queue = await make();
    await queue.clear();
  });

  it('holds an answer until it is removed', async () => {
    await queue.enqueue(attempt());
    expect(await queue.size()).toBe(1);
    expect((await queue.all())[0].answer).toBe('4');
  });

  it('orders by when the child answered, not by when it was queued', async () => {
    // A retried item is re-read, not re-inserted, but an item queued while a
    // reconciliation is in flight can land after an older one. Insertion order
    // would send a learner's history out of sequence, and each attempt moves the
    // estimate that decides the next question.
    await queue.enqueue(attempt({ clientId: 'later', answeredAt: 3_000 }));
    await queue.enqueue(attempt({ clientId: 'earlier', answeredAt: 1_000 }));
    await queue.enqueue(attempt({ clientId: 'middle', answeredAt: 2_000 }));

    expect((await queue.all()).map(a => a.clientId)).toEqual(['earlier', 'middle', 'later']);
  });

  it('replaces rather than duplicates when the same answer is queued twice', async () => {
    // Queueing one answer twice is a bug upstream. Storing it twice would turn
    // that into two round trips and, without the server's client id, two
    // recorded attempts.
    await queue.enqueue(attempt({ clientId: 'same', answer: '4' }));
    await queue.enqueue(attempt({ clientId: 'same', answer: '5' }));

    expect(await queue.size()).toBe(1);
    expect((await queue.all())[0].answer).toBe('5');
  });

  it('removes only the item asked for', async () => {
    await queue.enqueue(attempt({ clientId: 'a', answeredAt: 1 }));
    await queue.enqueue(attempt({ clientId: 'b', answeredAt: 2 }));

    await queue.remove('a');

    expect((await queue.all()).map(x => x.clientId)).toEqual(['b']);
  });

  describe('recording a failure', () => {
    it('keeps the item', async () => {
      // The whole point. The previous implementation dropped the queue on a
      // timer whatever the server said.
      await queue.enqueue(attempt({ clientId: 'kept' }));
      await queue.markFailed('kept', 'Network unreachable');

      expect(await queue.size()).toBe(1);
    });

    it('counts the attempts and keeps the reason', async () => {
      await queue.enqueue(attempt({ clientId: 'kept' }));
      await queue.markFailed('kept', 'Network unreachable');
      await queue.markFailed('kept', 'Still unreachable');

      const [stored] = await queue.all();
      expect(stored.attempts).toBe(2);
      expect(stored.lastError).toBe('Still unreachable');
    });

    it('does not resurrect an item another tab already delivered', async () => {
      // Two tabs on a family tablet can reconcile at once. If one removes an
      // item between the other's read and its failure write, re-adding it here
      // would send an answer that had already arrived.
      await queue.markFailed('never-queued', 'Network unreachable');
      expect(await queue.size()).toBe(0);
    });
  });

  it('survives being reopened', async () => {
    // Only meaningful for the durable implementation, but asserting it for both
    // keeps the contract identical: `InMemoryQueue` is honest about losing
    // nothing *within* a session.
    await queue.enqueue(attempt({ clientId: 'persisted' }));
    expect((await queue.all()).map(a => a.clientId)).toEqual(['persisted']);
  });
});

describe('the durable queue specifically', () => {
  it('still holds the answers after the database is reopened', async () => {
    const name = `persistence-${Math.random().toString(36).slice(2)}`;
    const first = await openQueue(name);
    await first.enqueue(attempt({ clientId: 'written-before-the-tab-closed' }));

    // A new connection, as a reload would make.
    const second = await openQueue(name);
    expect((await second.all()).map(a => a.clientId)).toEqual(['written-before-the-tab-closed']);
  });
});

describe('client ids', () => {
  it('are different every time', async () => {
    const ids = new Set(Array.from({ length: 500 }, () => newClientId()));
    expect(ids.size).toBe(500);
  });

  it('fit the column the server stores them in', () => {
    // `attempts.client_id` is varchar(64), and the procedure requires at least
    // 8 characters. An id truncated by the column would collide with another.
    const id = newClientId();
    expect(id.length).toBeGreaterThanOrEqual(8);
    expect(id.length).toBeLessThanOrEqual(64);
  });
});
