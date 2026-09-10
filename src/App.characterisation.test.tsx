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

import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';

import { renderApp } from '../test/renderApp';

/**
 * The app seeds its state from `localStorage` and mirrors it back on every
 * change, so a test that does not clear it inherits the previous one's profile
 * selection and toggles.
 */
beforeEach(() => {
  window.localStorage.clear();
  window.sessionStorage.clear();

  // The app offers a placement quest 900ms after load, and it covers the page.
  // Suppressing it here is what makes these tests deterministic: waiting for a
  // timer that may or may not have fired yet is a race, and it made the
  // navigation tests fail roughly two runs in three.
  //
  // The prompt itself is characterised in its own test below, where the key is
  // deliberately left unset.
  window.sessionStorage.setItem(`dismissed_placement_prompt_${DEFAULT_PROFILE_ID}`, '1');
});

/** The profile the app selects when nothing has been stored. */
const DEFAULT_PROFILE_ID = 'user-maya';

const nav = () => screen.getByRole('navigation');

describe('the shell', () => {
  it('opens on the landing page', async () => {
    renderApp();
    expect(screen.getByRole('heading', { name: /welcome to acuitymath/i })).toBeInTheDocument();
  });

  it('survives an unreachable API', async () => {
    // jsdom resolves no relative URL, so every `/api/*` call rejects and the
    // app runs its offline fallback path on every one of these tests.
    renderApp();
    expect(nav()).toBeInTheDocument();
  });
});

describe('navigation', () => {
  it('moves to an unprotected tab when it is clicked', async () => {
    const user = userEvent.setup();
    renderApp();

    await user.click(within(nav()).getByRole('button', { name: /dashboard/i }));

    // Waited for rather than asserted immediately. The app is still resolving
    // its bootstrap request when the click lands, and the re-render that
    // follows can arrive after a synchronous assertion — which made this test
    // pass or fail depending on machine speed. A flaky test in a safety net is
    // worse than no test, because people learn to re-run it.
    await waitFor(() =>
      expect(screen.queryByRole('heading', { name: /welcome to acuitymath/i })).not.toBeInTheDocument(),
    );
  });

  it('tells assistive technology which tab is current', async () => {
    const user = userEvent.setup();
    renderApp();

    await user.click(within(nav()).getByRole('button', { name: /dashboard/i }));

    await waitFor(() =>
      expect(within(nav()).getByRole('button', { name: /dashboard/i })).toHaveAttribute(
        'aria-current',
        'page',
      ),
    );
  });

  it('marks exactly one destination as current', async () => {
    // Two would tell a screen-reader user they are in two places at once.
    const user = userEvent.setup();
    renderApp();

    await user.click(within(nav()).getByRole('button', { name: /dashboard/i }));

    await waitFor(() => {
      const marked = within(nav())
        .getAllByRole('button')
        .filter(button => button.getAttribute('aria-current') === 'page');
      expect(marked).toHaveLength(1);
    });
  });
});

