/**
 * What a teacher is shown when their LMS asks them to choose, and what
 * pressing the button actually does.
 *
 * The case that matters most is the last step. The specification requires the
 * response to reach the platform as a POST **from the teacher's own browser**,
 * so this component is handed a signed token and submits it itself. A form that
 * is built but never submitted, or submitted before React has rendered it,
 * leaves a teacher looking at a page that says it is sending and never does —
 * and neither failure is visible from the server side.
 */

import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi, beforeEach } from 'vitest';

import { ContentPicker } from './ContentPicker';

const pendingChoice = vi.fn();
const conceptsQuery = vi.fn();
const mutate = vi.fn();
const mutationState: { data: { returnUrl: string; jwt: string } | null; isPending: boolean } = {
  data: null,
  isPending: false,
};

vi.mock('../../lib/trpc', () => ({
  trpc: {
    lti: {
      pendingChoice: { useQuery: () => pendingChoice() },
      returnChoice: {
        useMutation: () => ({
          mutate,
          data: mutationState.data,
          isPending: mutationState.isPending,
        }),
      },
    },
    curriculum: { concepts: { useQuery: () => conceptsQuery() } },
  },
}));

describe('choosing what a link opens', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mutationState.data = null;
    mutationState.isPending = false;
    pendingChoice.mockReturnValue({
      isLoading: false,
      data: { requestId: 7, acceptMultiple: false, acceptTypes: ['ltiResourceLink'] },
    });
    conceptsQuery.mockReturnValue({
      data: [
        { id: 'fractions-1', title: 'Halves and quarters' },
        { id: 'times-2', title: 'Two times table' },
      ],
    });
  });

  it('offers the adaptive default before any particular topic', async () => {
    /*
     * "Whatever they need next" is what the product does. Forcing a concept
     * would make every link narrower than the product is, and a teacher wanting
     * general practice would have to pick something arbitrary and misleading.
     */
    render(<ContentPicker />);

    const select = screen.getByLabelText(/topic/i) as HTMLSelectElement;
    expect(select.options[0].textContent).toMatch(/whatever each pupil needs next/i);
    expect(select.value).toBe('__adaptive__');
  });

  it('lists the concepts a teacher could pick instead', async () => {
    render(<ContentPicker />);
    expect(screen.getByRole('option', { name: 'Halves and quarters' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Two times table' })).toBeInTheDocument();
  });

  it('sends no concept when the teacher leaves it adaptive', async () => {
    render(<ContentPicker />);
    await userEvent.click(screen.getByRole('button', { name: /add to my course/i }));

    expect(mutate).toHaveBeenCalledWith(
      { requestId: 7, chosen: [{ title: 'AcuityMath' }] },
      expect.anything(),
    );
  });

  it('names the link after the topic when one is chosen', async () => {
    /*
     * The title is what appears in the teacher's course. "AcuityMath" three
     * times over tells them nothing about which link is which.
     */
    render(<ContentPicker />);
    await userEvent.selectOptions(screen.getByLabelText(/topic/i), 'fractions-1');
    await userEvent.click(screen.getByRole('button', { name: /add to my course/i }));

    expect(mutate).toHaveBeenCalledWith(
      {
        requestId: 7,
        chosen: [{ title: 'Halves and quarters', conceptId: 'fractions-1' }],
      },
      expect.anything(),
    );
  });

  describe('the last step, which belongs to the browser', () => {
    it('builds the form the platform expects and submits it', async () => {
      /*
       * **The assertion this file exists for.** The response has to arrive at
       * the platform as a POST from the teacher's own session; nothing on the
       * server can make that request for them.
       */
      const submit = vi
        .spyOn(HTMLFormElement.prototype, 'submit')
        .mockImplementation(() => undefined);

      mutationState.data = { returnUrl: 'https://platform.test/return', jwt: 'signed.jwt.value' };
      render(<ContentPicker />);

      const field = document.querySelector('input[name="JWT"]') as HTMLInputElement;
      const form = field.closest('form') as HTMLFormElement;

      expect(form.getAttribute('action')).toBe('https://platform.test/return');
      expect(form.getAttribute('method')).toBe('post');
      expect(field.value).toBe('signed.jwt.value');

      await waitFor(() => expect(submit).toHaveBeenCalled());
      submit.mockRestore();
    });

    it('leaves a button for anyone the script does not reach', async () => {
      // A form that submits itself and fails otherwise leaves somebody staring
      // at a page that says it is sending, for ever.
      vi.spyOn(HTMLFormElement.prototype, 'submit').mockImplementation(() => undefined);
      mutationState.data = { returnUrl: 'https://platform.test/return', jwt: 'j' };

      render(<ContentPicker />);
      expect(screen.getByRole('button', { name: /continue/i })).toBeInTheDocument();
    });
  });

  describe('when there is nothing to choose', () => {
    it('says how to get back rather than naming the internal state', async () => {
      /*
       * They arrived directly, or the hour ran out. Both are fixed the same way,
       * and "start again from your course" is something a teacher can act on —
       * unlike "no pending request".
       */
      pendingChoice.mockReturnValue({ isLoading: false, data: null });
      render(<ContentPicker />);

      expect(screen.getByText(/start again from/i)).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /add to my course/i })).toBeNull();
    });
  });

  describe('when the server refuses', () => {
    it('shows the sentence rather than swallowing it', async () => {
      /*
       * Every refusal from the server names something the teacher or their
       * administrator can do. The alternative is a button that does nothing when
       * pressed.
       */
      mutate.mockImplementation((_input, handlers) => {
        handlers.onError({ message: 'That request has already been answered.' });
      });

      render(<ContentPicker />);
      await userEvent.click(screen.getByRole('button', { name: /add to my course/i }));

      expect(await screen.findByRole('alert')).toHaveTextContent(
        /already been answered/i,
      );
    });
  });
});
