import fs from 'fs';
import path from 'path';

export interface UserAccount {
  id: string;
  name: string;
  email: string;
  role: 'parent' | 'teacher' | 'admin';
  pinHash: string; // SHA256 or salt-hashed pin
  coppaConsent: {
    granted: boolean;
    consentedAt?: string;
    method?: 'credit_card_auth' | 'email_plus_verification' | 'signed_form';
    parentSignature?: string;
  };
  createdAt: string;
}

export interface StudentRecord {
  id: string;
  name: string;
  age: number;
  tier: 'early' | 'elementary' | 'middle' | 'high';
  avatar: string;
  coins: number;
  streakDays: number;
  dynamicLevel: number;
  pin: string;
  qrToken: string;
  pictureSequence: string[];
  totalAttempts: number;
  masteryRating: number;
  parentAccountId: string;
}

export interface LessonAttemptRecord {
  id: string;
  studentId: string;
  lessonId: string;
  lessonTitle: string;
  scorePercent: number;
  timeSpentSecs: number;
  coinsEarned: number;
  xpEarned: number;
  completedAt: string;
}

export interface AssignmentRecord {
  id: string;
  title: string;
  description: string;
  tier: 'early' | 'elementary' | 'middle' | 'high';
  targetStudentId: string; // 'all' or specific student ID
  targetStudentName: string;
  assignedBy: string;
  dueDate: string;
  status: 'pending' | 'completed';
  rewardCoins: number;
  createdAt: string;
}

export interface NotificationRecord {
  id: string;
  title: string;
  message: string;
  time: string;
  read: boolean;
  type: 'achievement' | 'assignment' | 'alert' | 'system';
  targetRole: 'all' | 'student' | 'parent' | 'teacher';
}

export interface AuditLogRecord {
  id: string;
  timestamp: string;
  action: string;
  performedBy: string;
  details: Record<string, unknown>;
}

export interface DatabaseState {
  users: UserAccount[];
  students: StudentRecord[];
  attempts: LessonAttemptRecord[];
  assignments: AssignmentRecord[];
  notifications: NotificationRecord[];
  auditLogs: AuditLogRecord[];
  activeSessions: Record<string, { lastHeartbeat: number; startedAt: number }>;
}

const DB_FILE = path.join(process.cwd(), 'data_store.json');

