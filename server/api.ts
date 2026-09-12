import { Router, Request, Response } from 'express';
import { generateSocraticResponse, SocraticRequest } from './gemini';
import { institutionalStore } from './lms';

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

// =======================================================
// Phase 4: Enterprise LMS & District Administration APIs
// =======================================================

// District Overview KPI Summary
apiRouter.get('/district/overview', (_req: Request, res: Response) => {
  const summary = institutionalStore.getSummary();
  res.json(summary);
});

// District Schools List & Benchmark Metrics
apiRouter.get('/district/schools', (_req: Request, res: Response) => {
  const schools = institutionalStore.getSchools();
  res.json(schools);
});

// CCSS & TEKS Standards Compliance Catalog
apiRouter.get('/district/standards', (_req: Request, res: Response) => {
  const standards = institutionalStore.getStandards();
  res.json(standards);
});

// Active LMS Connections (Google Classroom, Canvas, Clever, Schoology)
apiRouter.get('/lms/connections', (_req: Request, res: Response) => {
  const connections = institutionalStore.getLmsConnections();
  res.json(connections);
});

// Trigger Roster Synchronization
apiRouter.post('/lms/sync-roster', (req: Request, res: Response) => {
  try {
    const { providerId } = req.body;
    if (!providerId) {
      return res.status(400).json({ error: 'providerId is required' });
    }
    const result = institutionalStore.syncRoster(providerId);
    res.json(result);
  } catch (err: any) {
    res.status(400).json({ error: err.message || 'Failed to sync roster' });
  }
});

// Dispatch District-Wide Assignment
apiRouter.post('/lms/dispatch-assignment', (req: Request, res: Response) => {
  const { title, targetTier, targetSchoolId, dueDate, lmsSync } = req.body;
  if (!title) {
    return res.status(400).json({ error: 'Assignment title is required' });
  }
  const result = institutionalStore.dispatchDistrictAssignment({
    title,
    targetTier: targetTier || 'all',
    targetSchoolId: targetSchoolId || 'all',
    dueDate: dueDate || new Date(Date.now() + 7 * 86400000).toISOString(),
    lmsSync: Boolean(lmsSync)
  });
  res.json(result);
});

// Two-way Grade Passback (LTI 1.3 AGS)
apiRouter.post('/lms/grade-passback', (req: Request, res: Response) => {
  const { studentId, assignmentId, scorePercent, timeSpentMinutes } = req.body;
  const result = institutionalStore.gradePassback({
    studentId: studentId || 'student-demo',
    assignmentId: assignmentId || 'asg-demo',
    scorePercent: Number(scorePercent) || 100,
    timeSpentMinutes: Number(timeSpentMinutes) || 10
  });
  res.json(result);
});

// District Compliance & Audit Report Export (JSON/Summary)
apiRouter.get('/district/export-report', (_req: Request, res: Response) => {
  const summary = institutionalStore.getSummary();
  const schools = institutionalStore.getSchools();
  const standards = institutionalStore.getStandards();
  const lms = institutionalStore.getLmsConnections();

  res.json({
    reportId: `MUSD-AUDIT-${new Date().getFullYear()}-Q3`,
    generatedAt: new Date().toISOString(),
    institution: summary.districtName,
    confidentiality: 'FERPA / COPPA Protected Institutional Record',
    executiveSummary: summary,
    schoolsBenchmark: schools,
    standardsCoverage: standards,
    lmsIntegrations: lms,
    auditSignature: 'HMAC-SHA256: 4f88e1a6c0b9d9921e42c7e0c8bf89f1d068593a74ef6d9b32c695'
  });
});

// Teacher Pilot Micro-Survey & Real-time Pacing Feedback Store
interface TeacherFeedbackEntry {
  id: string;
  teacherId: string;
  teacherName: string;
  sentiment: 'optimal' | 'too_fast' | 'too_slow';
  note?: string;
  tags?: string[];
  submittedAt: string;
}

const pilotFeedbackStore: TeacherFeedbackEntry[] = [
  {
    id: 'fb-1',
    teacherId: 't-1',
    teacherName: 'Ms. Rivera (Lincoln Elementary)',
    sentiment: 'optimal',
    note: 'Ten-frame manipulative drastically improved subitizing speed.',
    tags: ['manipulatives', 'optimal'],
    submittedAt: new Date(Date.now() - 3600000 * 24).toISOString()
  },
  {
    id: 'fb-2',
    teacherId: 't-2',
    teacherName: 'Mr. Davis (Horizon Middle)',
    sentiment: 'optimal',
    note: 'LMS sync with Google Classroom saved me 45 minutes of grading.',
    tags: ['lms_sync', 'optimal'],
    submittedAt: new Date(Date.now() - 3600000 * 12).toISOString()
  },
  {
    id: 'fb-3',
    teacherId: 't-3',
    teacherName: 'Dr. Vance (Oakridge STEM)',
    sentiment: 'optimal',
    note: 'The calculus tangent lab helped students intuitively grasp limits before the exam.',
    tags: ['high_school', 'optimal'],
    submittedAt: new Date(Date.now() - 3600000 * 3).toISOString()
  }
];

// Submit Teacher Micro-Survey Response
apiRouter.post('/feedback', (req: Request, res: Response) => {
  const { teacherId, teacherName, sentiment, note, tags } = req.body;
  if (!sentiment) {
    return res.status(400).json({ error: 'Sentiment is required' });
  }

  const newEntry: TeacherFeedbackEntry = {
    id: `fb-${Date.now()}`,
    teacherId: teacherId || 'teacher-current',
    teacherName: teacherName || 'Pilot Educator',
    sentiment: sentiment === 'too_fast' || sentiment === 'too_slow' ? sentiment : 'optimal',
    note: note || '',
    tags: Array.isArray(tags) ? tags : [],
    submittedAt: new Date().toISOString()
  };

  pilotFeedbackStore.unshift(newEntry);

  const total = pilotFeedbackStore.length;
  const optimalCount = pilotFeedbackStore.filter(f => f.sentiment === 'optimal').length;
  const tooFastCount = pilotFeedbackStore.filter(f => f.sentiment === 'too_fast').length;
  const tooSlowCount = pilotFeedbackStore.filter(f => f.sentiment === 'too_slow').length;

  res.json({
    success: true,
    message: 'Teacher feedback recorded for pilot efficacy analysis.',
    entry: newEntry,
    aggregate: {
      total,
      optimalPercent: Math.round((optimalCount / total) * 100),
      tooFastPercent: Math.round((tooFastCount / total) * 100),
      tooSlowPercent: Math.round((tooSlowCount / total) * 100)
    }
  });
});

// Get Teacher Pilot Feedback Summary
apiRouter.get('/feedback/summary', (_req: Request, res: Response) => {
  const total = pilotFeedbackStore.length;
  const optimalCount = pilotFeedbackStore.filter(f => f.sentiment === 'optimal').length;
  const tooFastCount = pilotFeedbackStore.filter(f => f.sentiment === 'too_fast').length;
  const tooSlowCount = pilotFeedbackStore.filter(f => f.sentiment === 'too_slow').length;

  res.json({
    total,
    optimalPercent: Math.round((optimalCount / total) * 100),
    tooFastPercent: Math.round((tooFastCount / total) * 100),
    tooSlowPercent: Math.round((tooSlowCount / total) * 100),
    recentFeedback: pilotFeedbackStore.slice(0, 10)
  });
});


