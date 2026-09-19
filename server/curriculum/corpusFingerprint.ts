/**
 * Whether the database is serving the corpus that is on disk.
 *
 * ## The gap this closes
 *
 * `audit:corpus` reads `data/curriculum/*.json` and checks every answer in it.
 * It never looks at the database. So a database seeded from an older corpus
 * serves whatever it was seeded with, **and the gate stays green the whole
 * time** — the guarantee stops at the file.
 *
 * That is not hypothetical. F0b repaired twelve pictures in
 * `foundations-match-numeral-to-5`; running the app afterwards found the local
 * database still drawing two squares against an answer of four, because nobody
 * had re-seeded. A developer opening the app that day would have served a
 * four-year-old the exact defect the gate had just certified as fixed.
 *
 * It is the same shape as the writerless tables and the `verification` objects
 * nothing evaluated: **two representations of one truth, and nothing checking
 * they agree.**
 *
 * ## What is hashed
 *
 * Exactly the files the seed reads — every curriculum and hint-pool file named
 * in `STRANDS` — by their bytes, in a fixed order, with each file's name
 * included. Bytes rather than parsed content: a re-ordered key changes nothing
 * a child sees, but it also changes nothing about whether a re-seed is needed,
 * and a fingerprint that ignores edits it considers cosmetic is one that has to
 * be right about which edits are cosmetic.
 */

import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';

import { CURRICULUM_DIR, STRANDS } from './sources';

/** Every file the seed reads, in the order it reads them. */
export function corpusFiles(): string[] {
  return STRANDS.flatMap(source => [source.curriculumFile, source.hintPoolFile]);
}

export interface CorpusEntry {
  name: string;
  bytes: Buffer;
}

/**
 * The digest itself, over named byte blobs.
 *
 * **Separate from reading the files so the naming can be tested at all.** The
 * file name goes into the digest alongside its bytes, and mutation showed that
 * removing it changes nothing detectable against the real corpus: the entries
 * are read in a fixed order and separated by NUL, so differing contents already
 * differ. The case the name covers — two entries keeping their bytes and
 * swapping their names — cannot be constructed from `data/curriculum` without
 * inventing a scenario that does not occur there.
 *
 * It is kept rather than deleted, because a fingerprint that ignores which file
 * a blob came from is a fingerprint that will be wrong the first time the file
 * list becomes dynamic. Taking `entries` as an argument is what lets a test
 * construct that swap directly, which is the same reasoning that pulled
 * `tablesLeftBehind` out of `deleteLearner` in E3: an unreachable guard with no
 * test is a claim rather than a defence.
 */
export function digestOf(entries: readonly CorpusEntry[]): string {
  const digest = createHash('sha256');

  for (const entry of entries) {
    digest.update(entry.name);
    digest.update('\0');
    digest.update(entry.bytes);
    digest.update('\0');
  }

  return digest.digest('hex');
}

/** A hash of the corpus on disk. */
export function corpusFingerprint(): string {
  return digestOf(
    corpusFiles().map(file => ({
      name: file,
      bytes: readFileSync(path.join(CURRICULUM_DIR, file)),
    })),
  );
}

export type SeedState =
  | { state: 'current'; fingerprint: string }
  | { state: 'stale'; seeded: string; onDisk: string }
  | { state: 'never-seeded'; onDisk: string }
  /**
   * The database could not be asked.
   *
   * Its own answer, and **never reported as OK**. CI's base database has no
   * schema at all — `test:integration` creates a database per suite and never
   * migrates the one named in `DATABASE_URL` — so the first version of this
   * check crashed there on a missing table. Crashing is the worst outcome; the
   * second worst is printing "OK" for a question nobody answered.
   */
  | { state: 'unknown'; reason: string };

/**
 * How a recorded fingerprint compares to the corpus on disk.
 *
 * `never-seeded` is deliberately its own answer rather than a kind of stale.
 * An empty database is an install nobody has finished; a *stale* one is an
 * install that is quietly serving the wrong content. The first needs
 * `pnpm db:seed` and the second needs somebody to understand why it drifted.
 */
export function compareSeed(
  recorded: { fingerprint: string | null } | { unavailable: string },
): SeedState {
  const onDisk = corpusFingerprint();

  if ('unavailable' in recorded) return { state: 'unknown', reason: recorded.unavailable };
  if (recorded.fingerprint === null) return { state: 'never-seeded', onDisk };
  if (recorded.fingerprint === onDisk) return { state: 'current', fingerprint: onDisk };
  return { state: 'stale', seeded: recorded.fingerprint, onDisk };
}

/** What to tell somebody, in the words of the thing they have to do about it. */
export function describeSeedState(state: SeedState): string {
  switch (state.state) {
    case 'current':
      return 'The database is serving the corpus that is on disk.';
    case 'never-seeded':
      return (
        'This database has no record of being seeded. Run `pnpm db:seed` — ' +
        'until then it is serving whatever content it happens to contain.'
      );
    case 'unknown':
      return `Could not check whether this database is current: ${state.reason}`;
    case 'stale':
      return (
        'The corpus on disk has changed since this database was seeded, so it is ' +
        'serving content that no longer exists in the repository. Run ' +
        `\`pnpm db:seed\`. (seeded ${state.seeded.slice(0, 12)}…, on disk ${state.onDisk.slice(0, 12)}…)`
      );
  }
}
