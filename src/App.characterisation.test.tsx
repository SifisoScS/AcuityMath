/**
 * What the app does today, pinned before it is changed.
 *
 * These are characterisation tests, not specifications. They do not argue that
 * the behaviour below is right — several parts of it are the very things the
 * migration exists to replace. They record what a user experiences *now*, so
 * that lifting 33 pieces of state out of `App.tsx` and onto the server can be
 * shown not to have altered it.
 *
 * They were written before the refactor rather than after each slice, because a
 * test written after a change describes the change rather than guarding it. The
 * repository has 199 tests and four of them touch the front end; this is the
 * safety net that did not exist.
 *
 * When a slice deliberately changes one of these behaviours, the test should
 * change in the same commit, with the reason.
 */

import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';

import App from './App';

/**
 * The app seeds its state from `localStorage` and mirrors it back on every
 * change, so a test that does not clear it inherits the previous one's profile
 * selection and toggles.
 */
beforeEach(() => {
  window.localStorage.clear();
});

const nav = () => screen.getByRole('navigation');

describe('the shell', () => {
  it('opens on the landing page', async () => {
    render(<App />);
    expect(screen.getByRole('heading', { name: /welcome to acuitymath/i })).toBeInTheDocument();
  });

  it('survives an unreachable API', async () => {
    // jsdom resolves no relative URL, so every `/api/*` call rejects and the
    // app runs its offline fallback path on every one of these tests.
    render(<App />);
    expect(nav()).toBeInTheDocument();
  });
});

describe('navigation', () => {
  it('moves to an unprotected tab when it is clicked', async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(within(nav()).getByRole('button', { name: /dashboard/i }));

    // The landing headline is replaced by the dashboard.
    expect(screen.queryByRole('heading', { name: /welcome to acuitymath/i })).not.toBeInTheDocument();
  });

  it('does not tell assistive technology which tab is current', async () => {
    // A finding, recorded rather than fixed here: the navigation sets no
    // `aria-current`, so a screen-reader user is never told where they are.
    // Fixing it is accessibility work rather than state migration, and doing it
    // inside this refactor would blur what the refactor changed. The assertion
    // is inverted deliberately — when it is fixed, this test fails and is
    // rewritten as the positive one it wants to be.
    const user = userEvent.setup();
    render(<App />);

    await user.click(within(nav()).getByRole('button', { name: /dashboard/i }));

    const marked = within(nav())
      .getAllByRole('button')
      .filter(button => button.getAttribute('aria-current'));
    expect(marked).toHaveLength(0);
  });
});

describe('the PIN gate on adult surfaces', () => {
  it('asks for a PIN instead of opening the parent dashboard', async () => {
    // `handleNavigate` intercepts `parent` and `teacher` when the role has not
    // been authenticated and opens the PIN prompt instead of switching tabs.
    //
    // Asserted on the visible heading rather than `role="dialog"`, because the
    // modal is a plain `div` with no dialog semantics and no focus trap — a
    // second finding, recorded in the same spirit as the one above.
    const user = userEvent.setup();
    render(<App />);

    await user.click(within(nav()).getByRole('button', { name: /parent analytics/i }));

    expect(await screen.findByText(/parent authorization required/i)).toBeInTheDocument();
  });

  it('gates the teacher surface the same way', async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(within(nav()).getByRole('button', { name: /^teacher/i }));
    expect(await screen.findByText(/educator pin required/i)).toBeInTheDocument();
  });

  it('has no dialog semantics on the PIN prompt', async () => {
    // The inverted form again: the prompt is a `div`, so a screen reader does
    // not announce it and focus stays behind it. When it becomes a real dialog
    // this fails, and should be rewritten to assert the role.
    const user = userEvent.setup();
    render(<App />);

    await user.click(within(nav()).getByRole('button', { name: /parent analytics/i }));
    await screen.findByText(/parent authorization required/i);

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('leaves the district surface ungated', async () => {
    // Recorded because it is surprising: `handleNavigate` guards only `parent`
    // and `teacher`, so the district command centre — multi-campus analytics
    // and CSV export of every learner's scores — opens to anyone who clicks it.
    // Current behaviour, and this test exists to notice when it changes.
    const user = userEvent.setup();
    render(<App />);

    await user.click(within(nav()).getByRole('button', { name: /district hub/i }));

    expect(screen.queryByText(/parent authorization required/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/educator pin required/i)).not.toBeInTheDocument();
  });
});

describe('accessibility toggles', () => {
  /** The root element carries the theme classes the toggles switch. */
  const themedRoot = (container: HTMLElement) =>
    container.querySelector('[class*="min-h-screen"], [class*="bg-slate-50"], [class*="bg-black"]');

  it('applies a high-contrast ground when switched on', async () => {
    const user = userEvent.setup();
    const { container } = render(<App />);

    expect(themedRoot(container)?.className).toContain('bg-slate-50');

    await user.click(screen.getByTitle(/toggle high contrast/i));

    expect(themedRoot(container)?.className).toContain('bg-black');
    expect(themedRoot(container)?.className).not.toContain('bg-slate-50');
  });

  it('applies the high-readability face when switched on', async () => {
    const user = userEvent.setup();
    const { container } = render(<App />);

    expect(themedRoot(container)?.className).not.toContain('font-fredoka');

    await user.click(screen.getByTitle(/toggle high readability font/i));

    expect(themedRoot(container)?.className).toContain('font-fredoka');
  });

  it('switches back off', async () => {
    const user = userEvent.setup();
    const { container } = render(<App />);
    const toggle = screen.getByTitle(/toggle high contrast/i);

    await user.click(toggle);
    await user.click(toggle);

    expect(themedRoot(container)?.className).toContain('bg-slate-50');
  });
});

describe('state that outlives a reload', () => {
  it('remembers the chosen profile', async () => {
    // Today this is `localStorage`. After the lift it is the server, and this
    // test should still pass — that is its purpose.
    render(<App />);
    expect(window.localStorage.getItem('acuity_math_active_profile_id')).not.toBeNull();
  });

  it('remembers the profiles themselves', async () => {
    render(<App />);
    const stored = window.localStorage.getItem('acuity_math_profiles');
    expect(stored).not.toBeNull();
    expect(JSON.parse(stored!).length).toBeGreaterThan(0);
  });

  it('does not remember which tab was open', async () => {
    // `activeTab` is deliberately not persisted: every visit starts on the
    // landing page. Recorded so the lift does not accidentally give it a home
    // on the server and change where a returning learner lands.
    const user = userEvent.setup();
    render(<App />);

    await user.click(within(nav()).getByRole('button', { name: /dashboard/i }));

    const keys = Object.keys(window.localStorage);
    expect(keys.some(key => key.includes('tab') || key.includes('active_tab'))).toBe(false);
  });
});
