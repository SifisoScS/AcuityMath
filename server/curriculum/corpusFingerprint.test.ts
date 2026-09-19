// @vitest-environment node

/**
 * Whether the database is serving the corpus that is on disk.
 *
 * The thing under test is a comparison, so the risk is that it compares
 * nothing. A fingerprint that never changes, or a `compareSeed` that answers
 * "current" for everything, passes every assertion about a healthy install —
 * and the defect this exists to catch is precisely an install that looks
 * healthy while serving content the repository no longer holds.
 *
 * So every case below is exercised in **both** directions.
 */

import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import {
  compareSeed,
  corpusFingerprint,
  corpusFiles,
  describeSeedState,
  digestOf,
} from './corpusFingerprint';
import { CURRICULUM_DIR, STRANDS } from './sources';

describe('the fingerprint', () => {
  it('covers every file the seed reads', () => {
    /*
     * Two per strand — the curriculum and its hint pool. A fingerprint that
     * covered only the curriculum files would call a database current after a
     * hint was rewritten, and hints are content a child reads.
     */
    const files = corpusFiles();
    expect(files).toHaveLength(STRANDS.length * 2);
    for (const source of STRANDS) {
      expect(files).toContain(source.curriculumFile);
      expect(files).toContain(source.hintPoolFile);
    }
  });

  it('is stable across calls', () => {
    // A fingerprint that moved on its own would make every database look stale
    // and teach everybody to ignore the warning.
    expect(corpusFingerprint()).toBe(corpusFingerprint());
  });

  it('looks like a sha256', () => {
    expect(corpusFingerprint()).toMatch(/^[0-9a-f]{64}$/);
  });

  describe('when the corpus changes', () => {
    const target = path.join(CURRICULUM_DIR, STRANDS[0].curriculumFile);
    let original: Buffer | null = null;

    afterEach(() => {
      if (original !== null) writeFileSync(target, original);
      original = null;
    });

    it('changes when a byte of any file changes', () => {
      /*
       * **The positive control, against the real corpus.** Without it, a
       * `corpusFingerprint` that returned a constant would satisfy "stable
       * across calls" and "looks like a sha256" perfectly, and would report
       * every stale database as current for ever.
       */
      const before = corpusFingerprint();
      original = readFileSync(target);

      writeFileSync(target, Buffer.concat([original, Buffer.from(' ')]));
      expect(corpusFingerprint()).not.toBe(before);

      writeFileSync(target, original);
      expect(corpusFingerprint()).toBe(before);
    });

    it('changes when a hint pool changes, not only a curriculum', () => {
      const before = corpusFingerprint();
      const hintFile = path.join(CURRICULUM_DIR, STRANDS[0].hintPoolFile);
      const hints = readFileSync(hintFile);

      try {
        writeFileSync(hintFile, Buffer.concat([hints, Buffer.from(' ')]));
        expect(corpusFingerprint()).not.toBe(before);
      } finally {
        writeFileSync(hintFile, hints);
      }
      expect(corpusFingerprint()).toBe(before);
    });
  });
});

describe('the digest, over entries a test can construct', () => {
  const entry = (name: string, text: string) => ({ name, bytes: Buffer.from(text) });

  it('tells two entries apart when only their names swap', () => {
    /*
     * **Found by mutation, and constructed because the corpus cannot show it.**
     * Dropping the name from the digest changed nothing detectable against
     * `data/curriculum`: entries are read in a fixed order and NUL-separated,
     * so differing contents already differ. The property the name actually
     * buys is this one, and it only appears when the bytes stay put.
     */
    const before = digestOf([entry('a.json', 'one'), entry('b.json', 'two')]);
    const after = digestOf([entry('b.json', 'one'), entry('a.json', 'two')]);
    expect(after).not.toBe(before);
  });

  it('does not let a name run into the bytes that follow it', () => {
    // Without a separator, ("ab", "c") and ("a", "bc") hash identically — the
    // classic concatenation ambiguity.
    expect(digestOf([entry('ab', 'c')])).not.toBe(digestOf([entry('a', 'bc')]));
  });

  it('is order-sensitive, because the seed reads in a fixed order', () => {
    const one = digestOf([entry('a', '1'), entry('b', '2')]);
    const two = digestOf([entry('b', '2'), entry('a', '1')]);
    expect(one).not.toBe(two);
  });

  it('is stable for identical input', () => {
    expect(digestOf([entry('a', '1')])).toBe(digestOf([entry('a', '1')]));
  });
});

describe('comparing a recorded fingerprint', () => {
  it('calls a matching one current', () => {
    const state = compareSeed(corpusFingerprint());
    expect(state.state).toBe('current');
  });

  it('calls a different one stale, and says both', () => {
    const state = compareSeed('0'.repeat(64));
    expect(state.state).toBe('stale');
    if (state.state !== 'stale') throw new Error('unreachable');
    expect(state.seeded).toBe('0'.repeat(64));
    expect(state.onDisk).toBe(corpusFingerprint());
  });

  it('separates "never seeded" from "stale"', () => {
    /*
     * **The distinction the whole design rests on.** CI sets `DATABASE_URL` for
     * the integration suites and never seeds, so never-seeded is its ordinary
     * state — failing on it would turn a content check into an infrastructure
     * requirement, and the usual outcome of that is somebody deleting the
     * check. A *stale* database cannot happen by accident of environment: it
     * was seeded, from a corpus that no longer exists.
     */
    expect(compareSeed(null).state).toBe('never-seeded');
    expect(compareSeed('0'.repeat(64)).state).toBe('stale');
  });
});

describe('what it tells somebody', () => {
  it('names the command that fixes a stale database', () => {
    // A warning that does not say what to do is one people learn to scroll past.
    expect(describeSeedState(compareSeed('0'.repeat(64)))).toContain('pnpm db:seed');
  });

  it('names the command for a database that was never seeded', () => {
    expect(describeSeedState(compareSeed(null))).toContain('pnpm db:seed');
  });

  it('says something different for each state', () => {
    const messages = new Set([
      describeSeedState(compareSeed(corpusFingerprint())),
      describeSeedState(compareSeed(null)),
      describeSeedState(compareSeed('0'.repeat(64))),
    ]);
    expect(messages.size).toBe(3);
  });

  it('shows enough of each fingerprint to tell them apart', () => {
    const message = describeSeedState(compareSeed('0'.repeat(64)));
    expect(message).toContain('000000000000');
    expect(message).toContain(corpusFingerprint().slice(0, 12));
  });
});
