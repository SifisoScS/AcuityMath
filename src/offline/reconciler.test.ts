/**
 * What the reconciler does with what the server says.
 *
 * The implementation this replaces emptied the queue on a `setTimeout` while the
 * request went unawaited with a `.catch` that only logged — so a child who
 * answered ten questions offline came home to a dashboard saying everything was
 * saved and a database holding none of it.
 *
 * Almost every test here is therefore about a failure path.
 */

import { describe, expect, it, vi } from 'vitest';

import { InMemoryQueue, type QueuedAttempt } from './queue';
import { Reconciler, reconcile, type SubmitAttempt } from './reconciler';

const attempt = (clientId: string, answeredAt: number): QueuedAttempt => ({
  clientId,
  learnerId: 12,
  problemId: 100,
  answer: '4',
  answeredAt,
  attempts: 0,
});

async function queueOf(...ids: string[]) {
  const queue = new InMemoryQueue();
  for (const [index, id] of ids.entries()) {
    await queue.enqueue(attempt(id, index));
  }
  return queue;
}

const accepts: SubmitAttempt = async () => ({ replayed: false });
const rejects =
  (message = 'Network unreachable'): SubmitAttempt =>
  async () => {
    throw new Error(message);
  };

describe('reconciling', () => {
  describe('when the server accepts', () => {
    it('removes what it accepted', async () => {
      const queue = await queueOf('a', 'b');
      const result = await reconcile(queue, accepts);

      expect(result.delivered).toBe(2);
      expect(result.remaining).toBe(0);
      expect(await queue.size()).toBe(0);
    });

    it('sends the oldest answer first', async () => {
      const queue = await queueOf('first', 'second', 'third');
      const order: string[] = [];
      await reconcile(queue, async a => {
        order.push(a.clientId);
        return { replayed: false };
      });

      expect(order).toEqual(['first', 'second', 'third']);
    });

    it('sends one at a time rather than all at once', async () => {
      // Each attempt moves the 3PL estimate, and the estimate decides the next
      // problem served. Sending concurrently would record a child's history in
      // an order they never answered in.
      const queue = await queueOf('a', 'b', 'c');
      let inFlight = 0;
      let mostConcurrent = 0;

      await reconcile(queue, async () => {
        inFlight += 1;
        mostConcurrent = Math.max(mostConcurrent, inFlight);
        await new Promise(resolve => setTimeout(resolve, 1));
        inFlight -= 1;
        return { replayed: false };
      });

      expect(mostConcurrent).toBe(1);
    });

    it('separates what it delivered from what the server already had', async () => {
      // A retry of something that did arrive is success, and the item should go,
      // but reporting it as newly saved would overstate the work done.
      const queue = await queueOf('new', 'already-there');
      const result = await reconcile(queue, async a => ({
        replayed: a.clientId === 'already-there',
      }));

      expect(result.delivered).toBe(1);
      expect(result.alreadyHad).toBe(1);
      expect(await queue.size()).toBe(0);
    });
  });

  describe('when the server does not answer', () => {
    it('keeps the work', async () => {
      const queue = await queueOf('a');
      const result = await reconcile(queue, rejects());

      expect(result.delivered).toBe(0);
      expect(result.remaining).toBe(1);
      expect(await queue.size()).toBe(1);
    });

    it('reports the reason rather than swallowing it', async () => {
      const queue = await queueOf('a');
      const result = await reconcile(queue, rejects('502 Bad Gateway'));
      expect(result.error).toBe('502 Bad Gateway');
    });

    it('counts the failure against the item', async () => {
      const queue = await queueOf('a');
      await reconcile(queue, rejects());
      expect((await queue.all())[0].attempts).toBe(1);
    });

    it('stops after a few failures instead of grinding through the whole queue', async () => {
      // A server returning errors should not produce a hundred round trips and a
      // hundred log lines before the caller learns anything.
      const queue = await queueOf('a', 'b', 'c', 'd', 'e', 'f', 'g', 'h');
      const submit = vi.fn(rejects());

      const result = await reconcile(queue, submit);

      expect(submit).toHaveBeenCalledTimes(3);
      expect(result.remaining).toBe(8);
    });

    it('keeps the ones it could not reach and drops the ones it could', async () => {
      // Partial success is the normal case when a connection returns mid-drain.
      const queue = await queueOf('ok', 'broken');
      const result = await reconcile(queue, async a => {
        if (a.clientId === 'broken') throw new Error('Network unreachable');
        return { replayed: false };
      });

      expect(result.delivered).toBe(1);
      expect((await queue.all()).map(a => a.clientId)).toEqual(['broken']);
    });

    it('retries the kept item on the next run', async () => {
      const queue = await queueOf('a');
      await reconcile(queue, rejects());

      const second = await reconcile(queue, accepts);
      expect(second.delivered).toBe(1);
      expect(await queue.size()).toBe(0);
    });
  });

  describe('with nothing queued', () => {
    it('does not call the server', async () => {
      const submit = vi.fn(accepts);
      const result = await reconcile(new InMemoryQueue(), submit);

      expect(submit).not.toHaveBeenCalled();
      expect(result).toMatchObject({ delivered: 0, alreadyHad: 0, remaining: 0 });
      expect(result.error).toBeUndefined();
    });
  });
});

describe('the reconciler', () => {
  it('does not start a second pass over the same items', async () => {
    // Two passes would both read the same pending list and send everything
    // twice. The server absorbs that safely, but the counts reported back would
    // double what was delivered.
    const queue = await queueOf('a', 'b');
    const submit = vi.fn(async () => {
      await new Promise(resolve => setTimeout(resolve, 5));
      return { replayed: false };
    });
    const reconciler = new Reconciler(queue, submit);

    const [first, second] = await Promise.all([reconciler.run(), reconciler.run()]);

    expect(submit).toHaveBeenCalledTimes(2);
    expect(first.delivered).toBe(2);
    expect(second.delivered).toBe(2);
  });

  it('picks up an answer queued while a pass was running', async () => {
    // The running pass already read its list, so a newly queued answer would
    // otherwise wait for some later trigger that might never come.
    const queue = await queueOf('first');
    let queuedDuringRun = false;

    const reconciler = new Reconciler(queue, async () => {
      if (!queuedDuringRun) {
        queuedDuringRun = true;
        await queue.enqueue(attempt('arrived-mid-run', 99));
        void reconciler.run();
      }
      return { replayed: false };
    });

    const result = await reconciler.run();

    expect(result.delivered).toBe(2);
    expect(await queue.size()).toBe(0);
  });

  it('reports itself idle once a pass finishes', async () => {
    const reconciler = new Reconciler(await queueOf('a'), accepts);
    expect(reconciler.isRunning).toBe(false);

    const running = reconciler.run();
    expect(reconciler.isRunning).toBe(true);

    await running;
    expect(reconciler.isRunning).toBe(false);
  });

  it('is idle again even after a failure', async () => {
    // A reconciler left marked as running would never sync again.
    const reconciler = new Reconciler(await queueOf('a'), rejects());
    await reconciler.run();
    expect(reconciler.isRunning).toBe(false);
  });
});
