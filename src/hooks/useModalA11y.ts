/**
 * The keyboard and screen-reader behaviour a modal owes its user.
 *
 * A `fixed inset-0` div that covers the screen is a modal to someone looking at
 * it and nothing at all to someone who is not. Without a role it is not
 * announced; without a focus trap the keyboard walks straight out of it into
 * the page behind, where the user can operate controls they cannot see; without
 * an Escape handler there is no way out except finding the close button.
 *
 * Returns a ref to put on the modal panel. The caller supplies the role and
 * label attributes, because those name *that* dialog rather than dialogs in
 * general.
 */

import { useEffect, useRef } from 'react';

/** Everything the browser will let a user tab to. */
const FOCUSABLE =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

export function useModalA11y(isOpen: boolean, onClose: () => void) {
  const panelRef = useRef<HTMLDivElement | null>(null);
  const returnFocusTo = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!isOpen) return;

    // Remember where focus came from, so closing returns the user to the
    // control they opened it with rather than to the top of the document.
    returnFocusTo.current = document.activeElement as HTMLElement | null;

    const panel = panelRef.current;
    // Focus the panel itself rather than its first control: a screen reader
    // then reads the dialog's label before its buttons, which is the
    // introduction a sighted user gets from seeing it appear.
    panel?.focus();

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        event.stopPropagation();
        onClose();
        return;
      }

      if (event.key !== 'Tab' || !panel) return;

      const nodes: HTMLElement[] = [];
      panel.querySelectorAll<HTMLElement>(FOCUSABLE).forEach(node => nodes.push(node));
      // Hidden controls are still in the DOM but cannot be tabbed to, so
      // including them would make the trap skip a turn.
      const focusable = nodes.filter(element => element.offsetParent !== null);
      if (focusable.length === 0) {
        // Nothing to move to; keep focus on the panel rather than letting it
        // escape to the page behind.
        event.preventDefault();
        return;
      }

      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const active = document.activeElement;

      if (event.shiftKey && (active === first || active === panel)) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && active === last) {
        event.preventDefault();
        first.focus();
      }
    }

    document.addEventListener('keydown', onKeyDown, true);
    return () => {
      document.removeEventListener('keydown', onKeyDown, true);
      // Only restore focus if it is still inside the closing dialog. If the
      // user has already clicked elsewhere, dragging them back is worse.
      if (panel?.contains(document.activeElement)) {
        returnFocusTo.current?.focus?.();
      }
    };
  }, [isOpen, onClose]);

  return panelRef;
}
