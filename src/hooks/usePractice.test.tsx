/**
 * The join between answering and the queue.
 *
 * The queue is tested on its own and the server's replay handling is tested
 * against MySQL, but neither notices if `usePractice` never puts anything in the
 * queue — or puts in something the server will reject. That is exactly the shape
 * of the defect that crashed the parent dashboard in B3f-1: two correct sides
 * and an untested join.
 */

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { OfflineProvider, type OfflineSupport } from '../offline/OfflineContext';
import type { QueuedAttempt } from '../offline/queue';
import { isQueued, looksLikeConnectionFailure, usePractice } from './usePractice';

/**
 * The submit mutation, stubbed at the tRPC boundary.
 *
 * `usePractice` reaches the server through `trpc.practice.submit.useMutation`,
 * so that is what is replaced. Everything above it — the client id, the decision
 * to queue, what is handed back — is the real code.
 */
const submitSpy = vi.fn();
const nextSpy = vi.fn();

vi.mock('../lib/trpc', () => ({
  trpc: {
    useUtils: () => ({ learners: { snapshot: { invalidate: vi.fn() } } }),
    practice: {
      start: { useMutation: () => ({ mutateAsync: vi.fn(), isPending: false, error: null }) },
      next: { useMutation: () => ({ mutateAsync: nextSpy, isPending: false, error: null }) },
      submit: { useMutation: () => ({ mutateAsync: submitSpy, isPending: false, error: null }) },
      complete: { useMutation: () => ({ mutateAsync: vi.fn(), isPending: false, error: null }) },
    },
  },
}));

const question = { problemId: 42, prompt: '2 + 2', choices: ['3', '4'] };

function harness(offline: Partial<OfflineSupport> = {}) {
  const enqueue = vi.fn(async (_attempt: QueuedAttempt) => {});
  const reportFailure = vi.fn();
  const reportSuccess = vi.fn();
  const support: OfflineSupport = {
    shouldQueue: false,
    enqueue,
    reportFailure,
    reportSuccess,
    ...offline,
  };

  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={client}>
      <OfflineProvider value={support}>{children}</OfflineProvider>
    </QueryClientProvider>
  );

  const hook = renderHook(() => usePractice(12), { wrapper });
  return { hook, enqueue, reportFailure, reportSuccess };
}

/** Loads a question, which `submit` requires. */
async function withQuestion(hook: ReturnType<typeof harness>['hook']) {
  nextSpy.mockResolvedValue(question);
  await act(async () => {
    await hook.result.current.next();
  });
  await waitFor(() => expect(hook.result.current.question).toBeTruthy());
}

beforeEach(() => {
  submitSpy.mockReset();
  nextSpy.mockReset();
});

describe('answering while the server is reachable', () => {
  it('sends a client id with the answer', async () => {
    // Without one the server cannot recognise a retry, and the queue's whole
    // safety property disappears.
    submitSpy.mockResolvedValue({ isCorrect: true, ability: {} });
    const { hook, enqueue } = harness();
    await withQuestion(hook);

    await act(async () => {
      await hook.result.current.submit('4', 5_000);
    });

    expect(submitSpy).toHaveBeenCalledTimes(1);
    expect(submitSpy.mock.calls[0][0]).toMatchObject({ problemId: 42, answer: '4' });
    expect(String(submitSpy.mock.calls[0][0].clientId).length).toBeGreaterThanOrEqual(8);
    expect(enqueue).not.toHaveBeenCalled();
  });

  it('uses a different id for each answer', async () => {
    submitSpy.mockResolvedValue({ isCorrect: true, ability: {} });
    const { hook } = harness();
    await withQuestion(hook);

    await act(async () => {
      await hook.result.current.submit('4');
    });
    await act(async () => {
      await hook.result.current.submit('3');
    });

    const [first, second] = submitSpy.mock.calls.map(c => c[0].clientId);
    expect(first).not.toBe(second);
  });
});

