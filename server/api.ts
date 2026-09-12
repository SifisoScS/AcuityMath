import { Router, Request, Response } from 'express';
import { generateSocraticResponse, SocraticRequest } from './gemini';

/**
 * The pre-migration REST surface.
 *
 * ## Read this before adding anything here
 *
 * These routes predate the MySQL migration. Every one that read or wrote
 * `server/db.ts` — a JSON file nothing migrated ever read — is gone, and so is
 * the file. The learning product runs on tRPC (`server/trpc/routers.ts`)
 * against MySQL, with `protectedProcedure`, `learnerProcedure` and
 * `elevatedProcedure` deciding who may touch a child's record.
 *
 * What is left touches no store at all: a health check, a 410 that names where
 * consent goes, the Socratic coach proxy, and the district/LMS/feedback stubs
 * that Graft E4 quarantines.
 *
 * **This router has no authentication of any kind.** No session, no middleware,
 * nothing. That was survivable while every route was a read of demonstration
 * data. It stopped being survivable for routes that took a PIN:
 * `/auth/verify-pin`, `/auth/coppa-purge` and `/students/:id/unlock` gated
 * destructive actions behind `db.verifyPin`, which compares `u.pinHash === pin`
 * — a plaintext comparison against a field named for a hash. All three are
 * deleted.
 *
 * Those three looked partly harmless because the ids in the JSON file
 * (`student_1..4`) do not match the ids the application uses (`learner-12..15`),
 * so the lookups failed. That is an accident of two id formats, not a property:
 * nothing enforces it, and a seed, a refactor or a direct write removes it. The
 * PIN check succeeded regardless, which made it a working credential oracle
 * whatever happened downstream.
 *
 * New work belongs in the tRPC router. Graft E4 quarantines the stubs; this
 * file has no reason to grow.
 */
export const apiRouter = Router();

// Health Check
apiRouter.get('/health', (_req: Request, res: Response) => {
  res.json({
    status: 'ok',
    environment: process.env.NODE_ENV || 'development',
    version: '2.4.0-phase1',
    serverTime: new Date().toISOString()
  });
});

/*
 * `/bootstrap` was here. It hydrated the client from the JSON store — users,
 * students, attempts, assignments, notifications and a `coppaStatus` computed
 * over invented accounts. `apiService.getBootstrap` had no callers left; the
 * application hydrates from tRPC against MySQL.
 */


/**
 * Parental consent — refused, deliberately and loudly.
 *
 * This used to record consent by calling `db.updateCoppaConsent(...)` against
 * `data_store.json`, and `CoppaConsentModal` called it with a hardcoded
 * `'parent_sarah_1'`. So a parent granting consent had it written to a gitignored
 * JSON file against a fictional user, while `consent_events` — the table this
 * product actually has for the purpose — has never been written to by anything.
 *
 * That is not a bug in a feature. It is the compliance claim being false: the
 * application told a parent their consent was recorded, and it was not.
 *
 * It is refused rather than deleted on purpose. Deleting it would break
 * `CoppaConsentModal` silently, and a silent failure here looks exactly like the
 * silent success it replaces. A 410 with a reason makes the gap visible to
 * anyone who hits it and forces the modal onto `consent.record`.
 *
 * The message names the **tRPC procedure**, not the table. Whoever reads it is a
 * developer looking at a failed request and needs the call site; the storage is
 * the next question, not the first.
 *
 * When this route was first closed there was no replacement, and the message
 * said exactly that while carrying `replacementDeployed: false`. That flag is
 * true now and the pointer resolves. The rule that survived both states is the
 * one worth keeping: say what is true at the moment the message is read, and
 * point only at something that exists. It still cites no planning document —
 * a runtime error should hand a developer a call site, not reading material.
 */
apiRouter.post('/auth/coppa-consent', (_req: Request, res: Response) => {
  res.status(410).json({
    error:
      'Consent is no longer recorded here. Call the tRPC procedure ' +
      '`consent.record` instead (POST /trpc/consent.record); read the current ' +
      'state with `consent.forFamily` and the disclosure with `consent.policy`. ' +
      'This endpoint wrote to data_store.json against a hardcoded user.',
    replacedBy: 'consent.record',
    gone: true,
    replacementDeployed: true,
  });
});


/*
 * The three student routes were here — list, fetch, patch — reading and writing
 * `student_1..4` in the JSON store. No client called them, and none could have
 * usefully: the application's learners are `learner-12..15` rows in MySQL,
 * reachable through `learnerProcedure`, which proves the caller is entitled to
 * the child before answering. These proved nothing and asked nobody.
 */

