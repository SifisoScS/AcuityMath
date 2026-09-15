/**
 * Exercising the two rights the institutional agreement grants.
 *
 * E2 built the export, E3 built deletion, and neither had a surface — so a
 * district could exercise neither. These tests are about the parts that only
 * exist in the browser: the confirmation that cannot be dismissed by reflex, the
 * file that is built client-side, and the step-up path the server had always
 * distinguished and nothing had ever shown.
 */

import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { PupilRecords } from './PupilRecords';

const pupilsQuery = vi.fn();
const exportFetch = vi.fn();
const deleteMutate = vi.fn();
const elevateMutate = vi.fn();
const setPinMutate = vi.fn();

vi.mock('../../lib/trpc', () => ({
  trpc: {
    useUtils: () => ({
      learners: { export: { fetch: exportFetch } },
      institutions: { overview: { invalidate: vi.fn() } },
    }),
    institutions: { pupils: { useQuery: () => pupilsQuery() } },
    learners: {
      delete: { useMutation: () => ({ mutate: deleteMutate, isPending: false }) },
    },
    access: {
      elevate: { useMutation: () => ({ mutate: elevateMutate }) },
      setPin: { useMutation: () => ({ mutate: setPinMutate }) },
    },
  },
}));

const ada = { id: 12, displayName: 'Ada', birthYear: 2016, archivedAt: null };

describe('a district acting on a pupil’s records', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    pupilsQuery.mockReturnValue({ data: [ada], refetch: vi.fn(), isLoading: false });
  });

  describe('removal', () => {
    it('will not proceed until the child’s name is typed', async () => {
      /*
       * **The guard that matters.** A confirmation dialogue is dismissed by the
       * same reflex that opened it. Reproducing the name is the smallest thing
       * that cannot be done by accident, and it makes somebody say which child
       * they mean — the mistake that actually happens in a list of thirty.
       */
      render(<PupilRecords institutionId={1} />);
      await userEvent.click(screen.getByRole('button', { name: /remove records/i }));

      const confirm = screen.getByRole('button', { name: /remove permanently/i });
      expect(confirm).toBeDisabled();

      await userEvent.type(screen.getByRole('textbox'), 'Adam');
      expect(confirm).toBeDisabled();

      await userEvent.clear(screen.getByRole('textbox'));
      await userEvent.type(screen.getByRole('textbox'), 'Ada');
      expect(confirm).toBeEnabled();

      await userEvent.click(confirm);
      expect(deleteMutate).toHaveBeenCalledWith({ learnerId: 12 }, expect.anything());
    });

    it('says it cannot be undone, and that it is not hiding', async () => {
      // The agreement distinguishes the two acts. So must the sentence somebody
      // reads a second before doing one of them.
      render(<PupilRecords institutionId={1} />);
      await userEvent.click(screen.getByRole('button', { name: /remove records/i }));

      const dialog = screen.getByRole('dialog');
      expect(dialog).toHaveTextContent(/cannot be undone/i);
      expect(dialog).toHaveTextContent(/not the same as hiding/i);
    });

    it('can be abandoned', async () => {
      render(<PupilRecords institutionId={1} />);
      await userEvent.click(screen.getByRole('button', { name: /remove records/i }));
      await userEvent.click(screen.getByRole('button', { name: /^cancel$/i }));

      expect(screen.queryByRole('dialog')).toBeNull();
      expect(deleteMutate).not.toHaveBeenCalled();
    });
  });

  describe('export', () => {
    it('builds the file in the browser and names it without the child', async () => {
      /*
       * The contents identify them completely, but a **filename** sits in a
       * Downloads folder, appears in a file picker during a screen share, and is
       * read by people who were never meant to open it.
       */
      exportFetch.mockResolvedValue({ learner: { id: 12 }, records: {}, about: {} });
      const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
      const created: string[] = [];
      vi.stubGlobal('URL', {
        ...URL,
        createObjectURL: () => {
          created.push('blob:x');
          return 'blob:x';
        },
        revokeObjectURL: () => {},
      });

      render(<PupilRecords institutionId={1} />);
      await userEvent.click(screen.getByRole('button', { name: /export records/i }));

      await waitFor(() => expect(click).toHaveBeenCalled());
      expect(exportFetch).toHaveBeenCalledWith({ learnerId: 12 });
      expect(created).toHaveLength(1);

      const anchor = click.mock.instances[0] as unknown as HTMLAnchorElement;
      expect(anchor.download).toMatch(/^acuitymath-learner-12-\d{4}-\d{2}-\d{2}\.json$/);
      expect(anchor.download).not.toContain('Ada');

      click.mockRestore();
      vi.unstubAllGlobals();
    });
  });

  describe('when the server asks the adult to prove they are there', () => {
    it('shows a PIN box rather than the raw refusal', async () => {
      /*
       * `STEP_UP_REQUIRED` is what `elevatedLearnerProcedure` throws. Showing it
       * raw would put an implementation detail in front of somebody who needs a
       * PIN box.
       */
      exportFetch.mockRejectedValue({ message: 'STEP_UP_REQUIRED' });

      render(<PupilRecords institutionId={1} />);
      await userEvent.click(screen.getByRole('button', { name: /export records/i }));

      expect(await screen.findByLabelText(/^pin$/i)).toBeInTheDocument();
      expect(screen.queryByText(/STEP_UP_REQUIRED/)).toBeNull();
    });

    it('offers to set one when there is none, which is a different next step', async () => {
      /*
       * The server distinguished these from the start — a wrong PIN is retyped,
       * an unset one is chosen — and nothing had ever shown the difference to
       * anybody.
       */
      exportFetch.mockRejectedValue({ message: 'STEP_UP_REQUIRED' });
      elevateMutate.mockImplementation((_input, handlers) => {
        handlers.onError({ message: 'No PIN has been set yet.' });
      });

      render(<PupilRecords institutionId={1} />);
      await userEvent.click(screen.getByRole('button', { name: /export records/i }));
      await userEvent.type(await screen.findByLabelText(/^pin$/i), '1234');
      await userEvent.click(screen.getByRole('button', { name: /continue/i }));

      expect(await screen.findByText(/choose a pin/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/new pin/i)).toBeInTheDocument();
    });

    it('shows a wrong PIN as something to retype', async () => {
      exportFetch.mockRejectedValue({ message: 'STEP_UP_REQUIRED' });
      elevateMutate.mockImplementation((_input, handlers) => {
        handlers.onError({ message: 'Incorrect PIN. 4 attempts left.' });
      });

      render(<PupilRecords institutionId={1} />);
      await userEvent.click(screen.getByRole('button', { name: /export records/i }));
      await userEvent.type(await screen.findByLabelText(/^pin$/i), '0000');
      await userEvent.click(screen.getByRole('button', { name: /continue/i }));

      expect(await screen.findByRole('alert')).toHaveTextContent(/4 attempts left/);
      expect(screen.queryByText(/choose a pin/i)).toBeNull();
    });
  });

  describe('an archived pupil', () => {
    it('is listed, and marked as hidden rather than removed', async () => {
      /*
       * They are the ones most likely to be the subject of a deletion request —
       * a child who left months ago is exactly who a family writes in about — so
       * hiding them here would mean the request could not be honoured at all.
       */
      pupilsQuery.mockReturnValue({
        data: [{ ...ada, archivedAt: new Date().toISOString() }],
        refetch: vi.fn(),
        isLoading: false,
      });

      render(<PupilRecords institutionId={1} />);
      expect(screen.getByText(/hidden from surfaces, not removed/i)).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /remove records/i })).toBeEnabled();
    });
  });
});
