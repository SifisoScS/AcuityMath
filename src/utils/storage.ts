import { UserProfile, ParentAnalytics, TeacherAssignment, NotificationItem, OfflineSyncState, AgeTier } from '../types';
import { INITIAL_ACHIEVEMENTS } from '../data/curriculumData';
import { tierForAge } from '../services/tiers';

export const INITIAL_PROFILES: UserProfile[] = [
  {
    id: 'user-maya',
    name: 'Maya Patel',
    role: 'student',
    age: 5,
    avatar: '🦊',
    tier: 'early',
    dynamicLevel: 2,
    eloRating: 980,
    xp: 420,
    coins: 75,
    streakDays: 4,
    streakShields: 1,
    accuracyRate: 94,
    completedLessonsCount: 8,
    unlockedAvatars: ['av-owl', 'av-fox'],
    parentContact: 'sarah.rivera@example.com',
    assignedTeacherId: 'user-teacher'
  },
  {
    id: 'user-leo',
    name: 'Leo Chen',
    role: 'student',
    age: 9,
    avatar: '🤖',
    tier: 'elementary',
    dynamicLevel: 4,
    eloRating: 1320,
    xp: 1150,
    coins: 160,
    streakDays: 7,
    streakShields: 2,
    accuracyRate: 89,
    completedLessonsCount: 16,
    unlockedAvatars: ['av-owl', 'av-fox', 'av-robot'],
    parentContact: 'sarah.rivera@example.com',
    assignedTeacherId: 'user-teacher'
  },
  {
    id: 'user-alex',
    name: 'Alex Rivera',
    role: 'student',
    age: 16,
    avatar: '🧑‍🚀',
    tier: 'high',
    dynamicLevel: 8,
    eloRating: 1840,
    xp: 3200,
    coins: 380,
    streakDays: 14,
    streakShields: 3,
    accuracyRate: 92,
    completedLessonsCount: 32,
    unlockedAvatars: ['av-owl', 'av-fox', 'av-robot', 'av-astronaut', 'av-einstein'],
    parentContact: 'sarah.rivera@example.com',
    assignedTeacherId: 'user-teacher'
  },
  {
    id: 'user-parent',
    name: 'Sarah Rivera (Parent)',
    role: 'parent',
    age: 42,
    avatar: '🛡️',
    tier: 'high',
    dynamicLevel: 10,
    eloRating: 2000,
    xp: 0,
    coins: 0,
    streakDays: 0,
    streakShields: 0,
    accuracyRate: 100,
    completedLessonsCount: 0,
    unlockedAvatars: [],
    pin: '1234'
  },
  {
    id: 'user-teacher',
    name: 'Mr. Henderson (Math Faculty)',
    role: 'teacher',
    age: 38,
    avatar: '📐',
    tier: 'high',
    dynamicLevel: 10,
    eloRating: 2400,
    xp: 0,
    coins: 0,
    streakDays: 0,
    streakShields: 0,
    accuracyRate: 100,
    completedLessonsCount: 0,
    unlockedAvatars: [],
    pin: '5678'
  }
];