describe('answering while offline', () => {
  it('queues instead of sending', async () => {
    const { hook, enqueue } = harness({ shouldQueue: true });
    await withQuestion(hook);

    await act(async () => {
      await hook.result.current.submit('4', 5_000);
    });

    expect(submitSpy).not.toHaveBeenCalled();
    expect(enqueue).toHaveBeenCalledTimes(1);
  });

  it('queues everything the server will need', async () => {
    const { hook, enqueue } = harness({ shouldQueue: true });
    await withQuestion(hook);

    await act(async () => {
      await hook.result.current.submit('4', 5_000);
    });

    const queued = enqueue.mock.calls[0][0];
    expect(queued).toMatchObject({ learnerId: 12, problemId: 42, answer: '4', responseTimeMs: 5_000 });
    expect(queued.clientId).toBeTruthy();
    expect(queued.answeredAt).toBeGreaterThan(0);
    expect(queued.attempts).toBe(0);
  });

  it('reports the answer as kept, not as marked', async () => {
    // There is no verdict to give: `practice.next` withholds the correct answer,
    // so offline there is nothing to mark against. Telling a child "correct"
    // here would be the worst version of this feature.
    const { hook } = harness({ shouldQueue: true });
    await withQuestion(hook);

    let result;
    await act(async () => {
      result = await hook.result.current.submit('4');
    });

    expect(isQueued(result!)).toBe(true);
  });
});

describe('when the request fails', () => {
  it('keeps a connection failure instead of losing the answer', async () => {
    submitSpy.mockRejectedValue(new Error('Failed to fetch'));
    const { hook, enqueue, reportFailure } = harness();
    await withQuestion(hook);

    let result;
    await act(async () => {
      result = await hook.result.current.submit('4');
    });

    expect(enqueue).toHaveBeenCalledTimes(1);
    expect(reportFailure).toHaveBeenCalled();
    expect(isQueued(result!)).toBe(true);
  });

  it('does not queue a refusal the server issued', async () => {
    /*
     * A rejection with an HTTP status will be issued identically on every retry.
     * Queueing it would leave an item that never drains while the child is told
     * their work is safe — and would hide the real error.
     */
    const refusal = Object.assign(new Error('No such session.'), { data: { httpStatus: 404 } });
    submitSpy.mockRejectedValue(refusal);
    const { hook, enqueue } = harness();
    await withQuestion(hook);

    await expect(
      act(async () => {
        await hook.result.current.submit('4');
      }),
    ).rejects.toThrow(/No such session/);

    expect(enqueue).not.toHaveBeenCalled();
  });

  it('notes that the connection is working when a send succeeds', async () => {
    // One successful request is good evidence the queue can drain now too.
    submitSpy.mockResolvedValue({ isCorrect: true, ability: {} });
    const { hook, reportSuccess } = harness();
    await withQuestion(hook);

    await act(async () => {
      await hook.result.current.submit('4');
    });

    expect(reportSuccess).toHaveBeenCalled();
  });
});

describe('telling a dropped connection from a refusal', () => {
  it.each([
    'Failed to fetch',
    'NetworkError when attempting to fetch resource',
    'Network request failed',
    'Load failed',
    'fetch failed',
  ])('treats %s as the connection', message => {
    expect(looksLikeConnectionFailure(new Error(message))).toBe(true);
  });

  it('treats anything with an HTTP status as the server answering', () => {
    for (const httpStatus of [400, 401, 403, 404, 409, 500]) {
      expect(looksLikeConnectionFailure({ data: { httpStatus }, message: 'failed to fetch' })).toBe(
        false,
      );
    }
  });

  it('does not guess from an unrecognised message', () => {
    // Queueing on anything unrecognised would fill the queue with items that can
    // never succeed.
    expect(looksLikeConnectionFailure(new Error('Something went wrong'))).toBe(false);
  });
});
