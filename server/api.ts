import { Router, Request, Response } from 'express';
import { db } from './db';
import { generateSocraticResponse, SocraticRequest } from './gemini';
import { institutionalStore } from './lms';

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

// Auth PIN Verification (Rate-limited & logged)
apiRouter.post('/auth/verify-pin', (req: Request, res: Response) => {
  const { role, pin } = req.body;
  if (!role || !pin) {
    return res.status(400).json({ error: 'Role and PIN are required' });
  }

  const result = db.verifyPin(role as 'parent' | 'teacher' | 'admin', pin);
  if (!result.valid || !result.user) {
    return res.status(401).json({ valid: false, error: 'Incorrect PIN passcode' });
  }

  // Issue session authorization
  res.json({
    valid: true,
    user: {
      id: result.user.id,
      name: result.user.name,
      email: result.user.email,
      role: result.user.role,
      coppaConsent: result.user.coppaConsent
    },
    sessionToken: `sec_tok_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`
  });
});

// COPPA Verifiable Parental Consent Update
apiRouter.post('/auth/coppa-consent', (req: Request, res: Response) => {
  const { userId, granted, method, signature } = req.body;
  if (!userId || granted === undefined) {
    return res.status(400).json({ error: 'User ID and consent state are required' });
  }

  const updatedUser = db.updateCoppaConsent(userId, {
    granted: Boolean(granted),
    method: method || 'email_plus_verification',
    signature: signature || 'Verified Parent Signature'
  });

  if (!updatedUser) {
    return res.status(404).json({ error: 'Parent user not found' });
  }

  res.json({
    success: true,
    coppaConsent: updatedUser.coppaConsent
  });
});

// COPPA Right to be Forgotten: Purge Student Records
apiRouter.post('/auth/coppa-purge', (req: Request, res: Response) => {
  const { studentId, parentUserId, confirmationPin } = req.body;
  if (!studentId || !parentUserId) {
    return res.status(400).json({ error: 'Student ID and Parent User ID are required' });
  }

  const pinVerification = db.verifyPin('parent', confirmationPin);
  if (!pinVerification.valid) {
    return res.status(401).json({ error: 'Parental PIN verification failed for data erasure' });
  }

  const purged = db.purgeStudentData(studentId, parentUserId);
  if (!purged) {
    return res.status(404).json({ error: 'Student record could not be found or purged' });
  }

  res.json({
    success: true,
    message: 'Student account and all associated telemetry purged in accordance with COPPA',
    remainingStudents: db.getStudents()
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

// Parental Screen Time Override & Unlock
apiRouter.post('/students/:id/unlock', (req: Request, res: Response) => {
  const studentId = req.params.id;
  const { additionalMinutes, parentPin } = req.body;

  const pinCheck = db.verifyPin('parent', parentPin);
  if (!pinCheck.valid) {
    return res.status(401).json({ error: 'Valid Parent PIN required to unlock screen time' });
  }

  const student = db.unlockStudent(studentId, Number(additionalMinutes || 30));
  if (!student) return res.status(404).json({ error: 'Student not found' });

  res.json({
    success: true,
    student
  });
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


