/**
 * The join between the server's assignment rows and the ids the views hold.
 *
 * `StudentDashboard` decides what to show a child with
 * `targetStudents.includes(user.id)`, and `user.id` is a profile id
 * (`learner-12`) while the server speaks in learner ids (`12`). Getting that
 * correspondence wrong is silent: no error, no crash, just a child who is never
 * shown the work they were set. The parent dashboard lost a week to the same
 * mismatch in `keyByProfileId`.
 */

import { describe, expect, it } from 'vitest';

import { toTeacherAssignment } from './useAssignments';

const row = {
  id: 7,
  title: 'Ten minutes of number bonds',
  instructions: 'Use the scratchpad.',
  conceptId: 'number-bonds',
  conceptTitle: 'Number Bonds & Compositions',
  tier: 'elementary' as const,
  assignedDate: '2026-09-10',
  dueDate: '2026-09-14',
  targetLearnerIds: [12, 14],
  totalAssigned: 2,
  completedCount: 1,
  rewardCoins: 5,
  status: null,
};

describe('mapping an assignment for the views', () => {
  it('produces target ids a profile can be matched against', () => {
    // `StudentDashboard` filters with `targetStudents.includes(user.id)`.
    expect(toTeacherAssignment(row).targetStudents).toEqual(['learner-12', 'learner-14']);
  });

  it('takes the topic from the concept', () => {
    // The topic used to be free text typed beside a tier nothing checked it
    // against.
    const mapped = toTeacherAssignment(row);
    expect(mapped.topic).toBe('Number Bonds & Compositions');
    expect(mapped.tier).toBe('elementary');
  });

  it('carries the counts the server derived', () => {
    const mapped = toTeacherAssignment(row);
    expect(mapped.totalAssigned).toBe(2);
    expect(mapped.completedCount).toBe(1);
  });

  it('does not invent a due date when none was set', () => {
    expect(toTeacherAssignment({ ...row, dueDate: null }).dueDate).toBe('');
  });

  it('keeps the id as a string the list can key on', () => {
    expect(toTeacherAssignment(row).id).toBe('7');
  });
});
