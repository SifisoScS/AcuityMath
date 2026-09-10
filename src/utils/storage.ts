import { UserProfile, TeacherAssignment, NotificationItem, OfflineSyncState, AgeTier } from '../types';
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

/*
 * `INITIAL_ANALYTICS` stood here: three children's worth of invented weekly
 * activity, mastery domains and advice, keyed `user-maya`/`user-leo`/`user-alex`.
 *
 * It is gone because analytics are derived from the child's own attempts now
 * (`server/learning/analytics.ts`). Leaving it would not have been harmless —
 * every consumer had learned to fall back to `INITIAL_ANALYTICS['user-maya']`
 * when a lookup missed, so a parent selecting Leo saw Maya's numbers under
 * Leo's name, and a child with no screen-time limit was shown Maya's.
 */

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
