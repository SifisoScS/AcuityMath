// @vitest-environment node

/**
 * The layout, run over every picture in the corpus.
 *
 * 202 problems carry one, and 171 of those carry three more for their choices —
 * 715 pictures in all. None of them has ever been drawn. That is the reason for
 * checking all of them rather than a fixture: there is no accumulated evidence
 * that any of these frames is sane, because nothing has ever tried to use one.
 *
 * What a test can establish here is narrow and worth stating plainly. It can
 * show that the drawing stays inside its frame, that the number of glyphs
 * matches the number the problem is about, and that the properties the answer
 * keys depend on — spacing, length, offset — survive the layout. It cannot show
 * that the result looks like anything. Somebody has to open the app.
 */

import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  FIGURE_GAP,
  FRAME_PADDING,
  contentBox,
  extentOf,
  glyphCount,
  isPicture,
  layOut,
  type Drawable,
  type PictureSpec,
} from './figureLayout';
import { buildBaseline } from '../../../scripts/figure-baseline';

const CURRICULUM = path.resolve(__dirname, '../../../data/curriculum');

interface Problem {
  id: string;
  concept_id: string;
  visual?: { prompt?: PictureSpec; choices?: PictureSpec[] };
  verification?: Record<string, unknown>;
  choices?: string[];
  distractor_rationales?: Record<string, string>;
}

const problems: Problem[] = readdirSync(CURRICULUM)
  .filter(file => file.endsWith('-curriculum.json'))
  .flatMap(file => JSON.parse(readFileSync(path.join(CURRICULUM, file), 'utf8')).problems as Problem[]);

const withPictures = problems.filter(p => isPicture(p.visual?.prompt));

const everyPicture: Array<{ id: string; where: string; picture: PictureSpec }> =
  withPictures.flatMap(p => [
    { id: p.id, where: 'prompt', picture: p.visual!.prompt! },
    ...(p.visual!.choices ?? []).map((picture, index) => ({
      id: p.id,
      where: `choice ${index + 1}`,
      picture,
    })),
  ]);

const bounds = (drawable: Drawable) =>
  drawable.kind === 'glyph'
    ? { x1: drawable.x, y1: drawable.y, x2: drawable.x + drawable.size, y2: drawable.y + drawable.size }
    : {
        x1: drawable.x,
        y1: drawable.y,
        x2: drawable.x + drawable.length,
        y2: drawable.y + drawable.thickness,
      };

describe('the corpus this is drawing', () => {
  it('is all of it, not a sample', () => {
    /*
     * The positive control. Everything below iterates a list, and a list built
     * from a bad path or a renamed field is empty — at which point every
     * assertion passes and the layout is unverified. The counts are pinned so
     * that a silent empty run is impossible.
     */
    expect(problems.length).toBe(1154);
    expect(withPictures.length).toBe(202);
    expect(everyPicture.length).toBe(715);
  });

  it('draws only the shapes and layouts this knows', () => {
    /*
     * I reported this corpus as "two primitives" and it is three: a glyph run,
     * a bar, and a bare shape with neither `count` nor `length`. The evidence
     * was in front of me — `figure.count` on 463 figures and `figure.length` on
     * 120, out of 1,083 — and I did not notice that they do not sum. The 500
     * unaccounted figures are four whole concepts.
     */
    const figures = everyPicture.flatMap(({ picture }) => picture.figures);
    const runs = figures.filter(f => typeof f.count === 'number').length;
    const bars = figures.filter(f => typeof f.length === 'number').length;
    const bare = figures.filter(f => typeof f.count !== 'number' && typeof f.length !== 'number').length;
    expect(runs + bars + bare).toBe(figures.length);
    expect([runs, bars, bare]).toEqual([463, 120, 500]);

    const shapes = new Set(figures.map(f => f.shape));
    expect([...shapes].sort()).toEqual(['bar', 'circle', 'square', 'star']);

    const layouts = new Set(everyPicture.map(({ picture }) => picture.layout));
    expect([...layouts].sort()).toEqual(['row', 'stack']);
  });
});

