/*
 * `ApiResponse<T>` and `BootstrapData` were here. Both described the shape of
 * the pre-migration REST surface — a bootstrap payload of users, students,
 * attempts and a `coppaStatus` computed over accounts that did not exist. The
 * routes are gone and so are the types; the tRPC client infers its own from the
 * router.
 */

class ApiService {
  private baseUrl = '/api';

  /*
   * Five methods stood here, and by the end not one of them could succeed.
   *
   * `getBootstrap` hydrated the client from `data_store.json`. `submitAttempt`
   * posted a lesson result to a route keyed `student_1..4` while sending
   * `learner-12`, so every submission 404ed into a `.catch` that logged
   * "Offline queue fallback for attempt" — there was no fallback and the answer
   * was dropped. `updateCoppaConsent` wrote consent against a hardcoded
   * `'parent_sarah_1'`. `purgeStudentData` and `addAssignment` posted to routes
   * that had already been deleted.
   *
   * Their replacements are tRPC procedures that prove who is asking before they
   * answer: `learners.*`, `practice.submit`, `consent.record`, `assignments.*`.
   *
   * What remains below is the Socratic coach, and it remains **on purpose**. It
   * is a proxy to the Gemini call, holds no state, reads no store, and has a
   * live caller in `SocraticCoachModal`. Moving it under tRPC would buy
   * consistency and nothing else; it is not a data layer and never was.
   */

  public async askSocraticCoach(params: {
    problemQuestion: string;
    options: string[];
    correctAnswer: string;
    studentAnswer?: string | null;
    studentAge: number;
    tier: string;
    hint?: string;
    explanation?: string;
    mode: 'hint' | 'explain_misconception' | 'socratic_question' | 'real_world_analogy' | 'custom';
    userMessage?: string;
  }): Promise<{ message: string; source: string; followUpPrompt?: string }> {
    try {
      const res = await fetch(`${this.baseUrl}/ai/socratic-coach`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(params)
      });
      if (!res.ok) {
        throw new Error(`HTTP error ${res.status}`);
      }
      return await res.json();
    } catch (err) {
      console.warn('[ApiService] Socratic coach request failed, using client fallback:', err);
      return {
        message: 'Let us look at the given numbers together! What operation do you think we should try first?',
        source: 'client-offline-fallback',
        followUpPrompt: 'What is your best estimate?'
      };
    }
  }
}

export const apiService = new ApiService();

