/**
 * The app shell, rendered.
 *
 * Deliberately shallow. These are not tests of the landing page's copy — they
 * are the tripwire for the next graft, which lifts 35 pieces of state out of
 * `App.tsx` and onto a server. Every assertion here is something that must
 * still be true afterwards, so that a migration which breaks the shell says so
 * on the first run rather than on the first click.
 *
 * The offline case is the one that matters most: `apiService` currently falls
 * back to a local cache when the API is unreachable, and jsdom has no server,
 * so this file exercises that path on every run whether or not it means to.
 */

import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import App from './App';

describe('App shell', () => {
  it('renders without a reachable API', () => {
    // jsdom resolves no relative URL, so every `/api/*` call rejects. The app is
    // expected to degrade to its local cache, not to throw — the assertion is
    // that render() returned at all, plus a landmark to prove it got past the
    // first paint.
    render(<App />);
    expect(screen.getByRole('heading', { name: /welcome to acuitymath/i })).toBeInTheDocument();
  });

  it('offers all four developmental tiers', () => {
    // The tier structure is the product's spine and the thing most likely to be
    // disturbed by a schema that models age differently.
    render(<App />);
    const nav = screen.getByRole('navigation');
    for (const tier of ['Early Sprouts', 'Math Navigators', 'Algebra Voyagers', 'STEM Pioneers']) {
      expect(within(nav).getByRole('button', { name: new RegExp(tier, 'i') })).toBeInTheDocument();
    }
  });

  it('keeps the role-gated surfaces reachable from the nav', () => {
    // Parent, Teacher and District are the three views that Graft C puts behind
    // real authentication. They must still be present and named the same.
    render(<App />);
    const nav = screen.getByRole('navigation');
    for (const surface of ['Parent Analytics', 'Teacher', 'District Hub']) {
      expect(within(nav).getByRole('button', { name: new RegExp(surface, 'i') })).toBeInTheDocument();
    }
  });

  it('exposes exactly one primary navigation landmark', () => {
    // Two would mean a screen-reader user is offered the same list twice, and
    // it is the kind of thing a layout change introduces silently.
    render(<App />);
    expect(screen.getAllByRole('navigation')).toHaveLength(1);
  });
});