describe('laying a picture out', () => {
  it('keeps every drawing inside its own frame', () => {
    /*
     * **The one that matters most.** An overflowing figure is clipped by the
     * SVG viewBox, so a child is shown *fewer* shapes than the problem is
     * about — which is indistinguishable, from where they sit, from a correct
     * picture of a smaller number. The answer key would be right and the
     * question unanswerable, which is exactly the defect F0e spent a PR on.
     */
    const escaping: string[] = [];

    for (const { id, where, picture } of everyPicture) {
      for (const drawable of layOut(picture)) {
        const box = bounds(drawable);
        if (
          box.x1 < -0.01 ||
          box.y1 < -0.01 ||
          box.x2 > picture.frame.width + 0.01 ||
          box.y2 > picture.frame.height + 0.01
        ) {
          escaping.push(
            `${id} ${where}: ${JSON.stringify(box)} outside ${picture.frame.width}x${picture.frame.height}`,
          );
        }
      }
    }

    expect(escaping.slice(0, 10)).toEqual([]);
  });

  it('draws exactly as many glyphs as the figures ask for', () => {
    /*
     * The count is the question. A layout that lost or gained one would be
     * wrong in the single way the whole early corpus is about, and the gate
     * cannot see it: the gate reads `figures[].count`, and this is about what
     * is drawn from it.
     *
     * **The first version of this compared `count ?? 0` against the glyphs
     * drawn, and passed while drawing nothing at all.** 500 figures carry no
     * `count` — a bare shape at a stated size — so it was comparing zero to
     * zero, four whole concepts rendered as empty boxes, and the test agreed.
     * `glyphCount` is the shared reading now, so the two sides cannot drift
     * apart again, and the assertion below is what makes the total non-trivial.
     */
    const wrong: string[] = [];
    let totalGlyphs = 0;

    for (const { id, where, picture } of everyPicture) {
      const asked = picture.figures
        .filter(f => f.shape !== 'bar')
        .reduce((total, f) => total + glyphCount(f), 0);
      const drawn = layOut(picture).filter(d => d.kind === 'glyph').length;
      totalGlyphs += drawn;
      if (asked !== drawn) wrong.push(`${id} ${where}: asked ${asked}, drew ${drawn}`);
    }

    expect(wrong).toEqual([]);
    // Zero equals zero, so the comparison above is only worth something if
    // something is actually being drawn. 2,236 glyphs and 120 bars, counted
    // from the JSON independently of this code rather than read back off it.
    expect(totalGlyphs).toBe(2_236);
    expect(
      everyPicture.reduce((n, { picture }) => n + layOut(picture).filter(d => d.kind === 'bar').length, 0),
    ).toBe(120);
  });

  it('draws something for every single picture', () => {
    /*
     * The blunt one, and the one that would have caught the blank concepts on
     * sight. `compare-size`, `odd-one-out`, `pattern-abab` and `match-identical`
     * are 80 problems whose figures are a bare `shape` and `size`; reading
     * `count` as zero rendered every one of them as an empty frame, and every
     * other assertion in this file passed.
     */
    const empty = everyPicture.filter(({ picture }) => layOut(picture).length === 0);
    expect(empty.map(e => `${e.id} ${e.where}`)).toEqual([]);
  });

  it('reproduces the frames the corpus authored', () => {
    /*
     * **The strongest evidence that the layout rule is the authored one.**
     *
     * Figures take equal slots sized to the largest, separated by 20, with 10
     * of padding each side. That reproduces 182 of the 202 prompt frames and
     * all 171 choice sets to the pixel — which is not something a guessed rule
     * does.
     *
     * The exceptions are pinned rather than waved past: every
     * `foundations-compare-length` prompt is authored a little wider than its
     * content needs. Both directions are asserted, because a frame that grew
     * *narrower* than the content would clip a stick and change which one looks
     * longest.
     */
    const prompts = withPictures.map(p => ({ id: p.id, picture: p.visual!.prompt! }));
    const exact: string[] = [];
    const generous: string[] = [];

    for (const { id, picture } of prompts) {
      const box = contentBox(picture);
      const width = box.width + 2 * FRAME_PADDING;
      const height = box.height + 2 * FRAME_PADDING;

      if (width === picture.frame.width && height === picture.frame.height) exact.push(id);
      else {
        expect(width, `${id} is wider than its frame`).toBeLessThanOrEqual(picture.frame.width);
        expect(height, `${id} is taller than its frame`).toBeLessThanOrEqual(picture.frame.height);
        generous.push(id);
      }
    }

    expect(exact).toHaveLength(182);
    expect(new Set(generous.map(id => id.replace(/-\d+$/, '')))).toEqual(
      new Set(['foundations-compare-length']),
    );

    for (const problem of withPictures) {
      const choices = problem.visual!.choices ?? [];
      if (choices.length === 0) continue;

      const widest = Math.max(...choices.map(c => contentBox(c).width)) + 2 * FRAME_PADDING;
      const tallest = Math.max(...choices.map(c => contentBox(c).height)) + 2 * FRAME_PADDING;
      for (const choice of choices) {
        expect([choice.frame.width, choice.frame.height], problem.id).toEqual([widest, tallest]);
      }
    }
  });

  it('honours spacing rather than spreading glyphs to fill the frame', () => {
    /*
     * `count-by-spread` is a card holding *fewer* shapes, spaced so that it
     * takes up more room than the correct one. A layout that distributed
     * glyphs evenly across the frame would erase the error the problem is
     * about while leaving every count correct — and nothing downstream would
     * notice, because the distractor's rationale is a string.
     */
    const run = { shape: 'circle' as const, size: 16, count: 4, spacing: 19 };
    const drawn = layOut({ layout: 'row', figures: [run], frame: { width: 141, height: 36 } });

    expect(drawn).toHaveLength(4);
    const xs = drawn.map(d => d.x);
    for (let i = 1; i < xs.length; i += 1) {
      expect(xs[i] - xs[i - 1]).toBe(16 + 19);
    }
  });

  it('left-aligns a stacked row so a teen reads as ten and some more', () => {
    // `[10, 4]` is fourteen. The four belongs under the start of the ten.
    const drawn = layOut({
      layout: 'stack',
      figures: [
        { shape: 'circle', size: 16, count: 10, spacing: 5 },
        { shape: 'circle', size: 16, count: 4, spacing: 5 },
      ],
      frame: { width: 225, height: 72 },
    });

    const rows = new Map<number, number[]>();
    for (const d of drawn) rows.set(d.y, [...(rows.get(d.y) ?? []), d.x]);
    const [first, second] = [...rows.values()];

    expect(first).toHaveLength(10);
    expect(second).toHaveLength(4);
    expect(Math.min(...second)).toBe(Math.min(...first));
  });

  it('centres a narrow picture in a frame built for a wider one', () => {
    /*
     * Candidate pictures share one frame sized to the largest, so most of them
     * are narrower than the box they sit in. Left-aligning them all would put
     * every drawing against the same edge and make the widest card visibly
     * different — which is the cue `count-by-spread` is supposed to punish, not
     * hand out.
     */
    const narrow = layOut({
      layout: 'row',
      figures: [{ shape: 'square', size: 16, count: 2, spacing: 5 }],
      frame: { width: 141, height: 36 },
    });

    const width = 2 * 16 + 5;
    expect(narrow[0].x).toBe((141 - width) / 2);
  });

  it('offsets a bar from the left of the box, not from its middle', () => {
    /*
     * `offset` exists so that sticks do not all start at the same place and a
     * child cannot judge length by the left edge. Centring would average the
     * offset away and make the misalignment it encodes meaningless.
     */
    const [flush, shifted] = layOut({
      layout: 'stack',
      figures: [
        { shape: 'bar', size: 72, length: 72, thickness: 8, offset: 0 },
        { shape: 'bar', size: 44, length: 44, thickness: 8, offset: 36 },
      ],
      frame: { width: 114, height: 114 },
    });

    expect(shifted.x - flush.x).toBe(36);
  });

  it('reproduces the frames the corpus authored, where they can be checked', () => {
    /*
     * Not a coincidence worth leaving unstated: a gap of 20 between figures is
     * what makes the authored widths come out exactly. `foundations-match-
     * numeral-to-5` draws four squares as two groups of two at spacing 9 —
     * 41 + 20 + 41 = 102 — inside a frame of 122, so the content sits with ten
     * pixels each side. If `FIGURE_GAP` were wrong, every multi-figure picture
     * would be off-centre and nothing else here would say so.
     */
    expect(FIGURE_GAP).toBe(20);

    const twoGroups: PictureSpec = {
      layout: 'row',
      figures: [
        { shape: 'square', size: 16, count: 2, spacing: 9 },
        { shape: 'square', size: 16, count: 2, spacing: 9 },
      ],
      frame: { width: 122, height: 36 },
    };
    expect(contentBox(twoGroups)).toEqual({ width: 102, height: 16 });
    expect(layOut(twoGroups)[0].x).toBe(10);
  });

  it('measures a figure by what the spec states', () => {
    expect(extentOf({ shape: 'circle', size: 16, count: 4, spacing: 5 })).toEqual({
      width: 4 * 16 + 3 * 5,
      height: 16,
    });
    expect(extentOf({ shape: 'bar', size: 44, length: 44, thickness: 8, offset: 36 })).toEqual({
      width: 80,
      height: 8,
    });
    // A run of one has no gaps to add, and must not subtract one.
    expect(extentOf({ shape: 'star', size: 16, count: 1, spacing: 9 })).toEqual({
      width: 16,
      height: 16,
    });
  });
});

