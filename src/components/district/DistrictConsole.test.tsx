/**
 * What a district administrator is shown, and what they are not.
 *
 * The component this replaced invented four campuses, their principals by name,
 * their mean ability and ELO, and a 99.4% "LMS sync health" computed from
 * nothing. It was never routed, which is the only reason it never told anybody
 * those things.
 *
 * So half of these tests assert an **absence**. That is unusual and deliberate:
 * a number that is not measured is worse than a blank, because a blank prompts a
 * question and a plausible figure ends one — and nothing else in the build would
 * notice such a figure reappearing.
 */

import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { DistrictConsole } from './DistrictConsole';

const overviewQuery = vi.fn();
const coursesQuery = vi.fn();
const syncMutate = vi.fn();
const syncState: {
  data: unknown;
  error: { message: string } | null;
  isPending: boolean;
} = { data: null, error: null, isPending: false };

vi.mock('../../lib/trpc', () => ({
  trpc: {
    institutions: { overview: { useQuery: () => overviewQuery() } },
    lti: {
      courses: { useQuery: () => coursesQuery() },
      syncRoster: {
        useMutation: () => ({
          mutate: syncMutate,
          data: syncState.data,
          error: syncState.error,
          isPending: syncState.isPending,
        }),
      },
    },
  },
}));

const district = (over: Record<string, unknown> = {}) => ({
  isLoading: false,
  error: null,
  refetch: vi.fn(),
  data: {
    id: 1,
    name: 'Lincoln Unified',
    slug: 'lincoln-unified',
    agreement: {
      inForce: true,
      signatoryName: 'Grace Hopper',
      signatoryTitle: 'Head of School',
      signedAt: '2026-01-10T09:00:00.000Z',
      expiresAt: null,
    },
    staff: { administrators: 1, teachers: 4, total: 5 },
    campuses: [{ id: 9, name: 'Lincoln Elementary' }],
    pupils: 37,
    ...over,
  },
});

