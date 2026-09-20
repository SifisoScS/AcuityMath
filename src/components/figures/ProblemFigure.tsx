/**
 * A corpus picture, drawn.
 *
 * The geometry is in `figureLayout.ts` and is checked against all 715 pictures
 * in the corpus. This file is only the ink: it turns placed drawables into SVG
 * and decides nothing about where anything goes.
 *
 * ## Shape carries the meaning, colour does not
 *
 * Every figure is drawn in one colour. The corpus distinguishes candidates by
 * *shape* — circles against stars, squares against circles — and never by
 * colour, so colouring them differently here would invent a cue the answer key
 * knows nothing about, and hand it to children who can see it while denying it
 * to those who cannot.
 *
 * ## What the label is, and what it is not
 *
 * `label` is the picture's own description — *"A row of seven shapes"* — and it
 * becomes the accessible name. For the problems whose answer is a position it
 * describes the picture without answering the question, which is what an
 * alternative text should do.
 *
 * For the problems whose answer is the count itself, `counting-to-20` writes a
 * label that deliberately does **not** state the number, because *"A group of
 * fourteen shapes"* beside the question *"How many are there?"* would hand the
 * answer to a screen reader and to nobody else. The honest consequence is that
 * those items are then not answerable without sight, which is a fact about a
 * counting-by-looking task rather than something this renderer can fix. It is
 * recorded here because the alternative — a label that gives the answer away —
 * would look like accessibility while being the opposite.
 */

import React from 'react';

import { isPicture, layOut, type Drawable, type PictureSpec } from './figureLayout';

interface ProblemFigureProps {
  picture: unknown;
  /** Caps how large the drawing may be rendered; it never upscales past this. */
  maxWidth?: number;
  className?: string;
}

/** A five-pointed star inscribed in a `size` box, as polygon points. */
function starPoints(x: number, y: number, size: number): string {
  const centreX = x + size / 2;
  const centreY = y + size / 2;
  const outer = size / 2;
  const inner = outer * 0.4;

  const points: string[] = [];
  for (let step = 0; step < 10; step += 1) {
    const radius = step % 2 === 0 ? outer : inner;
    // Start at the top rather than at three o'clock, so the star sits upright.
    const angle = (Math.PI / 5) * step - Math.PI / 2;
    points.push(`${centreX + radius * Math.cos(angle)},${centreY + radius * Math.sin(angle)}`);
  }
  return points.join(' ');
}

const Ink: React.FC<{ drawable: Drawable }> = ({ drawable }) => {
  if (drawable.kind === 'bar') {
    return (
      <rect
        x={drawable.x}
        y={drawable.y}
        width={drawable.length}
        height={drawable.thickness}
        rx={Math.min(3, drawable.thickness / 2)}
        fill="currentColor"
      />
    );
  }

  if (drawable.shape === 'circle') {
    return (
      <circle
        cx={drawable.x + drawable.size / 2}
        cy={drawable.y + drawable.size / 2}
        r={drawable.size / 2}
        fill="currentColor"
      />
    );
  }

  if (drawable.shape === 'square') {
    return (
      <rect
        x={drawable.x}
        y={drawable.y}
        width={drawable.size}
        height={drawable.size}
        rx={2}
        fill="currentColor"
      />
    );
  }

  return <polygon points={starPoints(drawable.x, drawable.y, drawable.size)} fill="currentColor" />;
};

export const ProblemFigure: React.FC<ProblemFigureProps> = ({ picture, maxWidth, className }) => {
  // Checked rather than assumed: the generator's `visualData` reaches the same
  // props, and drawing a frame from one would put an empty box where a working
  // question used to be.
  if (!isPicture(picture)) return null;

  const spec = picture as PictureSpec;
  const drawables = layOut(spec);

  return (
    <svg
      role="img"
      aria-label={spec.label ?? 'A picture'}
      viewBox={`0 0 ${spec.frame.width} ${spec.frame.height}`}
      width={spec.frame.width}
      height={spec.frame.height}
      preserveAspectRatio="xMidYMid meet"
      className={className}
      style={{
        // The frames run from 42 to 540 wide. Scaling down to fit a narrow
        // phone is fine; scaling *up* past the authored size is not, because
        // `spacing` is load-bearing and stretching a picture changes how spread
        // out it looks.
        width: '100%',
        height: 'auto',
        maxWidth: maxWidth ? Math.min(spec.frame.width, maxWidth) : spec.frame.width,
      }}
    >
      {drawables.map((drawable, index) => (
        <Ink key={index} drawable={drawable} />
      ))}
    </svg>
  );
};
