/**
 * What a parent is shown, and whose it is.
 *
 * This component read `analyticsMap[selectedStudentId] || analyticsMap['user-maya']`.
 * While the demonstration key existed, selecting Leo showed Maya's minutes,
 * mastery and advice under Leo's name. When the data became real and the key was
 * gone, the same line put `undefined` into every field access and the dashboard
 * crashed on load.
 *
 * Neither failure had a test. These are that test.
 */

import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { ParentDashboard } from './ParentDashboard';
import type { ParentAnalytics, UserProfile } from '../types';

const child = (id: string, name: string): UserProfile => ({
  id,
  name,
  role: 'student',
  age: 9,
  avatar: '🦊',
  tier: 'elementary',
  dynamicLevel: 3,
  eloRating: 900,
  xp: 0,
  coins: 0,
  streakDays: 0,
  streakShields: 0,
  accuracyRate: 75,
  completedLessonsCount: 2,
  unlockedAvatars: [],
});

const analytics = (studentId: string, over: Partial<ParentAnalytics> = {}): ParentAnalytics => ({
  studentId,
  totalTimeMinutes: 4,
  weeklyActivity: [{ day: 'Mon', minutes: 4, accuracy: 75, problemsSolved: 8 }],
  masteryDomains: [{ domain: 'Number Bonds', score: 68, color: 'bg-amber-500', level: 'Developing' }],
  strengths: [],
  areasToImprove: [],
  recommendedAction: 'Spend the next few sessions on Number Bonds.',
  screenTimeLimitMinutes: 0,
  focusAlertsCount: 0,
  ...over,
});

const renderDashboard = (students: UserProfile[], map: Record<string, ParentAnalytics>) =>
  render(
    <ParentDashboard students={students} analyticsMap={map} onUpdateScreenTime={vi.fn()} />,
  );

describe('parent dashboard', () => {
  it('shows the selected child’s own figures', () => {
    renderDashboard(
      [child('learner-12', 'Maya')],
      { 'learner-12': analytics('learner-12', { totalTimeMinutes: 47 }) },
    );
    expect(screen.getAllByText(/47/).length).toBeGreaterThan(0);
  });

  describe('when the selected child has no analytics', () => {
    it('does not show another child’s figures instead', () => {
      // Leo is selected; only Maya has data. The old fallback rendered Maya's
      // 145 minutes and her advice under Leo's name.
      renderDashboard(
        [child('learner-14', 'Leo')],
        { 'learner-12': analytics('learner-12', { totalTimeMinutes: 145 }) },
      );
      expect(screen.queryByText(/145/)).toBeNull();
      expect(screen.queryByText(/Number Bonds/)).toBeNull();
    });

    it('renders an empty state rather than crashing', () => {
      // The crash was "Cannot read properties of undefined (reading
      // 'totalTimeMinutes')" — an exception during render, so the assertion
      // that matters is simply that render returns.
      expect(() => renderDashboard([child('learner-14', 'Leo')], {})).not.toThrow();
      expect(screen.getByText(/no progress recorded yet/i)).toBeTruthy();
      expect(screen.getByText(/Leo/)).toBeTruthy();
    });
  });

  describe('when the account has no children at all', () => {
    it('says so instead of throwing', () => {
      expect(() => renderDashboard([], {})).not.toThrow();
      expect(screen.getByText(/no learners on this account yet/i)).toBeTruthy();
    });
  });

  describe('figures that were asserted rather than derived', () => {
    it('does not claim a trend it cannot compute', () => {
      // "+18% vs last week" was hard-coded, shown for every child every week.
      // Nothing queries the previous week, so there is no comparison to make.
      renderDashboard([child('learner-12', 'Maya')], { 'learner-12': analytics('learner-12') });
      expect(screen.queryByText(/\+18%/)).toBeNull();
      expect(screen.queryByText(/vs last week/i)).toBeNull();
    });

    it('reports the week from the week, not from all time', () => {
      // `totalTimeMinutes` has no date filter server-side, so labelling it
      // "Weekly Time Spent" overstated the week by the child's whole history.
      renderDashboard(
        [child('learner-12', 'Maya')],
        {
          'learner-12': analytics('learner-12', {
            totalTimeMinutes: 900,
            weeklyActivity: [
              { day: 'Mon', minutes: 5, accuracy: 80, problemsSolved: 4 },
              { day: 'Tue', minutes: 7, accuracy: 90, problemsSolved: 6 },
            ],
          }),
        },
      );
      const weekly = screen.getByText('Weekly Time Spent').closest('div')?.parentElement;
      expect(weekly?.textContent).toContain('12');
      expect(weekly?.textContent).not.toMatch(/900 minutes\s*$/);
    });

    it('does not call an unset screen limit a limit of 45', () => {
      // The card rendered the slider's starting position, so a child whose
      // parent had set nothing was reported as limited to 45 mins/day.
      renderDashboard(
        [child('learner-12', 'Maya')],
        { 'learner-12': analytics('learner-12', { screenTimeLimitMinutes: 0 }) },
      );
      const card = screen.getByText('Daily Screen Limit').closest('div')?.parentElement;
      expect(card?.textContent).toMatch(/not set/i);
      expect(card?.textContent).not.toContain('45');
    });

    it('shows a limit that has been set', () => {
      renderDashboard(
        [child('learner-12', 'Maya')],
        { 'learner-12': analytics('learner-12', { screenTimeLimitMinutes: 30 }) },
      );
      const card = screen.getByText('Daily Screen Limit').closest('div')?.parentElement;
      expect(card?.textContent).toContain('30');
      expect(card?.textContent).not.toMatch(/not set/i);
    });

    it('does not promise an automated pause it cannot perform', () => {
      renderDashboard([child('learner-12', 'Maya')], { 'learner-12': analytics('learner-12') });
      expect(screen.queryByText(/automated pause/i)).toBeNull();
    });

    it('does not praise retention for a child who has answered nothing', () => {
      // "High retention" sat under a 0% accuracy figure.
      renderDashboard(
        [child('learner-12', 'Maya')],
        { 'learner-12': analytics('learner-12', { masteryDomains: [] }) },
      );
      expect(screen.queryByText(/high retention/i)).toBeNull();
    });
  });
});
