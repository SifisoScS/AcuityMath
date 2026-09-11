/**
 * Every modal is announced, and named.
 *
 * A `fixed inset-0` div covering the screen is a dialog to someone looking at
 * it and nothing at all to someone using a screen reader. Thirteen of the
 * fourteen modals here were exactly that until this test was written.
 *
 * This reads the source rather than rendering, deliberately. Rendering fourteen
 * modals would mean constructing fourteen sets of props and mounting a good
 * part of the application; the property being checked — that the overlay
 * declares what it is — is visible in the markup, and a source check that runs
 * in milliseconds is a check people keep.
 */

import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

const COMPONENTS_DIR = path.resolve(import.meta.dirname);

const modalFiles = readdirSync(COMPONENTS_DIR).filter(
  file => file.endsWith('Modal.tsx') && !file.endsWith('.test.tsx'),
);

const sourceOf = (file: string) => readFileSync(path.join(COMPONENTS_DIR, file), 'utf-8');

describe('modal accessibility', () => {
  it('finds the modals', () => {
    // Guards the guard: a glob that matches nothing passes every test below.
    expect(modalFiles.length).toBeGreaterThanOrEqual(14);
  });

  it.each(modalFiles)('%s declares itself a dialog', file => {
    expect(sourceOf(file)).toContain('role="dialog"');
  });

  it.each(modalFiles)('%s has an accessible name', file => {
    const source = sourceOf(file);
    const named = source.includes('aria-label=') || source.includes('aria-labelledby=');
    expect(named).toBe(true);
  });

  it.each(modalFiles)('%s does not claim to be modal without trapping focus', file => {
    // `aria-modal="true"` tells assistive technology the rest of the page is
    // inert. Saying so while the keyboard can still walk out of the dialog is
    // worse than saying nothing: the user is told they are enclosed and then
    // finds themselves somewhere they cannot see.
    //
    // So the two travel together. A modal earns `aria-modal` by using
    // `useModalA11y`, which traps Tab and handles Escape.
    const source = sourceOf(file);
    if (source.includes('aria-modal')) {
      expect(source, `${file} claims aria-modal without useModalA11y`).toContain('useModalA11y');
    }
  });

  it.each(modalFiles)('%s traps focus, unless it is the lock', file => {
    /*
     * This used to ask only for *one* trapped dialog "to model the rest on",
     * because twelve of them were not. They all are now, so the guard asks for
     * all of them — a dialog a keyboard user can walk out of puts them on
     * controls they cannot see behind an overlay.
     *
     * `ScreenTimeLockModal` is the exception and always will be: see below.
     */
    if (file === 'ScreenTimeLockModal.tsx') return;
    expect(sourceOf(file), `${file} does not trap focus`).toContain('useModalA11y');
  });

  it.each(modalFiles)('%s says it is modal, unless it is the lock', file => {
    // Trapping focus without `aria-modal` is the inverse mistake: the trap works
    // but assistive technology is never told the rest of the page is inert, so
    // it still offers to read it.
    if (file === 'ScreenTimeLockModal.tsx') return;
    expect(sourceOf(file), `${file} traps focus without saying aria-modal`).toContain('aria-modal');
  });

  it('never dismisses the screen-time lock on Escape', () => {
    // A lock a child can press Escape out of is not a lock. It is the one modal
    // that must not gain the standard dismissal behaviour, and it takes no
    // close handler at all — recorded here so that a later sweep adding
    // `useModalA11y` everywhere does not quietly give it one.
    const source = sourceOf('ScreenTimeLockModal.tsx');
    expect(source).not.toContain('useModalA11y');
    expect(source).not.toMatch(/onClose/);
  });
});
