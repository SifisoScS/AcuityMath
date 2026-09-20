/**
 * Turning a corpus picture into things to draw.
 *
 * ## What this is for
 *
 * `data/curriculum/*.json` describes 202 pictures — every authored problem for
 * ages three to seven — as `figures` inside a `frame`. Until now nothing read
 * them. `InfiniteAdaptiveModal` passed the object to `MathManipulatives`, which
 * looks for `visualData.initialCount`, `.itemType` and `.shapeType`, finds none
 * of them, and falls through to a card that prints the prompt text back under
 * the heading *Math Expression*. A child was shown a sentence, the same
 * sentence again in monospace, and three buttons reading *the first one*, *the
 * middle one*, *the last one*.
 *
 * So this is the first code to read the schema the corpus gate has been
 * verifying since F0. It is deliberately **pure and DOM-free**: the geometry is
 * the part that can be wrong in ways nobody would see, so it is separated from
 * the SVG in order to be checked against all 202 pictures at once.
 *
 * ## The rule
 *
 * **Every dimension the spec states is honoured; only the gaps are derived.**
 *
 * That split matters more than it looks. `spacing` is not decoration — the
 * `count-by-spread` distractor is a card holding *fewer* shapes spaced so that
 * it takes up more room, and a renderer that spaced glyphs evenly to fill its
 * frame would quietly delete the error the problem is about. Same for a bar's
 * `offset`, which exists to break left-edge alignment so that a child cannot
 * compare lengths by where the sticks start.
 *
 * Gaps *between* figures are not stated anywhere, so they are derived: 20px,
 * which is what reproduces the corpus's own frames where they can be checked.
 * A row of `[2, 2]` squares at spacing 9 measures 41 + 20 + 41 = 102 inside a
 * frame of 122, which is the authored width exactly.
 *
 * ## Why the content is centred and the figures are not
 *
 * A problem's three candidate pictures share one frame, sized to the largest —
 * a corpus-wide invariant with no exceptions, because a card sized to its own
 * contents lets a child answer *how many* by picking the widest box. So a
 * narrow picture must sit somewhere inside a frame built for a wider one, and
 * it is centred.
 *
 * Inside that box the figures are **left-aligned**, not centred, and the reason
 * is the teen numbers. Fourteen is drawn `[10, 4]`: a full row of ten and a
 * remainder. Left-aligned, the four sits under the first four of the ten and
 * reads as *ten and four more*. Centred, it floats in the middle and reads as
 * a second, unrelated group.
 */

export type GlyphShape = 'circle' | 'square' | 'star';

export interface FigureSpec {
  shape: GlyphShape | 'bar';
  size: number;
  /**
   * Glyph runs: how many, and how far apart.
   *
   * **`count` is optional and defaults to one.** 500 of the corpus's 1,083
   * figures carry neither `count` nor `length` — they are a single shape at a
   * stated size, which is how `compare-size`, `odd-one-out`, `pattern-abab` and
   * `match-identical` are drawn. The first version of this file read them as a
   * run of zero glyphs and rendered four whole concepts as empty boxes.
   */
  count?: number;
  spacing?: number;
  /** Bars: how long, how thick, and how far from the left edge. */
  length?: number;
  thickness?: number;
  offset?: number;
}

export interface PictureSpec {
  version?: number;
  layout?: 'row' | 'stack';
  label?: string;
  figures: FigureSpec[];
  frame: { width: number; height: number };
}

export type Drawable =
  | { kind: 'glyph'; shape: GlyphShape; x: number; y: number; size: number }
  | { kind: 'bar'; x: number; y: number; length: number; thickness: number };

/** Space between two figures. Derived, not authored — see the note above. */
export const FIGURE_GAP = 20;

/** Space between the content and each edge of the frame. Derived the same way. */
export const FRAME_PADDING = 10;

const isBar = (figure: FigureSpec): boolean =>
  figure.shape === 'bar' || typeof figure.length === 'number';

/** How much room one figure needs, in its own right. */
export function extentOf(figure: FigureSpec): { width: number; height: number } {
  if (isBar(figure)) {
    return {
      width: (figure.offset ?? 0) + (figure.length ?? figure.size),
      height: figure.thickness ?? figure.size,
    };
  }

  const count = glyphCount(figure);
  const spacing = figure.spacing ?? 0;
  return {
    // `Math.max(count - 1, 0)` rather than `count - 1`: a figure with no glyphs
    // would otherwise claim negative width and pull the box in around it.
    width: count * figure.size + Math.max(count - 1, 0) * spacing,
    height: figure.size,
  };
}

