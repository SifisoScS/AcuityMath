// @vitest-environment node

/**
 * No type outlives the screen that used it.
 *
 * ## Why this exists
 *
 * **Deleting a component does not make its types fail a build.** E1 removed
 * `DistrictAdminDashboard.tsx` — 1,353 lines of invented campuses — and its
 * shape stayed behind in `src/types.ts`, unreferenced and compiling cleanly, for
 * three further steps. E7 deleted two of those interfaces while looking for
 * something else, and left two more. One of them was `StandardAuditRecord`:
 * `lessonsAlignedCount`, `districtMasteryPercent`, `coverageStatus:
 * 'fully_covered' | 'deficiency_flag'` — the return type of the report E7 had
 * just finished proving **cannot be built**, because no authored concept carries
 * a standard code.
 *
 * That is the hazard. An orphaned type is not dead weight; it is a **design
 * somebody will implement**. The next person wiring up a district screen finds a
 * ready-made interface promising a CCSS coverage percentage and fills it in,
 * because the type says the number exists.
 *
 * Four interfaces were deleted by hand across two steps, the second time only
 * because somebody went looking. This makes a third time impossible.
 *
 * ## Why the detector is a separate module
 *
 * This file asserts the list of orphans is **empty**, and it is. Which means
 * every possible weakening of the detector is invisible from here: remove the
 * closure, widen the search, return `[]` unconditionally — the assertion passes
 * either way. A guard with no positive control is a claim.
 *
 * So `typeReachability.ts` holds the logic and is exercised below against
 * sources with known orphans in them, in both directions.
 */

import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { declarations, orphanedTypes } from './typeReachability';

const ROOT = path.resolve(__dirname, '..');
const TYPES_FILE = path.join(ROOT, 'src', 'types.ts');

/** Where a type could be used. Not `dist`, which is built from these. */
const SEARCH_DIRS = ['src', 'server'];
const SEARCH_EXTENSIONS = new Set(['.ts', '.tsx']);

function sourceFiles(dir: string): string[] {
  const found: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) {
      if (entry === 'node_modules' || entry === 'dist') continue;
      found.push(...sourceFiles(full));
      continue;
    }
    if (SEARCH_EXTENSIONS.has(path.extname(entry))) found.push(full);
  }
  return found;
}

