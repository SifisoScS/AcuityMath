/**
 * A practice session, from the server.
 *
 * The loop is: start a session, ask for a question, submit an answer, read what
 * happened. Everything the learner is told after answering — whether they were
 * right, the correct answer, the explanation, their new mastery — comes back
 * from `submit`, because the question itself deliberately carries none of it.
 */

import { useCallback, useState } from 'react';

import { trpc } from '../lib/trpc';
import { newClientId, type QueuedAttempt } from '../offline/queue';
import { useOfflineSupport } from '../offline/OfflineContext';

/**
 * Whether this was the network failing rather than the server refusing.
 *
 * tRPC surfaces a transport failure as a `TRPCClientError` wrapping the fetch
 * rejection, which has no HTTP status. A refusal the server issued has one, and
 * must not be queued: it will be refused identically on every retry, and the
 * item would sit in the queue for ever while the child is told their work is
 * safe.
 */
function looksLikeConnectionFailure(error: unknown): boolean {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return true;

  const shape = error as { data?: { httpStatus?: number }; message?: string };
  if (typeof shape?.data?.httpStatus === 'number') return false;

  const message = String(shape?.message ?? '').toLowerCase();
  return (
    message.includes('failed to fetch') ||
    message.includes('networkerror') ||
    message.includes('network request failed') ||
    message.includes('load failed') ||
    message.includes('econnrefused') ||
    message.includes('fetch failed')
  );
}

export { looksLikeConnectionFailure };

export interface PracticeQuestion {
  problemId: number;
  conceptId: string;
  prompt: string;
  choices: string[];
  hint: string;
  difficulty: number;
  answerType: 'numeric' | 'multiple_choice' | 'text';
  visual: Record<string, unknown> | null;
  manipulativeHint: string | null;
  source: 'authored' | 'generated';
}

/**
 * What happened to an answer that could not be sent.
 *
 * Not an `AnswerOutcome` with the fields blanked out, because there is no
 * verdict to give. `practice.next` deliberately withholds the correct answer —
 * anything it returns is readable in the network tab by the child being tested —
 * so with no server there is genuinely nothing to mark against.
 *
 * Telling a child "correct!" on an answer nobody has checked would be the worst
 * version of this feature. It is recorded, and it will be marked.
 */
export interface QueuedOutcome {
  queued: true;
  /** The id the server will deduplicate on when this is reconciled. */
  clientId: string;
}

export type SubmitResult = AnswerOutcome | QueuedOutcome;

export function isQueued(result: SubmitResult | null): result is QueuedOutcome {
  return result !== null && 'queued' in result;
}

export interface AnswerOutcome {
  isCorrect: boolean;
  correctAnswer: string;
  explanation: string;
  misconceptionCode: string | null;
  mastery: number;
  accuracy: number;
  ability: { theta: number; dynamicLevel: number; eloRating: number; answered: number };
}

/**
 * Drives one learner's session.
 *
 * Holds three pieces of local state, and they are local for a reason: the
 * current question, the outcome of the last answer, and the session id are all
 * about *this sitting at this device*. Everything durable — the attempt, the
 * mastery, the ability estimate — is written server-side by `submit` and read
 * back through `useLearnerSnapshot`.
 */
export function usePractice(learnerId: number | null | undefined) {
  const utils = trpc.useUtils();
  // From context, not a parameter: a new answer path must not be able to bypass
  // the queue simply by not being threaded one.
  const offline = useOfflineSupport();

  const [sessionId, setSessionId] = useState<number | null>(null);
  const [question, setQuestion] = useState<PracticeQuestion | null>(null);
  const [outcome, setOutcome] = useState<SubmitResult | null>(null);

  const startMutation = trpc.practice.start.useMutation();
  const nextMutation = trpc.practice.next.useMutation();
  const submitMutation = trpc.practice.submit.useMutation({
    onSuccess: () => {
      // The dashboard's numbers moved. Invalidating rather than patching keeps
      // one source of truth: the server decides what mastery now is.
      if (learnerId) utils.learners.snapshot.invalidate({ learnerId });
    },
  });
  const completeMutation = trpc.practice.complete.useMutation();

  const start = useCallback(
    async (targetLength = 8) => {
      if (!learnerId) throw new Error('No learner selected.');
      const session = await startMutation.mutateAsync({ learnerId, targetLength });
      setSessionId(session.sessionId);
      setOutcome(null);
      return session;
    },
    [learnerId, startMutation],
  );

  const next = useCallback(
    async (conceptId?: string) => {
      if (!learnerId) throw new Error('No learner selected.');
      const served = await nextMutation.mutateAsync({ learnerId, conceptId });
      setQuestion(served as PracticeQuestion);
      // Clearing the previous outcome is what returns the card to its
      // unanswered state; leaving it would show the last question's explanation
      // above the new question.
      setOutcome(null);
      return served as PracticeQuestion;
    },
    [learnerId, nextMutation],
  );

  /**
   * Sends the answer, or keeps it until it can be sent.
   *
   * The `clientId` is made here, the moment the child answers, and travels with
   * the answer whether it goes straight out or sits in the queue first. That is
   * what makes a retry safe: the server has a unique index on
   * `(learner_id, client_id)` and returns the original result for a replay
   * rather than recording a second attempt. Generating it at send time would
   * defeat the mechanism entirely.
   */
  const submit = useCallback(
    async (answer: string, responseTimeMs?: number): Promise<SubmitResult> => {
      if (!learnerId) throw new Error('No learner selected.');
      if (!question) throw new Error('No question to answer.');

      const clientId = newClientId();
      const queued: QueuedAttempt = {
        clientId,
        learnerId,
        problemId: question.problemId,
        sessionId: sessionId ?? undefined,
        answer,
        responseTimeMs,
        answeredAt: Date.now(),
        attempts: 0,
      };

      if (offline.shouldQueue) {
        await offline.enqueue(queued);
        const result: QueuedOutcome = { queued: true, clientId };
        setOutcome(result);
        return result;
      }

      try {
        const result = await submitMutation.mutateAsync({
          learnerId,
          problemId: question.problemId,
          sessionId: sessionId ?? undefined,
          answer,
          responseTimeMs,
          clientId,
        });
        offline.reportSuccess();
        setOutcome(result as AnswerOutcome);
        return result as AnswerOutcome;
      } catch (error) {
        /*
         * Only a *transport* failure is queued. A rejection the server issued —
         * an unknown problem, an expired session, a learner the caller may not
         * touch — will be rejected identically on every retry, so queueing it
         * would hide a real error behind an item that never drains.
         */
        if (!looksLikeConnectionFailure(error)) throw error;

        offline.reportFailure();
        await offline.enqueue(queued);
        const result: QueuedOutcome = { queued: true, clientId };
        setOutcome(result);
        return result;
      }
    },
    [learnerId, question, sessionId, submitMutation, offline],
  );

  const complete = useCallback(async () => {
    if (!learnerId || !sessionId) return;
    await completeMutation.mutateAsync({ learnerId, sessionId });
    setSessionId(null);
    setQuestion(null);
    setOutcome(null);
  }, [completeMutation, learnerId, sessionId]);

  return {
    sessionId,
    question,
    outcome,
    /** True once an answer has been submitted and the result is on screen. */
    isAnswered: outcome !== null,
    start,
    next,
    submit,
    complete,
    isStarting: startMutation.isPending,
    isLoadingQuestion: nextMutation.isPending,
    isSubmitting: submitMutation.isPending,
    error: startMutation.error ?? nextMutation.error ?? submitMutation.error ?? null,
  };
}
