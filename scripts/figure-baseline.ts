/**
 * Freeze what the renderer draws, so a change to it cannot go unnoticed.
 *
 *   pnpm figures:baseline        # rewrite the baseline
 *   pnpm test                    # fails if the drawing moved
 *
 * ## Why
 *
 * The geometry was reviewed by rasterising it and looking at the result — the
 * only way anyone has ever established that these pictures are pictures. That
 * review is a moment in time and the code is not. Without something holding it
 * down, the next change to the layout is checked against the same assertions
 * that once passed while four whole concepts rendered as empty boxes.
 *
 * So one picture from every concept that has any is written out as the exact
 * list of drawables it produces, and a test compares against it. It does not
 * say the drawing is *right* — the sheets and a person did that. It says the
 * drawing is **the same one that was looked at**, which is the part a test can
 * carry and a memory cannot.
 *
 * Regenerating is a deliberate act: `git diff` on the baseline is the record of
 * what moved, and it belongs in the pull request that moved it.
 */

import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';

import { isPicture, layOut, type PictureSpec } from '../src/components/figures/figureLayout';

const ROOT = path.resolve(import.meta.dirname, '..');
const CURRICULUM = path.join(ROOT, 'data', 'curriculum');
export const BASELINE_PATH = path.join(ROOT, 'src', 'components', 'figures', 'reviewBaseline.json');

interface Problem {
  id: string;
  concept_id: string;
  prompt: string;
  visual?: { prompt?: PictureSpec; choices?: PictureSpec[] };
}

export interface BaselineEntry {
  id: string;
  conceptId: string;
  prompt: string;
  pictures: Array<{
    where: string;
    frame: { width: number; height: number };
    drawables: ReturnType<typeof layOut>;
  }>;
}

/**
 * The first problem of every concept that draws anything.
 *
 * First rather than random: a baseline that changed which problems it covered
 * between runs would make its own diff unreadable, and the point of the file is
 * that a diff means something.
 */
export function buildBaseline(): BaselineEntry[] {
  const problems: Problem[] = readdirSync(CURRICULUM)
    .filter(file => file.endsWith('-curriculum.json'))
    .flatMap(file => JSON.parse(readFileSync(path.join(CURRICULUM, file), 'utf8')).problems as Problem[]);

  const seen = new Set<string>();
  const entries: BaselineEntry[] = [];

  for (const problem of problems) {
    if (!isPicture(problem.visual?.prompt) || seen.has(problem.concept_id)) continue;
    seen.add(problem.concept_id);

    entries.push({
      id: problem.id,
      conceptId: problem.concept_id,
      prompt: problem.prompt,
      pictures: [
        { where: 'prompt', frame: problem.visual!.prompt!.frame, drawables: layOut(problem.visual!.prompt!) },
        ...(problem.visual!.choices ?? []).map((picture, index) => ({
          where: `choice ${index + 1}`,
          frame: picture.frame,
          drawables: layOut(picture),
        })),
      ],
    });
  }

  return entries.sort((a, b) => a.conceptId.localeCompare(b.conceptId));
}

if (process.argv[1] && import.meta.url.endsWith(path.basename(process.argv[1]))) {
  const baseline = buildBaseline();
  writeFileSync(BASELINE_PATH, `${JSON.stringify(baseline, null, 2)}\n`, 'utf8');
  const pictures = baseline.reduce((n, entry) => n + entry.pictures.length, 0);
  console.log(`baseline: ${baseline.length} concepts, ${pictures} pictures`);
}