export const INITIAL_ANALYTICS: Record<string, ParentAnalytics> = {
  'user-maya': {
    studentId: 'user-maya',
    totalTimeMinutes: 145,
    weeklyActivity: [
      { day: 'Mon', minutes: 18, accuracy: 95, problemsSolved: 12 },
      { day: 'Tue', minutes: 22, accuracy: 100, problemsSolved: 15 },
      { day: 'Wed', minutes: 15, accuracy: 90, problemsSolved: 10 },
      { day: 'Thu', minutes: 25, accuracy: 96, problemsSolved: 18 },
      { day: 'Fri', minutes: 20, accuracy: 92, problemsSolved: 14 },
      { day: 'Sat', minutes: 30, accuracy: 94, problemsSolved: 20 },
      { day: 'Sun', minutes: 15, accuracy: 93, problemsSolved: 11 }
    ],
    masteryDomains: [
      { domain: 'Counting & Number Sense', score: 96, color: 'bg-emerald-500', level: 'Mastered' },
      { domain: 'Visual Shape Recognition', score: 92, color: 'bg-teal-500', level: 'Proficient' },
      { domain: 'Early Addition & Patterns', score: 85, color: 'bg-amber-500', level: 'Developing' },
      { domain: 'Spatial Orientation', score: 88, color: 'bg-sky-500', level: 'Proficient' }
    ],
    strengths: ['Rapid single-digit counting', 'Exceptional shape identification', 'High persistence'],
    areasToImprove: ['Two-step counting without visual anchors', 'Transitions from 5 to 10'],
    recommendedAction: 'Encourage 5 minutes daily on Star Addition with audio manipulatives.',
    screenTimeLimitMinutes: 35,
    focusAlertsCount: 0
  },
  'user-leo': {
    studentId: 'user-leo',
    totalTimeMinutes: 280,
    weeklyActivity: [
      { day: 'Mon', minutes: 35, accuracy: 88, problemsSolved: 24 },
      { day: 'Tue', minutes: 40, accuracy: 92, problemsSolved: 28 },
      { day: 'Wed', minutes: 30, accuracy: 85, problemsSolved: 20 },
      { day: 'Thu', minutes: 45, accuracy: 91, problemsSolved: 32 },
      { day: 'Fri', minutes: 38, accuracy: 86, problemsSolved: 26 },
      { day: 'Sat', minutes: 50, accuracy: 94, problemsSolved: 35 },
      { day: 'Sun', minutes: 42, accuracy: 90, problemsSolved: 30 }
    ],
    masteryDomains: [
      { domain: 'Multiplication Tables (1-12)', score: 94, color: 'bg-emerald-500', level: 'Mastered' },
      { domain: 'Visual Fraction Bars', score: 84, color: 'bg-sky-500', level: 'Proficient' },
      { domain: 'Word Problem Translation', score: 76, color: 'bg-amber-500', level: 'Target Area' },
      { domain: 'Area & 2D Geometry', score: 90, color: 'bg-indigo-500', level: 'Proficient' }
    ],
    strengths: ['Speed on multi-digit multiplication', 'Visual fraction slice comprehension'],
    areasToImprove: ['Word problems requiring multi-step subtraction before division'],
    recommendedAction: 'Practice with scratchpad note-taking during multi-step story problems.',
    screenTimeLimitMinutes: 45,
    focusAlertsCount: 1
  },
  'user-alex': {
    studentId: 'user-alex',
    totalTimeMinutes: 460,
    weeklyActivity: [
      { day: 'Mon', minutes: 55, accuracy: 94, problemsSolved: 35 },
      { day: 'Tue', minutes: 60, accuracy: 96, problemsSolved: 40 },
      { day: 'Wed', minutes: 45, accuracy: 89, problemsSolved: 28 },
      { day: 'Thu', minutes: 65, accuracy: 93, problemsSolved: 42 },
      { day: 'Fri', minutes: 50, accuracy: 91, problemsSolved: 32 },
      { day: 'Sat', minutes: 80, accuracy: 97, problemsSolved: 50 },
      { day: 'Sun', minutes: 60, accuracy: 92, problemsSolved: 38 }
    ],
    masteryDomains: [
      { domain: 'Calculus: Power Rule & Tangents', score: 95, color: 'bg-purple-500', level: 'Mastered' },
      { domain: 'Quadratic Curves & Parabolas', score: 92, color: 'bg-emerald-500', level: 'Mastered' },
      { domain: 'Trigonometric Identities', score: 82, color: 'bg-amber-500', level: 'Developing' },
      { domain: 'Coordinate Geometry Modeling', score: 96, color: 'bg-sky-500', level: 'Mastered' }
    ],
    strengths: ['Instant derivative recognition', 'Algebraic manipulation with fractions'],
    areasToImprove: ['Unit circle trigonometric radian transformations'],
    recommendedAction: 'Review sine wave phase-shift graphing module before next AP benchmark.',
    screenTimeLimitMinutes: 90,
    focusAlertsCount: 0
  }
};

