/**
 * The curriculum exports, read from disk.
 *
 * The four strands live in `data/curriculum/` in this repository rather than
 * being read from a sibling checkout of the donor engine. Content is content:
 * a build that cannot produce the questions it serves without another
 * repository present is not reproducible, and CI has no sibling checkout.
 */

import { readFileSync } from 'node:fs';
import path from 'node:path';

import type { SourceCurriculum, SourceHintPool } from './importCurriculum';

export interface StrandSource {
  /** Matches the `strand` field inside the file; asserted on load. */
  strand: string;
  curriculumFile: string;
  hintPoolFile: string;
}

/**
 * Load order is import order, and it is deliberate: foundations first so the
 * youngest learners' concepts take the lowest sort positions, then the strands
 * in the order a learner meets them.
 */
export const STRANDS: readonly StrandSource[] = [
  {
    strand: 'foundations',
    curriculumFile: 'foundations-curriculum.json',
    hintPoolFile: 'foundations-hint-pool.json',
  },
  {
    strand: 'fractions-to-algebra',
    curriculumFile: 'fractions-algebra-curriculum.json',
    hintPoolFile: 'fractions-algebra-hint-pool.json',
  },
  {
    strand: 'geometry',
    curriculumFile: 'geometry-curriculum.json',
    hintPoolFile: 'geometry-hint-pool.json',
  },
  {
    strand: 'algebra-1',
    curriculumFile: 'algebra-curriculum.json',
    hintPoolFile: 'algebra-hint-pool.json',
  },
];

export const CURRICULUM_DIR = path.resolve(import.meta.dirname, '../../data/curriculum');

function readJson<T>(file: string): T {
  return JSON.parse(readFileSync(path.join(CURRICULUM_DIR, file), 'utf-8')) as T;
}

/**
 * Reads one strand.
 *
 * The declared strand name is checked against the file's own. They are used as
 * a database value and as a filename respectively, and a mismatch would file a
 * strand's concepts under another strand's name — visible only much later, in a
 * dashboard grouping.
 */
export function loadStrand(source: StrandSource): { curriculum: SourceCurriculum; hints: SourceHintPool } {
  const curriculum = readJson<SourceCurriculum>(source.curriculumFile);
  if (curriculum.strand !== source.strand) {
    throw new Error(
      `${source.curriculumFile} declares strand "${curriculum.strand}" but is registered as "${source.strand}".`,
    );
  }
  return { curriculum, hints: readJson<SourceHintPool>(source.hintPoolFile) };
}

export function loadAllStrands() {
  return STRANDS.map(source => ({ source, ...loadStrand(source) }));
}
