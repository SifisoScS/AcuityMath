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

export interface SyncLogEntry {
  id: string;
  action: string;
  timestamp: string;
  status: 'synced' | 'pending';
}

export interface OfflineSyncState {
  isOffline: boolean;
  pendingActions: {
    id: string;
    actionType: string;
    payload: unknown;
    timestamp: string;
  }[];
  syncLogs: SyncLogEntry[];
  lastSyncedAt: string;
}

// Phase 4: Enterprise & District LMS Types
export interface SchoolEntity {
  id: string;
  name: string;
  type: 'elementary' | 'middle' | 'high' | 'stem_academy';
  studentCount: number;
  teacherCount: number;
  activeLms: 'google_classroom' | 'canvas' | 'clever' | 'schoology';
  meanThetaAbility: number;
  meanEloRating: number;
  curriculumCompletionRate: number;
  standardsCoverageRate: number;
  interventionFlaggedCount: number;
  principalName: string;
  location: string;
}

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

export interface DistrictSummary {
  districtName: string;
  districtId: string;
  totalSchools: number;
  totalStudents: number;
  totalTeachers: number;
  averageMasteryPercent: number;
  districtMeanTheta: number;
  districtMeanElo: number;
  ccssCoveragePercent: number;
  lmsSyncHealthPercent: number;
  activeInterventionsCount: number;
  lastRosterSync: string;
}

export interface DistrictAssignmentPayload {
  title: string;
  targetTier: 'all' | AgeTier;
  targetSchoolId: string;
  dueDate: string;
  lmsSync: boolean;
}
