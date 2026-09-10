/**
 * What the assignment form will and will not let a teacher do.
 *
 * The old form built a `TeacherAssignment` object, dropped it into React state,
 * played a fanfare and showed a success toast. Nothing could fail, because
 * nothing was saved. Now the write can be refused — by the step-up gate, or
 * because the caller may not set work for one of the children named — and these
 * cover the difference.
 */

import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { TeacherDashboard, type AssignableConcept } from './TeacherDashboard';
import type { TeacherAssignment, UserProfile } from '../types';

const student = (id: string, name: string): UserProfile => ({
  id,
  name,
  role: 'student',
  age: 12,
  avatar: '🤖',
  tier: 'middle',
  dynamicLevel: 4,
  eloRating: 1000,
  xp: 0,
  coins: 0,
  streakDays: 0,
  streakShields: 0,
  accuracyRate: 70,
  completedLessonsCount: 1,
  unlockedAvatars: [],
});

const concepts: AssignableConcept[] = [
  {
    id: 'number-bonds',
    title: 'Number Bonds & Compositions',
    strand: 'number',
    tier: 'elementary',
    ageBandLow: 6,
    ageBandHigh: 8,
  },
  {
    id: 'two-step-equations',
    title: 'Two-step equations',
    strand: 'algebra',
    tier: 'middle',
    ageBandLow: 11,
    ageBandHigh: 14,
  },
];

interface Options {
  students?: UserProfile[];
  assignableStudentIds?: string[];
  assignments?: TeacherAssignment[];
  onCreateAssignment?: (input: unknown) => Promise<void>;
}

function renderDashboard(options: Options = {}) {
  const onCreateAssignment = options.onCreateAssignment ?? vi.fn().mockResolvedValue(undefined);
  render(
    <TeacherDashboard
      students={options.students ?? [student('learner-13', 'Leo'), student('learner-12', 'Maya')]}
      assignments={options.assignments ?? []}
      concepts={concepts}
      assignableStudentIds={options.assignableStudentIds ?? ['learner-13']}
      onCreateAssignment={onCreateAssignment as never}
      onSendStudentNotification={vi.fn()}
    />,
  );
  return { onCreateAssignment };
}

/** Opens the create-assignment modal. */
async function openForm(user: ReturnType<typeof userEvent.setup>) {
  const openers = screen.getAllByRole('button', { name: /assign|create|new/i });
  await user.click(openers[0]);
  return screen.findByLabelText(/concept/i);
}