/** How many glyphs a figure draws. Absent means one, not none. */
export function glyphCount(figure: FigureSpec): number {
  return figure.count ?? 1;
}

/**
 * The box the figures occupy together, before it is placed in the frame.
 *
 * ## Equal slots, sized to the largest
 *
 * Figures do not sit shoulder to shoulder. Each takes a slot as large as the
 * biggest figure in the picture, and sits centred in it — so `compare-size`'s
 * circle of 90, square of 50 and star of 28 are evenly spaced rather than
 * bunched, and `odd-one-out`'s small circle stays in line with the large ones
 * instead of closing the gap around itself.
 *
 * This is not a guess. It reproduces **182 of the 202 authored prompt frames
 * and all 171 choice sets exactly**, at a gap of 20 and a padding of 10 each
 * side. The twenty it does not are every `foundations-compare-length` prompt,
 * each authored between 3 and 15 pixels *wider* than the content needs — never
 * narrower, so the drawing always fits. The frame on disk is authoritative
 * either way; this is what positions figures inside it.
 */
export function contentBox(picture: PictureSpec): { width: number; height: number } {
  const extents = picture.figures.map(extentOf);
  if (extents.length === 0) return { width: 0, height: 0 };

  const gaps = FIGURE_GAP * (extents.length - 1);
  const slotWidth = Math.max(...extents.map(e => e.width));
  const slotHeight = Math.max(...extents.map(e => e.height));

  return picture.layout === 'stack'
    ? { width: slotWidth, height: extents.length * slotHeight + gaps }
    : { width: extents.length * slotWidth + gaps, height: slotHeight };
}

/**
 * Everything to draw, in frame coordinates.
 *
 * A glyph run becomes one drawable per glyph rather than a single run object,
 * because the count is the thing a child is asked about: if the layout and the
 * drawing can disagree about how many circles there are, they eventually will.
 * One glyph, one drawable, and a test can count them.
 */
export function layOut(picture: PictureSpec): Drawable[] {
  const box = contentBox(picture);
  const left = (picture.frame.width - box.width) / 2;
  const top = (picture.frame.height - box.height) / 2;

  const extents = picture.figures.map(extentOf);
  const slotWidth = Math.max(...extents.map(e => e.width));
  const slotHeight = Math.max(...extents.map(e => e.height));
  const stacked = picture.layout === 'stack';

  const drawables: Drawable[] = [];

  picture.figures.forEach((figure, slot) => {
    const extent = extents[slot];

    /*
     * Along the grain of the layout the slot advances; across it the figure is
     * centred — except horizontally in a stack, where figures are left-aligned.
     *
     * That exception is the teen numbers. Fourteen is `[10, 4]`, and the four
     * belongs under the start of the ten so it reads as *ten and four more*.
     * Centred, it floats in the middle and reads as a separate group. Bars are
     * left-aligned for the same structural reason and then shifted by their own
     * `offset`, which exists precisely to break that alignment where the
     * problem wants it broken.
     */
    const slotLeft = stacked ? left : left + slot * (slotWidth + FIGURE_GAP);
    const slotTop = stacked ? top + slot * (slotHeight + FIGURE_GAP) : top;

    const x = stacked ? slotLeft : slotLeft + (slotWidth - extent.width) / 2;
    const y = slotTop + (slotHeight - extent.height) / 2;

    if (isBar(figure)) {
      drawables.push({
        kind: 'bar',
        x: x + (figure.offset ?? 0),
        y,
        length: figure.length ?? figure.size,
        thickness: figure.thickness ?? figure.size,
      });
      return;
    }

    const spacing = figure.spacing ?? 0;
    for (let index = 0; index < glyphCount(figure); index += 1) {
      drawables.push({
        kind: 'glyph',
        shape: figure.shape as GlyphShape,
        x: x + index * (figure.size + spacing),
        y,
        size: figure.size,
      });
    }
  });

  return drawables;
}

/**
 * Whether an object read from the corpus is a picture this can draw.
 *
 * The generator's `visualData` is a different shape entirely — `initialCount`,
 * `itemType`, `slope` — and reaches the same component. Checking for `figures`
 * and a `frame` is what separates the two, and it is checked rather than
 * assumed because the consequence of guessing wrong is a blank card where a
 * question should be.
 */
export function isPicture(value: unknown): value is PictureSpec {
  if (typeof value !== 'object' || value === null) return false;
  const candidate = value as Partial<PictureSpec>;
  return (
    Array.isArray(candidate.figures) &&
    candidate.figures.length > 0 &&
    typeof candidate.frame === 'object' &&
    candidate.frame !== null &&
    typeof candidate.frame.width === 'number' &&
    typeof candidate.frame.height === 'number'
  );
}