describe('what a district administrator sees', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    syncState.data = null;
    syncState.error = null;
    syncState.isPending = false;
    overviewQuery.mockReturnValue(district());
    coursesQuery.mockReturnValue({ isLoading: false, data: [], refetch: vi.fn() });
  });

  it('shows the counts the product can actually answer', () => {
    render(<DistrictConsole institutionId={1} />);

    expect(screen.getByText('Lincoln Unified')).toBeInTheDocument();
    expect(screen.getByText('37')).toBeInTheDocument();
    expect(screen.getByText('4')).toBeInTheDocument();
    expect(screen.getByText('Lincoln Elementary')).toBeInTheDocument();
  });

  it('invents nothing the old dashboard invented', () => {
    /*
     * **The assertion this file exists for.** Each of these was a number in
     * `DistrictAdminDashboard.tsx`, and none of them is something this product
     * measures: mean ability and ELO per campus are statistical claims nobody
     * has made, no mapping to a standards framework exists, and nothing flags
     * interventions.
     */
    render(<DistrictConsole institutionId={1} />);
    const page = document.body.textContent ?? '';

    for (const invented of [
      'ELO',
      'Mean ability',
      'Standards coverage',
      'Intervention',
      'Sync health',
      'Principal',
    ]) {
      expect(page.toLowerCase()).not.toContain(invented.toLowerCase());
    }
  });

  it('shows zero rather than something plausible for an empty district', () => {
    // True and useful. A district with no pupils yet should look like one.
    overviewQuery.mockReturnValue(
      district({ pupils: 0, staff: { administrators: 1, teachers: 0, total: 1 }, campuses: [] }),
    );
    render(<DistrictConsole institutionId={1} />);

    expect(screen.getByText('None recorded.')).toBeInTheDocument();
    expect(screen.getAllByText('0').length).toBeGreaterThan(0);
  });

  describe('the agreement, which gates everything else', () => {
    it('says who signed it and when', () => {
      render(<DistrictConsole institutionId={1} />);
      expect(screen.getByText(/Grace Hopper/)).toBeInTheDocument();
      expect(screen.getByText(/Head of School/)).toBeInTheDocument();
    });

    it('warns loudly when there is none, and says what that means', () => {
      /*
       * An administrator seeing zero pupils deserves to know this is why, rather
       * than concluding the product is broken or nobody has used it.
       */
      overviewQuery.mockReturnValue(
        district({ agreement: { inForce: false, everSigned: false } }),
      );
      render(<DistrictConsole institutionId={1} />);

      const alert = screen.getByRole('alert');
      expect(alert).toHaveTextContent(/no agreement is in force/i);
      expect(alert).toHaveTextContent(/cannot be signed in from an LMS/i);
    });

    it('distinguishes never signed from expired', () => {
      overviewQuery.mockReturnValue(
        district({ agreement: { inForce: false, everSigned: true } }),
      );
      render(<DistrictConsole institutionId={1} />);
      expect(screen.getByRole('alert')).toHaveTextContent(/expired or was withdrawn/i);
    });
  });

  describe('courses from the LMS', () => {
    const course = (over: Record<string, unknown> = {}) => ({
      id: 5,
      contextId: 'ctx-1',
      title: 'Year 4 Maths',
      lastSyncedAt: null,
      classroomId: null,
      canSync: true,
      knowsYearGroup: true,
      ...over,
    });

    it('offers a synchronise button for a course that can be', async () => {
      coursesQuery.mockReturnValue({ isLoading: false, data: [course()], refetch: vi.fn() });
      render(<DistrictConsole institutionId={1} />);

      await userEvent.click(screen.getByRole('button', { name: /synchronise/i }));
      expect(syncMutate).toHaveBeenCalledWith({ contextId: 5 });
    });

    it('says what is missing rather than letting the button fail', () => {
      /*
       * The two things that stop a sync and the two things only an administrator
       * can fix. Saying it here is the difference between a five-minute
       * configuration change and a support ticket.
       */
      coursesQuery.mockReturnValue({
        isLoading: false,
        data: [course({ canSync: false, knowsYearGroup: false })],
        refetch: vi.fn(),
      });
      render(<DistrictConsole institutionId={1} />);

      expect(screen.getByText(/Names and Roles scope/i)).toBeInTheDocument();
      expect(screen.getByText(/grade_level/i)).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /synchronise/i })).toBeDisabled();
    });

    it('reports what a sync actually did, including nothing', () => {
      // A sync that created nobody is a real outcome — a course with no year
      // group configured looks exactly like that — and hiding it would leave an
      // administrator believing it had worked.
      coursesQuery.mockReturnValue({ isLoading: false, data: [course()], refetch: vi.fn() });
      syncState.data = {
        created: 0,
        enrolled: 0,
        unenrolled: 0,
        skipped: 3,
        unknownStaff: 1,
        classroomId: 2,
      };
      render(<DistrictConsole institutionId={1} />);

      const status = screen.getByRole('status');
      expect(status).toHaveTextContent(/0 pupils created/);
      expect(status).toHaveTextContent(/3 skipped/);
      expect(status).toHaveTextContent(/1 staff on the roster have not opened/);
    });

    it('shows the server’s refusal rather than swallowing it', () => {
      coursesQuery.mockReturnValue({ isLoading: false, data: [course()], refetch: vi.fn() });
      syncState.error = { message: 'Nobody who teaches this course has opened AcuityMath yet.' };
      render(<DistrictConsole institutionId={1} />);

      expect(screen.getByRole('alert')).toHaveTextContent(/has opened AcuityMath yet/);
    });
  });

  describe('a district that is not yours', () => {
    it('says so rather than rendering an empty console', () => {
      /*
       * `NOT_FOUND` is what another district's administrator gets, and it is the
       * same answer a district that does not exist gets. A blank page would
       * leave somebody wondering whether their district had been deleted.
       */
      overviewQuery.mockReturnValue({
        isLoading: false,
        error: { message: 'Administrators of this institution only.' },
        data: undefined,
        refetch: vi.fn(),
      });
      render(<DistrictConsole institutionId={999} />);

      expect(screen.getByText(/not available to you/i)).toBeInTheDocument();
      expect(screen.queryByText(/pupils/i)).toBeNull();
    });
  });
});