describe('the assignment form', () => {
  it('offers only children this adult may set work for', async () => {
    const user = userEvent.setup();
    // Leo is in the teacher's classroom; Maya is on the roster but is not.
    renderDashboard({ assignableStudentIds: ['learner-13'] });
    await openForm(user);

    expect(screen.getByRole('checkbox', { name: /Leo/ })).toBeTruthy();
    expect(screen.queryByRole('checkbox', { name: /Maya/ })).toBeNull();
  });

  it('says so when there is nobody to assign to', async () => {
    const user = userEvent.setup();
    renderDashboard({ assignableStudentIds: [] });
    await openForm(user);

    expect(screen.getByText(/no learners you can set work for/i)).toBeTruthy();
  });

  it('pre-selects nobody', async () => {
    /*
     * This defaulted to every child on the roster. Once the checkbox list is
     * limited to children the adult may set work for, that pre-selection
     * includes children with no checkbox to clear — so every submit is refused
     * by the server and nothing on screen can be changed to fix it.
     */
    const user = userEvent.setup();
    renderDashboard({ assignableStudentIds: ['learner-13'] });
    await openForm(user);

    for (const box of screen.getAllByRole('checkbox')) {
      expect((box as HTMLInputElement).checked).toBe(false);
    }
    expect(screen.getByRole('button', { name: /publish/i }).hasAttribute('disabled')).toBe(true);
  });

  it('will not submit without a concept', async () => {
    const user = userEvent.setup();
    const { onCreateAssignment } = renderDashboard();
    await openForm(user);

    await user.type(screen.getByLabelText(/assignment title/i), 'Fractions practice');
    await user.click(screen.getByRole('checkbox', { name: /Leo/ }));

    const submit = screen.getByRole('button', { name: /publish/i });
    expect(submit.hasAttribute('disabled')).toBe(true);
    await user.click(submit);
    expect(onCreateAssignment).not.toHaveBeenCalled();
  });

  it('will not submit without anybody selected', async () => {
    const user = userEvent.setup();
    const { onCreateAssignment } = renderDashboard();
    await openForm(user);

    await user.type(screen.getByLabelText(/assignment title/i), 'Fractions practice');
    await user.selectOptions(screen.getByLabelText(/concept/i), 'two-step-equations');

    await user.click(screen.getByRole('button', { name: /publish/i }));
    expect(onCreateAssignment).not.toHaveBeenCalled();
  });

  it('sends the concept id rather than a typed topic', async () => {
    const user = userEvent.setup();
    const { onCreateAssignment } = renderDashboard();
    await openForm(user);

    await user.type(screen.getByLabelText(/assignment title/i), 'Fractions practice');
    await user.selectOptions(screen.getByLabelText(/concept/i), 'two-step-equations');
    await user.click(screen.getByRole('checkbox', { name: /Leo/ }));
    await user.click(screen.getByRole('button', { name: /publish/i }));

    await waitFor(() => expect(onCreateAssignment).toHaveBeenCalledTimes(1));
    expect(onCreateAssignment).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'Fractions practice',
        conceptId: 'two-step-equations',
        targetStudents: ['learner-13'],
      }),
    );
  });

  describe('when the server refuses', () => {
    it('shows the reason instead of celebrating', async () => {
      const user = userEvent.setup();
      const { onCreateAssignment } = renderDashboard({
        onCreateAssignment: vi
          .fn()
          .mockRejectedValue(new Error('You cannot set work for one or more of those learners.')),
      });
      await openForm(user);

      await user.type(screen.getByLabelText(/assignment title/i), 'Fractions practice');
      await user.selectOptions(screen.getByLabelText(/concept/i), 'two-step-equations');
      await user.click(screen.getByRole('checkbox', { name: /Leo/ }));
      await user.click(screen.getByRole('button', { name: /publish/i }));

      await waitFor(() => expect(onCreateAssignment).toHaveBeenCalled());
      expect(await screen.findByRole('alert')).toHaveProperty(
        'textContent',
        expect.stringContaining('cannot set work'),
      );
      // The toast is the celebration; a refused write must not produce one.
      expect(screen.queryByText(/assigned to 1 students/i)).toBeNull();
    });
  });

  it('does not report a pilot statistic it has no responses for', () => {
    // "88% report optimal ZPD (24 responses)" came from state seeded with those
    // two numbers. `/api/feedback` does not exist, so nothing could ever
    // replace them: a fabricated research finding about a pilot with no data.
    renderDashboard();
    expect(screen.queryByText(/report optimal ZPD/i)).toBeNull();
    expect(screen.queryByText(/24 responses/i)).toBeNull();
  });

  it('describes the class it has, not the age range of the product', () => {
    // This said "Ages 3 through 18" under a count of two.
    renderDashboard({
      students: [student('learner-13', 'Leo'), student('learner-15', 'Alexander')],
      assignableStudentIds: ['learner-13', 'learner-15'],
    });
    expect(screen.queryByText(/Ages 3 through 18/i)).toBeNull();
  });

  it('does not offer to write the assignment to Google Classroom', async () => {
    // The toggle said it "Writes assignment to Google Classroom & Canvas course
    // streams". Nothing does. A false statement about where a pupil's work is
    // sent is worse than a wrong number on a chart.
    const user = userEvent.setup();
    renderDashboard();
    await openForm(user);

    expect(screen.queryByText(/google classroom|canvas/i)).toBeNull();
  });
});