const INITIAL_STATE: DatabaseState = {
  users: [
    {
      id: 'parent_sarah_1',
      name: 'Sarah Jenkins',
      email: 'sarah.jenkins@example.com',
      role: 'parent',
      pinHash: '1234', // standard default test pin for phase 1 demo
      coppaConsent: {
        granted: true,
        consentedAt: new Date(Date.now() - 1000 * 60 * 60 * 24 * 7).toISOString(),
        method: 'email_plus_verification',
        parentSignature: 'Sarah Jenkins (Verified Parent)'
      },
      createdAt: new Date(Date.now() - 1000 * 60 * 60 * 24 * 30).toISOString()
    },
    {
      id: 'admin_district_1',
      name: 'Dr. Adaeze Okonkwo (District)',
      email: 'd.okonkwo@oakridge.district',
      role: 'admin',
      pinHash: '9876',
      coppaConsent: {
        granted: true,
        consentedAt: new Date(Date.now() - 1000 * 60 * 60 * 24 * 90).toISOString(),
        method: 'signed_form',
        parentSignature: 'District Data Processing Agreement - Oakridge'
      },
      createdAt: new Date(Date.now() - 1000 * 60 * 60 * 24 * 90).toISOString()
    },
    {
      id: 'teacher_marcus_1',
      name: 'Marcus Sterling',
      email: 'm.sterling@elementary.edu',
      role: 'teacher',
      pinHash: '4321', // teacher test pin
      coppaConsent: {
        granted: true,
        consentedAt: new Date(Date.now() - 1000 * 60 * 60 * 24 * 60).toISOString(),
        method: 'signed_form',
        parentSignature: 'Institutional FERPA Agreement - Oakridge District'
      },
      createdAt: new Date(Date.now() - 1000 * 60 * 60 * 24 * 60).toISOString()
    }
  ],
  students: [
    {
      id: 'student_1',
      name: 'Maya',
      age: 4,
      tier: 'early',
      avatar: '🌱',
      coins: 240,
      streakDays: 4,
      dynamicLevel: 2,
      pin: '1111',
      qrToken: 'ACUITY_STUDENT_QR_MAYA_EARLY_001',
      pictureSequence: ['🍎', '⭐', '🎈'],
      totalAttempts: 14,
      masteryRating: 88,
      parentAccountId: 'parent_sarah_1'
    },
    {
      id: 'student_2',
      name: 'Leo',
      age: 8,
      tier: 'elementary',
      avatar: '🚀',
      coins: 410,
      streakDays: 7,
      dynamicLevel: 4,
      pin: '2222',
      qrToken: 'ACUITY_STUDENT_QR_LEO_ELEM_002',
      pictureSequence: ['🚀', '🪐', '⚡'],
      totalAttempts: 29,
      masteryRating: 92,
      parentAccountId: 'parent_sarah_1'
    },
    {
      id: 'student_3',
      name: 'Sophia',
      age: 12,
      tier: 'middle',
      avatar: '⚡',
      coins: 680,
      streakDays: 12,
      dynamicLevel: 6,
      pin: '3333',
      qrToken: 'ACUITY_STUDENT_QR_SOPHIA_MID_003',
      pictureSequence: ['⚡', '📐', '🌌'],
      totalAttempts: 41,
      masteryRating: 95,
      parentAccountId: 'parent_sarah_1'
    },
    {
      id: 'student_4',
      name: 'Alexander',
      age: 16,
      tier: 'high',
      avatar: '🌌',
      coins: 920,
      streakDays: 18,
      dynamicLevel: 8,
      pin: '4444',
      qrToken: 'ACUITY_STUDENT_QR_ALEX_HIGH_004',
      pictureSequence: ['🌌', '∑', '🔬'],
      totalAttempts: 56,
      masteryRating: 94,
      parentAccountId: 'parent_sarah_1'
    }
  ],
  attempts: [
    {
      id: 'att_1',
      studentId: 'student_2',
      lessonId: 'elem_frac_1',
      lessonTitle: 'Fraction Foundations: Pizza Party',
      scorePercent: 100,
      timeSpentSecs: 240,
      coinsEarned: 35,
      xpEarned: 80,
      completedAt: new Date(Date.now() - 1000 * 60 * 60 * 2).toISOString()
    },
    {
      id: 'att_2',
      studentId: 'student_1',
      lessonId: 'early_counting_1',
      lessonTitle: 'Apple Harvest: Counting 1 to 5',
      scorePercent: 95,
      timeSpentSecs: 180,
      coinsEarned: 25,
      xpEarned: 50,
      completedAt: new Date(Date.now() - 1000 * 60 * 60 * 5).toISOString()
    }
  ],
  assignments: [
    {
      id: 'asg_1',
      title: 'Fraction Equal Shares Workout',
      description: 'Partition 3 shapes into quarters and halves with at least 80% accuracy.',
      tier: 'elementary',
      targetStudentId: 'student_2',
      targetStudentName: 'Leo (Age 8)',
      assignedBy: 'Mr. Marcus Sterling',
      dueDate: 'Tomorrow, 5:00 PM',
      status: 'pending',
      rewardCoins: 50,
      createdAt: new Date().toISOString()
    },
    {
      id: 'asg_2',
      title: 'Early Numbers & Fruit Collection',
      description: 'Count fruits in the interactive basket up to 5.',
      tier: 'early',
      targetStudentId: 'student_1',
      targetStudentName: 'Maya (Age 4)',
      assignedBy: 'Mom (Sarah Jenkins)',
      dueDate: 'Friday',
      status: 'pending',
      rewardCoins: 30,
      createdAt: new Date().toISOString()
    }
  ],
  notifications: [
    {
      id: 'notif_1',
      title: 'Server Sync Activated',
      message: 'AcuityMath Phase 1 Cloud Security and Database Engine is active.',
      time: 'Just now',
      read: false,
      type: 'system',
      targetRole: 'all'
    },
    {
      id: 'notif_2',
      title: 'COPPA Consent Active',
      message: 'Parental verification is recorded for Maya and Leo under US COPPA standards.',
      time: '1h ago',
      read: false,
      type: 'alert',
      targetRole: 'parent'
    }
  ],
  auditLogs: [
    {
      id: 'log_init',
      timestamp: new Date().toISOString(),
      action: 'DATABASE_INITIALIZATION',
      performedBy: 'system',
      details: { version: 'Phase 1.0 Cloud Engine', targetAudience: 'Ages 3-18' }
    }
  ],
  activeSessions: {}
};