describe('the detector itself', () => {
  /*
   * A miniature `types.ts`: one type used by the product, one used only by that
   * type, and one used by nobody. Every assertion in this block is about a
   * source small enough to check by eye.
   */
  const SOURCE = [
    'export interface Used {',
    '  visual: Visual;',
    '}',
    '',
    'export type Visual = "counters" | "shapes";',
    '',
    'export interface Orphan {',
    '  inventedNumber: number;',
    '}',
    '',
  ].join('\n');

  const ELSEWHERE = 'import type { Used } from "../types";\nconst x: Used = { visual: "counters" };';

  it('finds a type nothing refers to', () => {
    // The positive control. Without this, deleting the detector's body and
    // returning `[]` would pass every other assertion in this file.
    expect(orphanedTypes(SOURCE, ELSEWHERE)).toEqual(['Orphan']);
  });

  it('does not call a type dead because only another type uses it', () => {
    /*
     * **The mistake the first hand-sweep made.** `Visual` appears nowhere
     * outside the file; `Used` names it and is used everywhere. Reporting it as
     * an orphan would have led to a deletion that breaks the build — the
     * expensive direction to be wrong in.
     */
    expect(orphanedTypes(SOURCE, ELSEWHERE)).not.toContain('Visual');
  });

  it('follows the chain more than one link', () => {
    // Reachability, not "referenced by a root". A type three deep is as alive
    // as one directly named.
    const chained = [
      'export interface A { b: B; }',
      'export interface B { c: C; }',
      'export interface C { d: number; }',
      'export interface Far { e: number; }',
    ].join('\n');

    expect(orphanedTypes(chained, 'const a: A = null as never;')).toEqual(['Far']);
  });

  it('follows a chain declared in reverse order', () => {
    /*
     * **Found by mutation.** Capping the closure at a single pass was silent
     * against the forward-ordered chain above, because one sweep of the
     * declaration list happens to carry A→B→C when they appear in that order.
     * Declared backwards, one pass reaches B and stops, and C is reported dead
     * — a deletion that breaks the build.
     *
     * Reachability must not depend on the order somebody wrote the file in.
     */
    const reversed = [
      'export interface C { d: number; }',
      'export interface B { c: C; }',
      'export interface A { b: B; }',
    ].join('\n');

    expect(orphanedTypes(reversed, 'const a: A = null as never;')).toEqual([]);
  });

  it('does not treat a mention in a comment as a use', () => {
    /*
     * **Found by mutation, against this repository's own file.** Restoring a
     * deleted interface to `types.ts` went undetected, because the note
     * explaining the deletion names it — and that note lives inside the body of
     * the declaration above. Prose saying "X was here and is gone" is evidence
     * of the opposite of a reference.
     */
    const withProse = [
      '/** Once used by Orphan, which is gone. */',
      'export interface Used { a: number; }',
      '',
      '// Orphan is mentioned here and nowhere that matters.',
      'export interface Orphan { b: number; }',
    ].join('\n');

    expect(orphanedTypes(withProse, 'const u: Used = { a: 1 };')).toEqual(['Orphan']);
  });

  it('is not fooled by a name that merely contains another', () => {
    // `Used` must not be kept alive by a mention of `UsedElsewhere`, nor the
    // reverse. Word boundaries, not substring matching.
    const similar = ['export interface Used { a: number; }'].join('\n');
    expect(orphanedTypes(similar, 'type UsedElsewhere = 1;')).toEqual(['Used']);
  });

  it('reports orphans in a stable order', () => {
    const many = [
      'export interface Zeta { a: number; }',
      'export interface Alpha { a: number; }',
    ].join('\n');
    expect(orphanedTypes(many, '')).toEqual(['Alpha', 'Zeta']);
  });

  it('parses a flat list of exports', () => {
    expect(declarations(SOURCE).map(declaration => declaration.name)).toEqual([
      'Used',
      'Visual',
      'Orphan',
    ]);
  });
});

describe('every exported type in this repository is reachable', () => {
  const source = readFileSync(TYPES_FILE, 'utf8');
  const declared = declarations(source);

  const elsewhere = SEARCH_DIRS.flatMap(dir => sourceFiles(path.join(ROOT, dir)))
    .filter(file => path.resolve(file) !== path.resolve(TYPES_FILE))
    .map(file => readFileSync(file, 'utf8'))
    .join('\n');

  it('parses the file it is checking', () => {
    /*
     * If `types.ts` stops being a flat list of top-level exports, this goes red
     * rather than silently checking nothing — the same failure mode
     * `suiteInventory.test.ts` exists to prevent, one file over.
     */
    const names = declared.map(declaration => declaration.name);
    expect(names.length).toBeGreaterThan(10);
    expect(new Set(names).size).toBe(names.length);
  });

  it('finds no type that nothing anywhere refers to', () => {
    expect(
      orphanedTypes(source, elsewhere),
      'These types are referenced by nothing. Delete them — an orphaned type is ' +
        'a design somebody will implement, and the screen that would have used ' +
        'it is a promise nobody made.',
    ).toEqual([]);
  });

  it('keeps a type that only another type uses, in the real file', () => {
    /*
     * The closure asserted against the actual corpus rather than a fixture.
     * `MathProblem` is used across the product and names `VisualType` in its
     * body; `VisualType` appears nowhere else at all.
     */
    const mathProblem = declared.find(declaration => declaration.name === 'MathProblem');
    expect(mathProblem, 'MathProblem should still exist').toBeDefined();
    expect(/\bVisualType\b/.test(mathProblem!.body)).toBe(true);
    expect(/\bVisualType\b/.test(elsewhere)).toBe(false);
    expect(orphanedTypes(source, elsewhere)).not.toContain('VisualType');
  });
});