/*
 * The screen-time heartbeat was here, and it never worked.
 *
 * It took an `elapsedSeconds` the browser chose and looked the child up in
 * `data_store.json`, which is keyed `student_1..4` while the application sends
 * `learner-12`. Every beat 404ed, the client swallowed the failure, and no
 * child was ever locked out — while the parent's limit saved, displayed, and
 * did nothing.
 *
 * `screenTime.heartbeat` on the tRPC router replaces it. The server measures
 * the interval rather than being told it, because the child being restricted
 * was the one reporting how long they had been on.
 */


/*
 * `/students/:id/attempts` was here, under a comment calling it
 * "tamper-proof". It was neither tamper-proof nor reachable: the client sent
 * `learner-12` and the store is keyed `student_1..4`, so every submission
 * 404ed. `App.tsx` caught that and logged "Offline queue fallback for attempt",
 * which was false — nothing was queued and the answer was dropped.
 *
 * `practice.submit` records attempts, inside a transaction, against a
 * `client_id` unique per learner, so a replay moves mastery once.
 */

/*
 * `/assignments` was here, appending to the JSON store with no authentication
 * and no teacher entitlement check. B3f-2 moved assignments onto rows with one,
 * and `apiService.addAssignment` had no callers left.
 */

// Batch Offline Sync Reconciliation
/*
 * `/sync/batch` was here. It reconciled an offline queue into the JSON store,
 * unauthenticated, and had no caller left: Graft D replaced it with a real
 * IndexedDB queue that submits through tRPC with a per-learner `client_id`, so
 * a replayed answer is paid for once. It also drove the heartbeat above, which
 * is why it retires with it rather than separately.
 */

/*
 * `/audit-logs` was here. It served the JSON store's audit trail to anyone who
 * asked — unauthenticated, over a log of actions against demonstration
 * accounts. Nothing called it.
 */

// Phase 3: Socratic AI Math Coach endpoint (Server-Side Gemini API)
apiRouter.post('/ai/socratic-coach', async (req: Request, res: Response) => {
  try {
    const {
      problemQuestion,
      options,
      correctAnswer,
      studentAnswer,
      studentAge,
      tier,
      hint,
      explanation,
      mode,
      userMessage
    } = req.body;

    if (!problemQuestion || !options || !correctAnswer) {
      return res.status(400).json({ error: 'Missing required problem parameters' });
    }

    const socraticReq: SocraticRequest = {
      problemQuestion,
      options,
      correctAnswer,
      studentAnswer: studentAnswer ?? null,
      studentAge: Number(studentAge) || 8,
      tier: tier || 'Elementary Explorers (Ages 6–10)',
      hint: hint || '',
      explanation: explanation || '',
      mode: mode || 'hint',
      userMessage: userMessage || undefined
    };

    const socraticResult = await generateSocraticResponse(socraticReq);
    res.json(socraticResult);
  } catch (error) {
    console.error('[API /ai/socratic-coach] Error:', error);
    res.status(500).json({
      error: 'Failed to generate Socratic response',
      message: 'Let us take a step back and examine the given numbers together!'
    });
  }
});

/*
 * The district, LMS and pilot-feedback routes were here — ten of them, all
 * quarantined in Graft E4, along with `server/lms.ts` and its in-memory store.
 *
 * ## Deleting the routes was not enough on its own
 *
 * `DistrictAdminDashboard` seeds its own state with invented campuses,
 * standards and LMS connections, and only *overwrites* them when these routes
 * answer — its catch reads `// Fallback to initial rich state`. Removing the
 * routes alone would have swapped server-invented numbers for client-invented
 * ones and changed nothing an administrator saw.
 *
 * Quarantine had to mean the surface is unreachable, not that its supplier
 * moved. The nav entry and the render branch are gone from `App.tsx`. The
 * component stays on disk, unimported: what belongs there is a product
 * decision, and deleting it would foreclose one.
 *
 * ## The feedback store, specifically
 *
 * `POST /feedback` accepted writes into an in-memory array **pre-seeded with
 * three fabricated testimonials** from teachers who do not exist — one praising
 * an LMS sync that was never built — and reset on every restart.
 * `TeacherDashboard` posted to it and told the teacher their answer was
 * "recorded". It was averaged into three invented ones and discarded at the
 * next restart. The widget says feedback is not collected yet now, which is
 * true.
 *
 * Recording it properly needs a table, and when there is one it gets a writer
 * in the same change — `drizzle/writers.test.ts` will not accept the
 * alternative.
 */
