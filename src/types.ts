export type Role = 'student' | 'parent' | 'teacher';

export type NavigationTab = 
  | 'home' 
  | 'category'
  | 'age'
  | 'student' 
  | 'curriculum' 
  | 'labs'
  | 'parent' 
  | 'teacher' 
  | 'district'
  | 'rewards' 
  | 'scratchpad';

export type AgeTier = 'early' | 'elementary' | 'middle' | 'high';

export interface UserProfile {
  id: string;
  name: string;
  role: Role;
  age: number;
  avatar: string;
  tier: AgeTier;
  dynamicLevel: number; // 1 to 10
  eloRating: number; // 800 - 2400
  xp: number;
  coins: number;
  streakDays: number;
  streakShields: number;
  accuracyRate: number; // percentage 0 - 100
  completedLessonsCount: number;
  unlockedAvatars: string[];
  pin?: string; // For parent/teacher
  assignedTeacherId?: string;
  parentContact?: string;
  diagnosticComplete?: boolean;
  initialThetaScore?: number;
  /**
   * The server learner this profile stands for, when it stands for one.
   *
   * Absent on the signed-in adult and on the placeholder shown to a visitor who
   * has not signed in. Its presence is what tells the practice loop it has a
   * real child to record against, which is why the check is `typeof === number`
   * rather than a truthiness test somewhere.
   */
  learnerId?: number;
}

export type VisualType = 
  | 'counters' 
  | 'shapes' 
  | 'fraction_bar' 
  | 'coordinate_plane' 
  | 'equation' 
  | 'calculus_graph';

export interface MathProblem {
  id: string;
  tier: AgeTier;
  topic: string;
  title: string;
  question: string;
  audioPrompt?: string;
  visualType: VisualType;
  visualData?: {
    itemType?: 'apple' | 'star' | 'cookie' | 'diamond';
    initialCount?: number;
    targetCount?: number;
    shapeType?: 'circle' | 'triangle' | 'square' | 'pentagon' | 'hexagon';
    fractions?: { numerator: number; denominator: number };
    equivalentTarget?: string;
    slope?: number;
    intercept?: number;
    points?: [number, number][];
    formula?: string;
    derivative?: string;
  };
  options: string[];
  correctAnswer: string;
  explanation: string;
  hint: string;
  difficulty: number; // 1 to 10
}

export interface MathLesson {
  id: string;
  title: string;
  description: string;
  tier: AgeTier;
  topic: string;
  recommendedAge: string;
  difficultyLevel: number; // 1 to 10
  iconName: string;
  estimatedMinutes: number;
  xpReward: number;
  coinReward: number;
  problems: MathProblem[];
}

export interface Achievement {
  id: string;
  title: string;
  description: string;
  icon: string;
  unlockedAt?: string;
  category: 'streak' | 'accuracy' | 'mastery' | 'creativity';
  progress: number;
  maxProgress: number;
}

export interface MasteryDomain {
  domain: string;
  score: number; // 0-100
  color: string;
  level: string;
}

export interface WeeklyActivity {
  day: string;
  minutes: number;
  accuracy: number;
  problemsSolved: number;
}

export interface ParentAnalytics {
  studentId: string;
  totalTimeMinutes: number;
  weeklyActivity: WeeklyActivity[];
  masteryDomains: MasteryDomain[];
  strengths: string[];
  areasToImprove: string[];
  recommendedAction: string;
  screenTimeLimitMinutes: number;
  focusAlertsCount: number;
}

export interface TeacherAssignment {
  id: string;
  title: string;
  topic: string;
  tier: AgeTier;
  assignedDate: string;
  dueDate: string;
  targetStudents: string[];
  totalAssigned: number;
  completedCount: number;
  customInstructions: string;
  /*
   * `averageScore` and `difficulty` were here. Both were written when an
   * assignment was created and never read anywhere, so keeping them would have
   * meant deriving two figures for nobody — or, more likely, inventing them.
   */
}

export interface NotificationItem {
  id: string;
  title: string;
  message: string;
  /*
   * `streak`, `sync` and `reward` were here and had no producer: nothing writes
   * `learner_rewards`, and the offline queue is Graft D. They are gone rather
   * than kept as permanently-empty cases, which is what gave the bell a "Streak"
   * filter tab that could never match anything.
   */
  type: 'milestone' | 'assignment';
  timestamp: string;
  read: boolean;
  targetId?: string;
}

/*
 * `SyncLogEntry` and `OfflineSyncState` stood here.
 *
 * They described a queue held in React state and mirrored to localStorage,
 * whose `syncLogs` only ever recorded the status `'synced'` — so the journal
 * that rendered them drew a green tick beside every row, including the failures
 * it had no way to represent.
 *
 * What is unsent now lives in IndexedDB and is described by `QueuedAttempt` in
 * `src/offline/queue.ts`, where a failure is a first-class field.
 */


// Phase 4: Enterprise & District LMS Types
/*
 * `SchoolEntity` stood here until Graft E1, and its removal is the point.
 *
 * It declared `meanThetaAbility`, `meanEloRating`, `curriculumCompletionRate`,
 * `standardsCoverageRate`, `interventionFlaggedCount`, `principalName` and
 * `location` — none of which this product records. It was not a type describing
 * data; it was a specification of numbers somebody would have had to invent, and
 * `DistrictAdminDashboard.tsx` duly invented them for four fictional campuses.
 *
 * The real `schools` table holds an id, an institution and a name. The district
 * console shows those, and shows nothing it cannot answer.
 */

export interface LMSConnection {
  id: string;
  provider: 'google_classroom' | 'canvas' | 'clever' | 'schoology' | 'lti_advantage';
  name: string;
  status: 'connected' | 'syncing' | 'error' | 'disconnected';
  lastSyncTimestamp: string;
  syncedCoursesCount: number;
  syncedStudentsCount: number;
  pendingGradePassbacks: number;
  autoSyncEnabled: boolean;
  oauthScope: string[];
}

export interface StandardAuditRecord {
  code: string;
  domain: string;
  framework: 'CCSS' | 'TEKS';
  title: string;
  gradeLevel: string;
  lessonsAlignedCount: number;
  districtMasteryPercent: number;
  coverageStatus: 'fully_covered' | 'in_progress' | 'deficiency_flag';
}

/*
 * `DistrictSummary` and `DistrictAssignmentPayload` were here, and are gone.
 *
 * They were the *shape* of the dashboard E1 deleted — an interface of numbers
 * nothing produced: `ccssCoveragePercent`, `lmsSyncHealthPercent`,
 * `activeInterventionsCount`, a district mean theta. Neither type was
 * referenced anywhere outside this file.
 *
 * `ccssCoveragePercent` is the one worth naming. E7 went looking for the audit
 * that would fill it and found that **no authored concept carries a standard
 * code at all** — `SourceConcept` has no field for one. A type declaring a
 * percentage of standards covered, in a product that has mapped none, is the
 * same class of claim as the handshake that always succeeded: not a lie
 * anybody told, but a shape that invites one.
 *
 * `server/curriculum/standardsCoverage.ts` reports the real position, and
 * `SchoolEntity` was removed in E1 for the same reason.
 */