// @vitest-environment node

/**
 * Every path these documents name exists.
 *
 * ## Why
 *
 * `ARCHITECTURE.md` §10 is a directory tour marked ✅ **Built**, and it had
 * drifted: no `server/lti/`, no `server/oneroster/`, no `test/`, after those
 * became a third of the server. A tour that omits a third of the code is a map
 * somebody will trust.
 *
 * It also **mislabelled a document**, and that one had consequences.
 * `GENERATOR_INTEGRITY.md` was listed as *"How authored answers are verified"*.
 * It is not — its own opening contrasts the generator with *"a hand-authored
 * bank of 500 problems [that] is read by a person at least once"*. The document
 * was right and the index pointing at it was wrong, and the README then
 * inherited the index's version and told readers for months that every authored
 * answer was checked by SymPy. Nothing was.
 *
 * ## What this can and cannot check
 *
 * It checks that a named path exists. It cannot check that the description
 * beside it is true — the mislabel above would have sailed through, because
 * `GENERATOR_INTEGRITY.md` is a real file.
 *
 * That is worth stating rather than leaving implied: this closes the cheapest
 * half of the problem, and prose still needs a reader. What it does buy is that
 * **a deleted or renamed file cannot sit in a tour unnoticed**, which is how the
 * drift started.
 */

import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

const ROOT = path.resolve(__dirname, '..');

/** Documents whose fenced trees name real files. */
const DOCUMENTS = ['ARCHITECTURE.md', 'README.md'];

/**
 * Paths pulled out of a directory-tour block.
 *
 * Only the tree fences are read, not prose: a sentence may reasonably mention a
 * file that once existed, while a tour is a claim about what is there now.
 */
function pathsInTours(markdown: string): string[] {
  const found = new Set<string>();

  for (const block of markdown.split('```').filter((_, index) => index % 2 === 1)) {
    if (!block.includes('├──') && !block.includes('└──')) continue;

    for (const line of block.split('\n')) {
      // The name sits between the tree glyphs and the `#` comment.
      const match = /[├└]──\s+([A-Za-z0-9_.\-/]+)/.exec(line);
      if (!match) continue;

      const name = match[1];
      // Directories are named with a trailing slash in these tours; files are
      // not. Both are checked, but only leaf names — a bare `trpc/routers.ts`
      // is relative to the section it sits under, which this cannot resolve.
      found.add(name);
    }
  }

  return [...found];
}

/**
 * Every file and directory in the repository, indexed once.
 *
 * A leaf name is matched against the *end* of a real path, because a tour names
 * `adaptiveEngine.ts` under a `services/` heading this cannot resolve. Guessing
 * a fixed list of parent directories was the first attempt and it was wrong
 * about exactly that — `src/services/` was two levels down, not one.
 */
function indexRepository(): Set<string> {
  const seen = new Set<string>();

  const walk = (dir: string, prefix: string) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (entry.name === 'node_modules' || entry.name === 'dist' || entry.name === '.git') {
        continue;
      }
      const relative = prefix ? `${prefix}/${entry.name}` : entry.name;
      seen.add(relative);
      if (entry.isDirectory()) walk(path.join(dir, entry.name), relative);
    }
  };

  walk(ROOT, '');
  return seen;
}

const REPOSITORY = indexRepository();

function existsSomewhere(name: string): boolean {
  const clean = name.replace(/\/$/, '');
  if (REPOSITORY.has(clean)) return true;
  for (const candidate of REPOSITORY) {
    if (candidate === clean || candidate.endsWith(`/${clean}`)) return true;
  }
  return false;
}

describe('the resolver itself', () => {
  /*
   * **The positive control.** Every assertion below about the real documents
   * passes if `existsSomewhere` simply returns true, and that is the state the
   * check will be in for ever once the tours are correct. A guard with no
   * positive control is a claim — E8's lesson, and it applies to a file that
   * reads documentation just as much as to one that reads types.
   */
  it('finds a file that exists', () => {
    expect(existsSomewhere('ARCHITECTURE.md')).toBe(true);
    expect(existsSomewhere('adaptiveEngine.ts')).toBe(true);
    expect(existsSomewhere('oneroster/')).toBe(true);
  });

  it('does not find one that does not', () => {
    expect(existsSomewhere('DistrictAdminDashboard.tsx')).toBe(false);
    expect(existsSomewhere('data_store.json')).toBe(false);
    expect(existsSomewhere('nothing-of-this-name.ts')).toBe(false);
  });

  it('does not match a name that merely ends the same way', () => {
    // `Engine.ts` must not be satisfied by `adaptiveEngine.ts`; the separator
    // is what makes the suffix match a path match rather than a string one.
    expect(existsSomewhere('Engine.ts')).toBe(false);
  });
});

describe('the paths these documents name', () => {
  for (const document of DOCUMENTS) {
    describe(document, () => {
      const markdown = readFileSync(path.join(ROOT, document), 'utf8');
      const paths = pathsInTours(markdown);

      it('has a directory tour worth checking', () => {
        /*
         * If the extraction ever stops finding anything — the fence style
         * changes, the glyphs change — this goes red rather than silently
         * checking nothing. The failure `suiteInventory` exists to prevent,
         * one document over.
         */
        expect(paths.length).toBeGreaterThan(10);
      });

      it('names nothing that does not exist', () => {
        const missing = paths.filter(name => !existsSomewhere(name)).sort();
        expect(
          missing,
          `${document} names paths that are not in the repository. Either the ` +
            'file moved and the tour did not, or the tour describes something ' +
            'that was never built.',
        ).toEqual([]);
      });
    });
  }
});
