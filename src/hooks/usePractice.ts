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

  const [sessionId, setSessionId] = useState<number | null>(null);
  const [question, setQuestion] = useState<PracticeQuestion | null>(null);
  const [outcome, setOutcome] = useState<AnswerOutcome | null>(null);

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

  const submit = useCallback(
    async (answer: string, responseTimeMs?: number) => {
      if (!learnerId) throw new Error('No learner selected.');
      if (!question) throw new Error('No question to answer.');

      const result = await submitMutation.mutateAsync({
        learnerId,
        problemId: question.problemId,
        sessionId: sessionId ?? undefined,
        answer,
        responseTimeMs,
      });

      setOutcome(result as AnswerOutcome);
      return result as AnswerOutcome;
    },
    [learnerId, question, sessionId, submitMutation],
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
