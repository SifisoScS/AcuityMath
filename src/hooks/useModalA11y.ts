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

/**
 * Whether a control can actually be tabbed to.
 *
 * This was `element.offsetParent !== null`, which is a layout question. Two
 * problems with that: it is always null in jsdom, so no test could ever exercise
 * the wrap-around — the trap was covered only by a grep for the import — and it
 * is also null for any `position: fixed` element in a real browser, which is
 * exactly what these dialog panels are.
 *
 * Asking about the things that actually make a control unreachable is both more
 * accurate and testable.
 */
function canBeTabbedTo(element: HTMLElement): boolean {
  if (element.hasAttribute('hidden') || element.closest('[hidden]')) return false;
  if (element.getAttribute('aria-hidden') === 'true') return false;
  if (element.hasAttribute('disabled')) return false;

  const style = element.ownerDocument.defaultView?.getComputedStyle(element);
  if (style && (style.display === 'none' || style.visibility === 'hidden')) return false;

  return true;
}

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
      const focusable = nodes.filter(canBeTabbedTo);
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

      /*
       * Where focus should go now.
       *
       * The previous condition was `panel?.contains(document.activeElement)`,
       * which never held for a dialog the parent unmounts — and that is most of
       * them. By the time this cleanup runs the panel is detached and focus has
       * already fallen to `<body>`, so the check said "the user moved on" and
       * left them at the top of the document, where a screen reader starts
       * reading the page from the beginning.
       *
       * Falling to `<body>` is the signal that nothing else claimed focus, so it
       * is treated the same as focus still being inside the dialog. Anything
       * else means the user clicked something, and dragging them back from it
       * would be worse than not restoring at all.
       */
      const active = document.activeElement;
      const focusWasLost = active === null || active === document.body;
      if (focusWasLost || panel?.contains(active)) {
        returnFocusTo.current?.focus?.();
      }
    };
  }, [isOpen, onClose]);

  return panelRef;
}
