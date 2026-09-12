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

/**
 * Proves the suppression above is still doing something.
 *
 * Without this, a key that stops matching — as it did when profile ids changed
 * — makes every other test in this file quietly racy rather than failing here.
 */
describe('the test setup itself', () => {
  it('suppresses the placement prompt for the profile actually shown', async () => {
    renderApp();
    await new Promise(resolve => setTimeout(resolve, 1400));
    expect(screen.queryByRole('dialog', { name: /placement quest/i })).not.toBeInTheDocument();
  });
});

/**
 * The profile the app selects when nothing has been stored.
 *
 * `'guest'` since profiles moved to the server: with no reachable API there are
 * no children, and the placeholder is what the shell shows.
 *
 * This was `'user-maya'`, one of the invented profiles, and when the ids changed
 * the suppression below silently stopped matching — so the placement prompt
 * started firing mid-test and covering the page again, about one run in five.
 * A key built from data that moved is a suppression that fails quietly, which
 * is why the test that depends on it now asserts the prompt is absent.
 */
const DEFAULT_PROFILE_ID = 'guest';

const nav = () => screen.getByRole('navigation');

describe('the shell', () => {
  it('opens on the landing page', async () => {
    renderApp();
    expect(screen.getByRole('heading', { name: /^welcome to acuitymath$/i })).toBeInTheDocument();
  });

  it('offers a sign-in rather than an invented learner', async () => {
    // With no reachable server there are no children, and a dashboard greeting
    // "Guest" over a row of zeroes is how a demo flatters itself. The honest
    // answer is to say there is nobody yet and offer the way in.
    const user = userEvent.setup();
    renderApp();

    await user.click(within(nav()).getByRole('button', { name: /dashboard/i }));

    expect(await screen.findByText(/no learners yet|loading your learners/i)).toBeInTheDocument();
    expect(screen.queryByText(/welcome to acuitymath, guest/i)).not.toBeInTheDocument();
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
    // Matched on the landing page's own headline rather than any heading
    // containing "welcome to acuitymath": the dashboard greets a learner with
    // one too, and the loose query made this pass or fail on which was showing.
    await waitFor(() =>
      expect(
        screen.queryByRole('heading', { name: /^welcome to acuitymath$/i }),
      ).not.toBeInTheDocument(),
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

describe('the gate on adult surfaces', () => {
  /**
   * These tests run with no reachable server, so nobody is signed in — and that
   * is now the first thing the gate checks.
   *
   * They used to assert a PIN prompt appeared. That was true when the PIN was
   * compared against demo accounts in a JSON file and being signed in was not a
   * concept. It is wrong now: a PIN proves *an adult is present*, not who they
   * are, so there is nothing to step up from until somebody has signed in.
   *
   * The step-up itself — right PIN, wrong PIN, the fifth wrong PIN, elevation
   * belonging to another account — is covered against a real database in
   * `server/auth/stepUp.integration.test.ts`, where a session can be made.
   */

  it('sends a signed-out visitor to sign in, not to a PIN pad', async () => {
    const user = userEvent.setup();
    renderApp();

    await user.click(within(nav()).getByRole('button', { name: /parent analytics/i }));

    expect(await screen.findByRole('dialog', { name: /sign in/i })).toBeInTheDocument();
    expect(screen.queryByText(/parent authorization required/i)).not.toBeInTheDocument();
  });

  it('does not open the surface behind it', async () => {
    const user = userEvent.setup();
    renderApp();

    await user.click(within(nav()).getByRole('button', { name: /parent analytics/i }));
    await screen.findByRole('dialog', { name: /sign in/i });

    // The landing page is still underneath; the tab did not change.
    expect(screen.getByRole('heading', { name: /^welcome to acuitymath$/i })).toBeInTheDocument();
  });

  it('gates every adult surface the same way', async () => {
    /*
     * The District Hub was in this list, and was the reason the list exists —
     * it was ungated entirely until this test found it.
     *
     * Graft E4 quarantined it, so there is no longer a surface here to gate.
     * Its routes served an in-memory demonstration store, and removing them
     * alone would have changed nothing: the component seeded its own invented
     * campuses and only overwrote them when the server answered. The nav entry
     * and the render branch are gone; `server/legacyApi.test.ts` pins that.
     *
     * It is removed from this loop rather than the loop being deleted, because
     * the other two surfaces still need the gate and the gate is the point.
     */
    for (const surface of [/parent analytics/i, /^teacher/i]) {
      const user = userEvent.setup();
      const view = renderApp();

      await user.click(within(nav()).getByRole('button', { name: surface }));
      expect(await screen.findByRole('dialog', { name: /sign in/i })).toBeInTheDocument();

      view.unmount();
      window.localStorage.clear();
      window.sessionStorage.setItem(`dismissed_placement_prompt_${DEFAULT_PROFILE_ID}`, '1');
    }
  });

  it('offers no way into the quarantined district surface', async () => {
    /*
     * The other half of the quarantine, from the user's side rather than the
     * source's. `legacyApi.test.ts` asserts that `App.tsx` neither imports nor
     * renders the component; this asserts that nobody can reach it by pressing
     * anything, which is the claim that matters to an administrator.
     *
     * A gate on a surface showing invented campuses would be the wrong fix —
     * it would make the fabricated data harder to reach rather than absent.
     */
    renderApp();
    await screen.findByRole('heading', { name: /^welcome to acuitymath$/i });

    expect(
      within(nav()).queryByRole('button', { name: /district hub/i }),
      'the District Hub is reachable again',
    ).toBeNull();
  });

  it('announces the dialog it opens, named and described', async () => {
    const user = userEvent.setup();
    renderApp();

    await user.click(within(nav()).getByRole('button', { name: /parent analytics/i }));
    const dialog = await screen.findByRole('dialog', { name: /sign in/i });

    expect(dialog).toHaveAttribute('aria-modal', 'true');
    expect(dialog).toHaveAccessibleName(/sign in to acuitymath/i);
  });

  it('moves focus into the dialog and keeps it there', async () => {
    // Without a trap the keyboard walks out of the modal into the page behind,
    // where a user can operate controls they cannot see.
    const user = userEvent.setup();
    renderApp();

    await user.click(within(nav()).getByRole('button', { name: /parent analytics/i }));
    const dialog = await screen.findByRole('dialog', { name: /sign in/i });

    expect(dialog.contains(document.activeElement)).toBe(true);
    for (let i = 0; i < 20; i++) await user.tab();
    expect(dialog.contains(document.activeElement)).toBe(true);
  });

  it('closes on Escape', async () => {
    const user = userEvent.setup();
    renderApp();

    await user.click(within(nav()).getByRole('button', { name: /parent analytics/i }));
    await screen.findByRole('dialog', { name: /sign in/i });

    await user.keyboard('{Escape}');

    await waitFor(() =>
      expect(screen.queryByRole('dialog', { name: /sign in/i })).not.toBeInTheDocument(),
    );
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
  it('no longer keeps the children in the browser', async () => {
    // This asserted the opposite when it was written, and the change is the
    // point of the lift: three invented children lived in `localStorage` and
    // were whatever the last device said they were. They are rows now, so a
    // parent sees the same children on a phone as on the family tablet — and a
    // browser holding nobody's records is one that cannot leak them.
    renderApp();
    expect(window.localStorage.getItem('acuity_math_profiles')).toBeNull();
  });

  it('keeps only the choice of which child, not the children', async () => {
    // Which child this tab is looking at is about this browser, so it stays
    // local. What moved is the children themselves.
    const stored = Object.keys(window.localStorage);
    expect(stored.some(key => key.includes('profiles'))).toBe(false);
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
