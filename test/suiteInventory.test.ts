// @vitest-environment node
//
// Reads vitest's own configuration, which pulls in esbuild. Under jsdom that
// fails an internal invariant — esbuild checks that `new TextEncoder().encode('')`
// is a `Uint8Array`, and jsdom's realm gives it a different one. Nothing here
// needs a DOM.

/**
 * The suite is as large as it should be.
 *
 * ## Why this exists
 *
 * Three ways a test file can stop running. Only one of them is loud:
 *
 *   syntax error in a test file   vitest exits 1 — caught already
 *   file deleted or renamed       nothing notices; the count just shrinks
 *   file no longer matched by     nothing notices; the count just shrinks,
 *   `include` in vitest.config    and this is the quiet one
 *
 * The last was measured: removing `src/**` from the include patterns took the
 * run from 266 tests to 151 and **still exited 0**. A hundred and fifteen tests
 * disappeared and the build was green.
 *
 * So this file checks two things — that the files are still on disk, and that
 * the configuration still points at them. It is the same hazard the integration
 * suites guard against from the other side: they throw rather than skip when
 * `DATABASE_URL` is missing, because a suite that quietly covers nothing
 * reports success.
 *
 * ## Keeping it current
 *
 * `MINIMUM_TEST_FILES` is a floor, not an exact count, so adding tests never
 * requires editing this file. Removing a whole file deliberately does — which
 * is the point: it should take a decision, not a typo.
 */

import { readdirSync, statSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import vitestConfig from '../vitest.config';

/**
 * Raise this when a test file is added, never lower it without a reason in the
 * commit message.
 */
const MINIMUM_TEST_FILES = 14;

const ROOT = path.resolve(import.meta.dirname, '..');
const SEARCH_ROOTS = ['src', 'server', 'drizzle', 'scripts', 'test'];

function collectTestFiles(dir: string, found: string[] = []): string[] {
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return found; // a search root that does not exist yet
  }

  for (const entry of entries) {
    if (entry === 'node_modules' || entry.startsWith('.')) continue;
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) {
      collectTestFiles(full, found);
    } else if (/\.test\.tsx?$/.test(entry)) {
      found.push(path.relative(ROOT, full));
    }
  }
  return found;
}

const testFiles = SEARCH_ROOTS.flatMap(root => collectTestFiles(path.join(ROOT, root)));

describe('suite inventory', () => {
  it('collects at least every test file that existed when this was written', () => {
    // If this fails and no file was deliberately deleted, a test file has
    // stopped parsing and its tests are silently absent from the run.
    expect(
      testFiles.length,
      `Found ${testFiles.length} test files:\n  ${testFiles.join('\n  ')}`,
    ).toBeGreaterThanOrEqual(MINIMUM_TEST_FILES);
  });

  it('finds the suites that guard the riskiest work', () => {
    // Named individually because these four are the ones whose silent absence
    // would matter most: the content gate, the schema invariants, the
    // authorization boundary, and the front-end characterisation.
    const required = [
      'problemGenerator.test.ts',
      'schema.test.ts',
      'routers.integration.test.ts',
      'App.characterisation.test.tsx',
    ];

    for (const name of required) {
      expect(
        testFiles.some(file => file.endsWith(name)),
        `${name} is missing from the collected suite`,
      ).toBe(true);
    }
  });
});

/**
 * A glob to a regular expression, covering only the syntax these patterns use:
 * `**` across directories, `*` within a segment, and `{ts,tsx}` alternation.
 *
 * Written out rather than pulling in a matcher library: the patterns are five
 * lines in one file, and a dependency whose behaviour differs subtly from
 * vitest's own would make this guard lie in a new way.
 */
function globToRegExp(glob: string): RegExp {
  let out = '';
  for (let i = 0; i < glob.length; i++) {
    const char = glob[i];
    if (char === '*') {
      if (glob[i + 1] === '*') {
        // `**/` matches any number of directories, including none.
        out += glob[i + 2] === '/' ? '(?:.*/)?' : '.*';
        i += glob[i + 2] === '/' ? 2 : 1;
      } else {
        out += '[^/]*';
      }
    } else if (char === '{') {
      const close = glob.indexOf('}', i);
      out += `(?:${glob.slice(i + 1, close).split(',').join('|')})`;
      i = close;
    } else if (/[.+^$()|[\]\\]/.test(char)) {
      out += `\\${char}`;
    } else {
      out += char;
    }
  }
  return new RegExp(`^${out}$`);
}

describe('the configuration still points at the tests', () => {
  const include = (vitestConfig as { test?: { include?: string[] } }).test?.include ?? [];

  it('declares include patterns at all', () => {
    expect(include.length).toBeGreaterThan(0);
  });

  it.each(testFiles)('%s is matched by an include pattern', file => {
    // The quiet failure this whole file exists for: a test file that is present,
    // valid, and simply never run because the glob stopped reaching it.
    const posix = file.split(path.sep).join('/');
    const matched = include.some(pattern => globToRegExp(pattern).test(posix));
    expect(matched, `${posix} matches none of: ${include.join(', ')}`).toBe(true);
  });
});