class Database {
  private state: DatabaseState;

  constructor() {
    this.state = this.load();
  }

  private load(): DatabaseState {
    try {
      if (fs.existsSync(DB_FILE)) {
        const raw = fs.readFileSync(DB_FILE, 'utf-8');
        return this.topUpSeedAccounts(JSON.parse(raw));
      }
    } catch (err) {
      console.error('[DB] Failed to load data_store.json, using initial state:', err);
    }
    this.persist(INITIAL_STATE);
    return INITIAL_STATE;
  }

  /**
   * Adds seed accounts a stored file predates.
   *
   * `INITIAL_STATE` is only consulted when no store exists, so a developer who
   * ran the app before the administrator account was added would have a
   * district surface that is gated and has no credential to open it — locked
   * out rather than protected, which is a worse bug than the one being fixed.
   */
  private topUpSeedAccounts(state: DatabaseState): DatabaseState {
    const missing = INITIAL_STATE.users.filter(
      seed => !state.users.some(existing => existing.id === seed.id),
    );
    if (missing.length === 0) return state;

    const topped = { ...state, users: [...state.users, ...missing] };
    this.persist(topped);
    return topped;
  }

  private persist(data: DatabaseState): void {
    try {
      fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2), 'utf-8');
    } catch (err) {
      console.error('[DB] Failed to write data_store.json:', err);
    }
  }

  public getState(): DatabaseState {
    return this.state;
  }

  public getStudents(): StudentRecord[] {
    return this.state.students;
  }

  public getStudentById(id: string): StudentRecord | undefined {
    return this.state.students.find(s => s.id === id);
  }

  public updateStudent(id: string, updates: Partial<StudentRecord>): StudentRecord | null {
    const idx = this.state.students.findIndex(s => s.id === id);
    if (idx === -1) return null;
    this.state.students[idx] = { ...this.state.students[idx], ...updates };
    this.persist(this.state);
    return this.state.students[idx];
  }

  /*
   * `recordHeartbeat` and `unlockStudent` were here.
   *
   * Both kept screen time in this file: minutes spent, a limit, and a locked
   * flag, all on a record keyed `student_1..4` that the application never asks
   * for — it uses `learner-12`. So the heartbeat threw on every call and the
   * lock was unreachable, while `screen_time_rules` held the limit a parent had
   * actually set and nothing enforced it.
   *
   * `server/learning/screenTime.ts` owns this now, against the real schema. The
   * fields went with the methods rather than being left unread: a second copy
   * of a fact is what this migration exists to remove, and an orphaned
   * `screenTimeLimitMinutes` here would be the same defect wearing the same
   * name as the analytics field that survives.
   *
   * `unlockStudent` added minutes to that same phantom limit behind
   * `/students/:id/unlock`, a route deleted in the credential closure.
   */

  public recordAttempt(attempt: Omit<LessonAttemptRecord, 'id' | 'completedAt'>): { attempt: LessonAttemptRecord; student: StudentRecord } {
    const newAttempt: LessonAttemptRecord = {
      ...attempt,
      id: `att_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      completedAt: new Date().toISOString()
    };

    this.state.attempts.unshift(newAttempt);

    const student = this.getStudentById(attempt.studentId);
    if (student) {
      student.coins += attempt.coinsEarned;
      student.totalAttempts += 1;
      // dynamic level adaptive scaling
      if (attempt.scorePercent >= 90 && student.dynamicLevel < 10) {
        student.dynamicLevel = Math.min(10, Number((student.dynamicLevel + 0.2).toFixed(1)));
      } else if (attempt.scorePercent < 60 && student.dynamicLevel > 1) {
        student.dynamicLevel = Math.max(1, Number((student.dynamicLevel - 0.1).toFixed(1)));
      }
      student.masteryRating = Math.min(100, Math.max(50, Math.round((student.masteryRating * 0.8) + (attempt.scorePercent * 0.2))));
    }

    this.persist(this.state);
    return { attempt: newAttempt, student: student! };
  }

  public verifyPin(role: 'parent' | 'teacher' | 'admin', pin: string): { valid: boolean; user?: UserAccount } {
    const user = this.state.users.find(u => u.role === role && u.pinHash === pin);
    if (user) {
      this.logAudit('AUTH_PIN_SUCCESS', role, { userId: user.id });
      return { valid: true, user };
    }
    this.logAudit('AUTH_PIN_FAILURE', role, { attemptedPinLength: pin.length });
    return { valid: false };
  }

  public updateCoppaConsent(userId: string, consent: { granted: boolean; method: 'credit_card_auth' | 'email_plus_verification' | 'signed_form'; signature: string }): UserAccount | null {
    const user = this.state.users.find(u => u.id === userId);
    if (!user) return null;
    user.coppaConsent = {
      granted: consent.granted,
      consentedAt: new Date().toISOString(),
      method: consent.method,
      parentSignature: consent.signature
    };
    this.logAudit('COPPA_CONSENT_UPDATED', userId, { consent });
    this.persist(this.state);
    return user;
  }

  public purgeStudentData(studentId: string, parentUserId: string): boolean {
    const studentIdx = this.state.students.findIndex(s => s.id === studentId);
    if (studentIdx === -1) return false;

    // Purge attempts
    this.state.attempts = this.state.attempts.filter(a => a.studentId !== studentId);
    this.state.assignments = this.state.assignments.filter(a => a.targetStudentId !== studentId);
    delete this.state.activeSessions[studentId];

    const studentName = this.state.students[studentIdx].name;
    this.state.students.splice(studentIdx, 1);

    this.logAudit('COPPA_DATA_ERASURE_RIGHT_TO_BE_FORGOTTEN', parentUserId, { studentId, studentName });
    this.persist(this.state);
    return true;
  }

  public addAssignment(asg: Omit<AssignmentRecord, 'id' | 'createdAt' | 'status'>): AssignmentRecord {
    const newAsg: AssignmentRecord = {
      ...asg,
      id: `asg_${Date.now()}`,
      status: 'pending',
      createdAt: new Date().toISOString()
    };
    this.state.assignments.unshift(newAsg);
    this.persist(this.state);
    return newAsg;
  }

  public logAudit(action: string, performedBy: string, details: Record<string, unknown>): void {
    const log: AuditLogRecord = {
      id: `log_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      timestamp: new Date().toISOString(),
      action,
      performedBy,
      details
    };
    this.state.auditLogs.unshift(log);
    // keep latest 500 audit logs
    if (this.state.auditLogs.length > 500) {
      this.state.auditLogs = this.state.auditLogs.slice(0, 500);
    }
  }
}

export const db = new Database();
