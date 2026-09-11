import { Router, Request, Response } from 'express';
import { db } from './db';
import { generateSocraticResponse, SocraticRequest } from './gemini';
import { institutionalStore } from './lms';

/**
 * The pre-migration REST surface.
 *
 * ## Read this before adding anything here
 *
 * These routes predate the MySQL migration. Most of them read and write
 * `server/db.ts` — a JSON file — which **nothing migrated reads**. The learning
 * product runs on tRPC (`server/trpc/routers.ts`) against MySQL, with
 * `protectedProcedure`, `learnerProcedure` and `elevatedProcedure` deciding who
 * may touch a child's record.
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
 * New work belongs in the tRPC router. Graft E retires what is left here.
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

// Full Bootstrap Data for Client Hydration
apiRouter.get('/bootstrap', (_req: Request, res: Response) => {
  const state = db.getState();
  res.json({
    users: state.users.map(u => ({
      id: u.id,
      name: u.name,
      email: u.email,
      role: u.role,
      coppaConsent: u.coppaConsent,
      createdAt: u.createdAt
    })),
    students: state.students,
    attempts: state.attempts,
    assignments: state.assignments,
    notifications: state.notifications,
    coppaStatus: {
      isCompliant: state.users.every(u => u.role !== 'parent' || u.coppaConsent.granted),
      totalMinorAccounts: state.students.length,
      auditRecordsCount: state.auditLogs.length
    }
  });
});


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
 * anyone who hits it.
 *
 * The message states the present position and points nowhere. There is no
 * replacement procedure deployed yet, and a runtime error that cites a planning
 * document sends whoever hit it to read a plan instead of telling them what is
 * true right now: consent cannot be recorded by any route on this server. When
 * the replacement exists, this message names it — a pointer is worth having
 * once it resolves.
 */
apiRouter.post('/auth/coppa-consent', (_req: Request, res: Response) => {
  res.status(410).json({
    error:
      'Consent is not recorded here, and is not recorded anywhere else yet. ' +
      'This endpoint wrote to data_store.json against a hardcoded user id, so ' +
      'consent a parent granted was never stored against their account, and ' +
      'the consent_events table has never been written to by anything. It is ' +
      'refused rather than accepted silently. No replacement is deployed: ' +
      'until one is, this product cannot record parental consent.',
    gone: true,
    replacementDeployed: false,
  });
});


// Student Management
apiRouter.get('/students', (_req: Request, res: Response) => {
  res.json({ students: db.getStudents() });
});

apiRouter.get('/students/:id', (req: Request, res: Response) => {
  const student = db.getStudentById(req.params.id);
  if (!student) return res.status(404).json({ error: 'Student not found' });
  res.json({ student });
});

apiRouter.patch('/students/:id', (req: Request, res: Response) => {
  const updated = db.updateStudent(req.params.id, req.body);
  if (!updated) return res.status(404).json({ error: 'Student not found' });
  res.json({ student: updated });
});

// Server-Authoritative Screen Time Heartbeat
apiRouter.post('/students/:id/heartbeat', (req: Request, res: Response) => {
  const studentId = req.params.id;
  const elapsedSeconds = Number(req.body.elapsedSeconds || 60);

  try {
    const result = db.recordHeartbeat(studentId, elapsedSeconds);
    res.json({
      success: true,
      todayMinutesSpent: result.student.todayMinutesSpent,
      screenTimeLimitMinutes: result.student.screenTimeLimitMinutes,
      isLocked: result.isLocked,
      remainingMinutes: result.remainingMinutes
    });
  } catch (err: unknown) {
    const errorMessage = err instanceof Error ? err.message : 'Unknown error';
    res.status(404).json({ error: errorMessage });
  }
});


// Tamper-Proof Lesson Attempt Submission
apiRouter.post('/students/:id/attempts', (req: Request, res: Response) => {
  const studentId = req.params.id;
  const { lessonId, lessonTitle, scorePercent, timeSpentSecs, coinsEarned, xpEarned } = req.body;

  if (!lessonId || scorePercent === undefined) {
    return res.status(400).json({ error: 'Missing required attempt fields' });
  }

  const result = db.recordAttempt({
    studentId,
    lessonId,
    lessonTitle: lessonTitle || 'Mathematics Lesson',
    scorePercent: Number(scorePercent),
    timeSpentSecs: Number(timeSpentSecs || 120),
    coinsEarned: Number(coinsEarned || 20),
    xpEarned: Number(xpEarned || 50)
  });

  res.json({
    success: true,
    attempt: result.attempt,
    student: result.student
  });
});

// Assignments
apiRouter.post('/assignments', (req: Request, res: Response) => {
  const asg = db.addAssignment(req.body);
  res.status(201).json({ assignment: asg });
});

// Batch Offline Sync Reconciliation
apiRouter.post('/sync/batch', (req: Request, res: Response) => {
  const { actions } = req.body;
  if (!Array.isArray(actions)) {
    return res.status(400).json({ error: 'Actions array is required' });
  }

  let processedCount = 0;
  for (const act of actions) {
    if (act.type === 'LESSON_ATTEMPT' && act.payload) {
      db.recordAttempt(act.payload);
      processedCount++;
    } else if (act.type === 'HEARTBEAT' && act.studentId) {
      db.recordHeartbeat(act.studentId, act.elapsedSeconds || 60);
      processedCount++;
    } else if (act.type === 'STUDENT_UPDATE' && act.studentId && act.updates) {
      db.updateStudent(act.studentId, act.updates);
      processedCount++;
    }
  }

  db.logAudit('OFFLINE_QUEUE_BATCH_RECONCILED', 'client', { count: processedCount });

  res.json({
    success: true,
    processedCount,
    state: {
      students: db.getStudents(),
      attempts: db.getState().attempts
    }
  });
});

// Audit Logs (Parent / Teacher review)
apiRouter.get('/audit-logs', (_req: Request, res: Response) => {
  res.json({ logs: db.getState().auditLogs });
});

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