export const INITIAL_ASSIGNMENTS: TeacherAssignment[] = [
  {
    id: 'asg-1',
    title: 'Linear Equation Coordinate Mastery',
    topic: 'Linear Equations & Slope',
    tier: 'middle',
    assignedDate: '2026-09-02',
    dueDate: '2026-09-08',
    targetStudents: ['user-leo', 'user-alex'],
    totalAssigned: 18,
    completedCount: 15,
    averageScore: 91,
    customInstructions: 'Please use the interactive coordinate grapher to plot the y-intercept first.',
    difficulty: 6
  },
  {
    id: 'asg-2',
    title: 'Power Rule Calculus Benchmark',
    topic: 'Differential Calculus',
    tier: 'high',
    assignedDate: '2026-09-04',
    dueDate: '2026-09-10',
    targetStudents: ['user-alex'],
    totalAssigned: 12,
    completedCount: 9,
    averageScore: 94,
    customInstructions: 'Work out the instantaneous rate of change at critical inflection points.',
    difficulty: 8
  },
  {
    id: 'asg-3',
    title: 'Equivalent Fractions Pizza Party',
    topic: 'Visual Fractions',
    tier: 'elementary',
    assignedDate: '2026-09-05',
    dueDate: '2026-09-09',
    targetStudents: ['user-leo'],
    totalAssigned: 10,
    completedCount: 7,
    averageScore: 88,
    customInstructions: 'Slice each pie into equal segments before submitting your answer.',
    difficulty: 4
  }
];

export const INITIAL_NOTIFICATIONS: NotificationItem[] = [
  {
    id: 'notif-1',
    title: 'Milestone Unlocked! 🎉',
    message: 'Alex Rivera achieved Level 8 in STEM Pioneers and unlocked the Quantum Pioneer Avatar!',
    type: 'milestone',
    timestamp: '15 mins ago',
    read: false
  },
  {
    id: 'notif-2',
    title: 'New Teacher Assignment',
    message: 'Mr. Henderson posted "Power Rule Calculus Benchmark" due in 4 days.',
    type: 'assignment',
    timestamp: '2 hours ago',
    read: false
  },
  {
    id: 'notif-3',
    title: 'Streak Shield Alert 🔥',
    message: 'Leo Chen is on a 7-day streak! Keep up the daily math sprint to earn bonus Star Coins.',
    type: 'streak',
    timestamp: '1 day ago',
    read: true
  },
  {
    id: 'notif-4',
    title: 'Parent Weekly Digest Ready',
    message: 'Maya practiced 145 minutes this week with 94% accuracy. Click to view detailed radar analysis.',
    type: 'reward',
    timestamp: '2 days ago',
    read: true
  }
];

/**
 * @deprecated Import `tierForAge` from `services/tiers` instead.
 *
 * Kept as a re-export so the existing call sites keep working while they move.
 * The bands themselves now live in one place, because there were two of them and
 * they disagreed — see `services/tiers.ts`.
 */
export function determineTierForAge(age: number): AgeTier {
  return tierForAge(age);
}

/**
 * LocalStorage wrapper with fallback
 */
export function getSavedItem<T>(key: string, fallback: T): T {
  if (typeof window === 'undefined') return fallback;
  try {
    const item = localStorage.getItem(`acuity_math_${key}`);
    return item ? JSON.parse(item) : fallback;
  } catch (e) {
    console.warn(`Error reading key ${key}:`, e);
    return fallback;
  }
}

export function saveItem<T>(key: string, value: T): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(`acuity_math_${key}`, JSON.stringify(value));
  } catch (e) {
    console.warn(`Error saving key ${key}:`, e);
  }
}
