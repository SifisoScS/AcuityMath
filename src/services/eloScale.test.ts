// @vitest-environment node

/**
 * One mapping from ability to rating, and only one.
 *
 * Before this, there were four: the specification said `1000 + 250θ`,
 * `adaptiveEngine` computed `1200 + 300θ` in two places, `adaptiveWorker`
 * computed it again independently, and `ProfileSwitchModal` seeded a rating
 * from a child's *age*. Nothing connected them, so nothing noticed.
 *
 * The arithmetic below is the easy half. The last test is the one that keeps
 * this from happening again.
 */

import { readdirSync, readFileSync } from 'fs';
import { join } from 'path';
import { describe, expect, it } from 'vitest';

import {
  ELO_AT_BENCHMARK,
  ELO_MAX,
  ELO_MIN,
  ELO_PER_THETA,
  ELO_UNMEASURED,
  eloForTheta,
} from './eloScale';

describe('the ability-to-rating scale', () => {
  it('matches the anchors in ARCHITECTURE.md §4', () => {
    // The three the document states, which are the ones a teacher was told.
    expect(eloForTheta(-2)).toBe(500);
    expect(eloForTheta(0)).toBe(1000);
    expect(eloForTheta(2)).toBe(1500);
  });

  it('puts an unmeasured learner at the benchmark', () => {
    // Not at a number inferred from their age. The Placement Quest moves this.
    expect(ELO_UNMEASURED).toBe(ELO_AT_BENCHMARK);
    expect(ELO_UNMEASURED).toBe(1000);
  });

  it('clamps to the range ability is reported within', () => {
    expect(eloForTheta(-99)).toBe(ELO_MIN);
    expect(eloForTheta(99)).toBe(ELO_MAX);
    expect(ELO_MIN).toBe(250);
    expect(ELO_MAX).toBe(1750);
  });

  it('derives its bounds rather than asserting them', () => {
    /*
     * Both old comments about the range were wrong: one said "-3 -> 700" beside
     * a formula producing 300, and the interface said "Scaled 600 to 2400" when
     * nothing could reach either end. Bounds computed from the formula cannot
     * drift from it.
     */
    expect(ELO_MIN).toBe(ELO_AT_BENCHMARK - 3 * ELO_PER_THETA);
    expect(ELO_MAX).toBe(ELO_AT_BENCHMARK + 3 * ELO_PER_THETA);
  });

  it('rounds, because the measurement is not that precise', () => {
    // SEM rarely falls below 0.18, which is 45 rating points wide. Decimals
    // would invite a child to read precision that is not there.
    expect(Number.isInteger(eloForTheta(0.137))).toBe(true);
  });

  it('is the only place the mapping exists', () => {
    /*
     * **The test that matters.**
     *
     * Four copies of this arithmetic disagreed for months because nothing tied
     * them together. Anyone who writes `theta * 250` or `1000 +` somewhere else
     * has made a fifth, and the cheapest way to make this pass is to import the
     * function.
     *
     * Matched on the *arithmetic*, not on the constant: `1000` appears
     * legitimately in plenty of places, and banning the number would be an
     * assertion about a digit standing in for one about a formula.
     */
    const root = process.cwd();
    const scan = (dir: string, found: string[] = []): string[] => {
      for (const entry of readdirSync(join(root, dir), { withFileTypes: true })) {
        const rel = `${dir}/${entry.name}`;
        if (entry.isDirectory()) {
          if (!/node_modules|dist/.test(entry.name)) scan(rel, found);
        } else if (/\.tsx?$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name)) {
          found.push(rel);
        }
      }
      return found;
    };

    /*
     * No `\b` before `theta`, and case-insensitive. The first version of this
     * regex required a word boundary and so missed `newTheta * 300` — the exact
     * line it was written to catch. It passed green against a file still
     * carrying the duplicate, which is why no guard here ships without being
     * mutated first.
     */
    const mapping = /theta\s*\*\s*\d|\d+\s*\*\s*\w*theta|ELO_PER_THETA\s*\*/i;
    const offenders = [...scan('src'), ...scan('server')].filter(file => {
      if (file.endsWith('services/eloScale.ts')) return false;
      const body = readFileSync(join(root, file), 'utf-8');
      // Only lines that compute a *rating* from theta, not the dynamic level.
      return body
        .split('\n')
        .some(line => mapping.test(line) && /elo/i.test(line));
    });

    expect(
      offenders,
      'the ability-to-rating mapping has been copied; import eloForTheta instead',
    ).toEqual([]);
  });
});