describe('telling a corpus picture from the generator"s visual data', () => {
  it('recognises a picture', () => {
    expect(isPicture({ figures: [{ shape: 'circle', size: 16, count: 3 }], frame: { width: 1, height: 1 } })).toBe(true);
    expect(isPicture(problems.find(p => p.id === 'counting-to-20-01')!.visual!.prompt)).toBe(true);
  });

  it('refuses the generator"s shape, which reaches the same component', () => {
    // `MathManipulatives` is handed `visualData` for generated problems too, and
    // it looks nothing like this. Drawing a blank frame from one would replace a
    // working question with an empty box.
    expect(isPicture({ initialCount: 3, itemType: 'apple' })).toBe(false);
    expect(isPicture({ formula: '6 \\times 7 = ?' })).toBe(false);
    expect(isPicture({ figures: [], frame: { width: 10, height: 10 } })).toBe(false);
    expect(isPicture({ figures: [{ shape: 'circle' }] })).toBe(false);
    expect(isPicture(null)).toBe(false);
    expect(isPicture(undefined)).toBe(false);
  });
});

describe('the drawing that was reviewed', () => {
  /*
   * **The sheets are the baseline.** The only evidence that these pictures are
   * pictures came from rasterising them and looking; that happened once, and the
   * code did not stop moving afterwards. `reviewBaseline.json` holds the exact
   * drawables behind what was looked at, one problem from each of the ten
   * concepts that draw anything.
   *
   * This does not say the drawing is correct — a person said that. It says the
   * drawing has not changed since they said it, which is the half a test can
   * hold. Regenerate deliberately with `pnpm figures:baseline`; the diff is the
   * record of what moved and belongs in the pull request that moved it.
   */
  const baseline = JSON.parse(
    readFileSync(path.resolve(__dirname, 'reviewBaseline.json'), 'utf8'),
  ) as ReturnType<typeof buildBaseline>;

  it('covers every concept that draws anything', () => {
    const drawing = new Set(withPictures.map(p => p.concept_id));
    expect(new Set(baseline.map(entry => entry.conceptId))).toEqual(drawing);
    expect(baseline.reduce((n, entry) => n + entry.pictures.length, 0)).toBe(37);
  });

  it('still draws what it drew when somebody looked at it', () => {
    expect(buildBaseline()).toEqual(baseline);
  });
});
