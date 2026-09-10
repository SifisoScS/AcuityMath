/**
 * The join between two id vocabularies.
 *
 * The server keys analytics by learner id (`12`); profiles are `learner-12`.
 * Both sides were tested and both were right, and the parent dashboard still
 * crashed on every load — "Cannot read properties of undefined (reading
 * 'totalTimeMinutes')" — because nothing tested the correspondence between them.
 */

import { describe, expect, it } from 'vitest';

import { keyByProfileId, learnerIdFrom } from './useAnalytics';
import type { ParentAnalytics } from '../types';

const analyticsFor = (studentId: string): ParentAnalytics => ({
  studentId,
  totalTimeMinutes: 4,
  weeklyActivity: [],
  masteryDomains: [],
  strengths: [],
  areasToImprove: [],
  recommendedAction: 'Practise a little more.',
  screenTimeLimitMinutes: 0,
  focusAlertsCount: 0,
});

describe('keying analytics to profiles', () => {
  it('produces the ids `useProfiles` builds', () => {
    // `useProfiles` maps a learner row to `id: \`learner-${learner.id}\``. If
    // that prefix ever changes, this is the test that should fail.
    expect(Object.keys(keyByProfileId({ 12: analyticsFor('12') }))).toEqual(['learner-12']);
  });

  it('rewrites studentId to match its own key', () => {
    // A component reading `analytics.studentId` and one reading the map key
    // must agree, or a screen-time change is saved against another child.
    const keyed = keyByProfileId({ 12: analyticsFor('12') });
    expect(keyed['learner-12'].studentId).toBe('learner-12');
  });

  it('keeps each child’s figures with that child', () => {
    const keyed = keyByProfileId({
      12: { ...analyticsFor('12'), totalTimeMinutes: 4 },
      14: { ...analyticsFor('14'), totalTimeMinutes: 31 },
    });
    expect(keyed['learner-12'].totalTimeMinutes).toBe(4);
    expect(keyed['learner-14'].totalTimeMinutes).toBe(31);
  });

  it('is empty for a family with no children rather than absent', () => {
    expect(keyByProfileId({})).toEqual({});
  });
});

describe('reading a learner id back out', () => {
  it('accepts a profile id', () => {
    expect(learnerIdFrom('learner-12')).toBe(12);
  });

  it('accepts a bare learner id', () => {
    // The map is keyed by profile id, but callers may hold either.
    expect(learnerIdFrom('12')).toBe(12);
  });
});
