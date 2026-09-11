/**
 * That the trap actually traps.
 *
 * `modalAccessibility.test.ts` checks every dialog *imports* `useModalA11y` and
 * declares `aria-modal`. That is a real guard — twelve dialogs claimed neither —
 * but it is a grep: it would pass just as happily if this hook did nothing at
 * all. These drive the keyboard.
 */

import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React, { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';

import { useModalA11y } from './useModalA11y';

/** A dialog with three controls and a button outside it to escape to. */
function Fixture({ onClose, open = true }: { onClose: () => void; open?: boolean }) {
  const panelRef = useModalA11y(open, onClose);
  return (
    <>
      <button>outside before</button>
      {open && (
        <div ref={panelRef} role="dialog" aria-modal="true" aria-label="Test dialog" tabIndex={-1}>
          <button>first</button>
          <button>second</button>
          <button>last</button>
        </div>
      )}
      <button>outside after</button>
    </>
  );
}

describe('the modal focus trap', () => {
  it('moves focus into the dialog when it opens', async () => {
    // The panel itself, not its first button: a screen reader then reads the
    // dialog's label before its controls.
    render(<Fixture onClose={vi.fn()} />);
    expect(document.activeElement).toBe(screen.getByRole('dialog'));
  });

  it('wraps from the last control back to the first', async () => {
    const user = userEvent.setup();
    render(<Fixture onClose={vi.fn()} />);

    screen.getByText('last').focus();
    await user.tab();

    expect(document.activeElement).toBe(screen.getByText('first'));
  });

  it('wraps backwards from the first control to the last', async () => {
    const user = userEvent.setup();
    render(<Fixture onClose={vi.fn()} />);

    screen.getByText('first').focus();
    await user.tab({ shift: true });

    expect(document.activeElement).toBe(screen.getByText('last'));
  });

  it('never lands on a control outside the dialog', async () => {
    // The failure this prevents: a keyboard user tabs past the end and starts
    // operating the page behind an overlay they cannot see through.
    const user = userEvent.setup();
    render(<Fixture onClose={vi.fn()} />);

    const outside = [screen.getByText('outside before'), screen.getByText('outside after')];
    for (let i = 0; i < 12; i++) {
      await user.tab();
      expect(outside).not.toContain(document.activeElement);
    }
  });

  it('closes on Escape', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(<Fixture onClose={onClose} />);

    await user.keyboard('{Escape}');
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('does nothing while closed', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(<Fixture onClose={onClose} open={false} />);

    await user.keyboard('{Escape}');
    expect(onClose).not.toHaveBeenCalled();
  });

  it('returns focus to whatever opened it', async () => {
    // Closing a dialog should not dump the user at the top of the document,
    // where a screen reader starts reading the page again from the beginning.
    const user = userEvent.setup();

    function Openable() {
      const [open, setOpen] = useState(false);
      return (
        <>
          <button onClick={() => setOpen(true)}>open the dialog</button>
          <Fixture onClose={() => setOpen(false)} open={open} />
        </>
      );
    }

    render(<Openable />);
    const opener = screen.getByText('open the dialog');
    await user.click(opener);
    expect(document.activeElement).toBe(screen.getByRole('dialog'));

    await user.keyboard('{Escape}');
    expect(document.activeElement).toBe(opener);
  });

  it('does not drag focus back if the user has already moved on', async () => {
    // Clicking something else and then having the dialog close should not yank
    // the cursor away from where the user just put it.
    const user = userEvent.setup();

    function Openable() {
      const [open, setOpen] = useState(true);
      return (
        <>
          <button onClick={() => setOpen(false)}>close from outside</button>
          <Fixture onClose={() => setOpen(false)} open={open} />
        </>
      );
    }

    render(<Openable />);
    const outsideButton = screen.getByText('close from outside');
    await user.click(outsideButton);

    expect(document.activeElement).toBe(outsideButton);
  });
});