describe('the placement quest prompt', () => {
  it('offers itself to a learner who has not been placed', async () => {
    // Found by running the app rather than by reading it. It appears 900ms
    // after load, covers the page, and is suppressed for the rest of the
    // session once dismissed.
    window.sessionStorage.clear();
    renderApp();

    const prompt = await screen.findByRole('dialog', { name: /placement quest/i }, { timeout: 4000 });
    expect(prompt).toBeInTheDocument();
    expect(within(prompt).getByRole('button', { name: /explore dashboard/i })).toBeInTheDocument();
  });

  it('stays away once dismissed for the session', async () => {
    const user = userEvent.setup();
    window.sessionStorage.clear();
    renderApp();

    const prompt = await screen.findByRole('dialog', { name: /placement quest/i }, { timeout: 4000 });
    await user.click(within(prompt).getByRole('button', { name: /explore dashboard/i }));

    await waitFor(() =>
      expect(screen.queryByRole('dialog', { name: /placement quest/i })).not.toBeInTheDocument(),
    );
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
    renderApp();

    await user.click(within(nav()).getByRole('button', { name: /parent analytics/i }));

    expect(await screen.findByText(/parent authorization required/i)).toBeInTheDocument();
  });

  it('gates the teacher surface the same way', async () => {
    const user = userEvent.setup();
    renderApp();

    await user.click(within(nav()).getByRole('button', { name: /^teacher/i }));
    expect(await screen.findByText(/educator pin required/i)).toBeInTheDocument();
  });

  it('announces the PIN prompt as a dialog, named and described', async () => {
    const user = userEvent.setup();
    renderApp();

    await user.click(within(nav()).getByRole('button', { name: /parent analytics/i }));

    const dialog = await screen.findByRole('dialog', { name: /parent authorization required/i });
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    expect(dialog).toHaveAccessibleName(/parent authorization required/i);
    expect(dialog).toHaveAccessibleDescription(/4-digit pin/i);
  });

  it('moves focus into the dialog and keeps it there', async () => {
    // Without a trap the keyboard walks out of the modal into the page behind,
    // where a user can operate controls they cannot see.
    const user = userEvent.setup();
    renderApp();

    await user.click(within(nav()).getByRole('button', { name: /parent analytics/i }));
    const dialog = await screen.findByRole('dialog', { name: /parent authorization required/i });

    expect(dialog.contains(document.activeElement)).toBe(true);

    // Tab all the way round; focus must still be inside.
    for (let i = 0; i < 25; i++) await user.tab();
    expect(dialog.contains(document.activeElement)).toBe(true);
  });

  it('closes on Escape', async () => {
    const user = userEvent.setup();
    renderApp();

    await user.click(within(nav()).getByRole('button', { name: /parent analytics/i }));
    await screen.findByRole('dialog', { name: /parent authorization required/i });

    await user.keyboard('{Escape}');

    // Queried by name, not by role alone: every modal in the app now declares
    // `role="dialog"`, so a bare role query can match a different one that
    // happens to be open and report a false pass.
    await waitFor(() =>
      expect(
        screen.queryByRole('dialog', { name: /parent authorization required/i }),
      ).not.toBeInTheDocument(),
    );
  });

  it('gates the district command centre', async () => {
    // It was not gated. Every campus's mean ability, its intervention flags and
    // a one-click CSV of the lot opened to whoever clicked. Demonstration data
    // today, which is exactly why the gap would have survived into a pilot.
    const user = userEvent.setup();
    renderApp();

    await user.click(within(nav()).getByRole('button', { name: /district hub/i }));

    expect(await screen.findByText(/district administrator pin required/i)).toBeInTheDocument();
  });

  it('asks for a different role on each gated surface', async () => {
    // A parent PIN must not open the district hub. The prompt names which
    // credential it wants, and the server checks the role alongside the PIN.
    const user = userEvent.setup();
    renderApp();

    await user.click(within(nav()).getByRole('button', { name: /parent analytics/i }));
    expect(await screen.findByText(/parent authorization required/i)).toBeInTheDocument();
    await user.keyboard('{Escape}');
    await waitFor(() =>
      expect(
        screen.queryByRole('dialog', { name: /parent authorization required/i }),
      ).not.toBeInTheDocument(),
    );

    await user.click(within(nav()).getByRole('button', { name: /district hub/i }));
    expect(await screen.findByText(/district administrator pin required/i)).toBeInTheDocument();
  });
});

describe('accessibility toggles', () => {
  /** The root element carries the theme classes the toggles switch. */
  const themedRoot = (container: HTMLElement) =>
    container.querySelector('[class*="min-h-screen"], [class*="bg-slate-50"], [class*="bg-black"]');

  it('applies a high-contrast ground when switched on', async () => {
    const user = userEvent.setup();
    const { container } = renderApp();

    expect(themedRoot(container)?.className).toContain('bg-slate-50');

    await user.click(screen.getByTitle(/toggle high contrast/i));

    expect(themedRoot(container)?.className).toContain('bg-black');
    expect(themedRoot(container)?.className).not.toContain('bg-slate-50');
  });

  it('applies the high-readability face when switched on', async () => {
    const user = userEvent.setup();
    const { container } = renderApp();

    expect(themedRoot(container)?.className).not.toContain('font-fredoka');

    await user.click(screen.getByTitle(/toggle high readability font/i));

    expect(themedRoot(container)?.className).toContain('font-fredoka');
  });

  it('switches back off', async () => {
    const user = userEvent.setup();
    const { container } = renderApp();
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
    renderApp();
    expect(window.localStorage.getItem('acuity_math_active_profile_id')).not.toBeNull();
  });

  it('remembers the profiles themselves', async () => {
    renderApp();
    const stored = window.localStorage.getItem('acuity_math_profiles');
    expect(stored).not.toBeNull();
    expect(JSON.parse(stored!).length).toBeGreaterThan(0);
  });

  it('does not remember which tab was open', async () => {
    // `activeTab` is deliberately not persisted: every visit starts on the
    // landing page. Recorded so the lift does not accidentally give it a home
    // on the server and change where a returning learner lands.
    const user = userEvent.setup();
    renderApp();

    await user.click(within(nav()).getByRole('button', { name: /dashboard/i }));

    const keys = Object.keys(window.localStorage);
    expect(keys.some(key => key.includes('tab') || key.includes('active_tab'))).toBe(false);
  });
});
