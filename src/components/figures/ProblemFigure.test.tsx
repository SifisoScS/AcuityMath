/**
 * The picture, rendered.
 *
 * `figureLayout.test.ts` checks the arithmetic over all 715 corpus pictures.
 * This checks the much smaller thing that arithmetic cannot: that the numbers
 * reach the DOM as shapes, that the right number of them arrive, and that a
 * generated problem's visual data — which lands on the same prop — draws
 * nothing rather than an empty box.
 */

import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';

import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { ProblemFigure } from './ProblemFigure';

const CURRICULUM = path.resolve(__dirname, '../../../data/curriculum');

interface Problem {
  id: string;
  visual?: { prompt?: unknown; choices?: unknown[] };
}

const problems: Problem[] = readdirSync(CURRICULUM)
  .filter(file => file.endsWith('-curriculum.json'))
  .flatMap(file => JSON.parse(readFileSync(path.join(CURRICULUM, file), 'utf8')).problems as Problem[]);

const find = (id: string) => problems.find(p => p.id === id)!;

describe('drawing a corpus picture', () => {
  it('draws one shape per thing the problem is about', () => {
    /*
     * `foundations-match-numeral-to-5-02` is the problem F0b corrupted and F0e
     * restored: four squares drawn as two groups of two. It is the natural test
     * case, because getting it wrong here in the same way — showing two — would
     * reproduce the original defect at the last possible moment, after the gate,
     * after the seed, on the child's screen.
     */
    const { container } = render(<ProblemFigure picture={find('foundations-match-numeral-to-5-02').visual!.prompt} />);
    expect(container.querySelectorAll('rect')).toHaveLength(4);
  });

  it('draws a teen as ten and a remainder', () => {
    // `counting-to-20-16` is thirteen, drawn `[10, 3]` in circles.
    const { container } = render(<ProblemFigure picture={find('counting-to-20-16').visual!.prompt} />);
    const circles = [...container.querySelectorAll('circle')];
    expect(circles).toHaveLength(13);

    const rows = new Map<string, number>();
    for (const circle of circles) {
      const y = circle.getAttribute('cy')!;
      rows.set(y, (rows.get(y) ?? 0) + 1);
    }
    expect([...rows.values()].sort((a, b) => b - a)).toEqual([10, 3]);

    // The remainder starts where the ten starts: ten and three more, not a
    // second group floating in the middle.
    const xs = circles.map(c => Number(c.getAttribute('cx')));
    const [firstRowY, secondRowY] = [...rows.keys()];
    const leftOf = (y: string) =>
      Math.min(...circles.filter(c => c.getAttribute('cy') === y).map(c => Number(c.getAttribute('cx'))));
    expect(leftOf(firstRowY)).toBe(leftOf(secondRowY));
    expect(xs).toHaveLength(13);
  });

  it('draws each shape the corpus uses', () => {
    // 01 is circles, 02 squares, 03 stars, and compare-length is bars.
    const { container: circles } = render(<ProblemFigure picture={find('counting-to-20-01').visual!.prompt} />);
    expect(circles.querySelector('circle')).toBeTruthy();

    const { container: squares } = render(<ProblemFigure picture={find('counting-to-20-02').visual!.prompt} />);
    expect(squares.querySelectorAll('rect')).toHaveLength(7);

    const { container: stars } = render(<ProblemFigure picture={find('counting-to-20-03').visual!.prompt} />);
    expect(stars.querySelectorAll('polygon')).toHaveLength(8);

    const bars = problems.find(p => p.id.startsWith('foundations-compare-length'))!;
    const { container: sticks } = render(<ProblemFigure picture={bars.visual!.prompt} />);
    expect(sticks.querySelectorAll('rect').length).toBeGreaterThan(0);
  });

  it('is announced by its own label', () => {
    render(<ProblemFigure picture={find('foundations-match-numeral-to-5-02').visual!.prompt} />);
    // The picture is a picture, not decoration, so it has a role and a name.
    expect(screen.getByRole('img')).toHaveAttribute('aria-label', 'A group of four shapes');
  });

  it('does not name the count where the count is the answer', () => {
    /*
     * `counting-to-20`'s numeral items ask *how many*, so a label reading "A
     * group of fourteen shapes" would answer the question for a screen reader
     * and for nobody else. The label is deliberately plain, and this asserts
     * that rather than leaving it to survive by luck.
     */
    render(<ProblemFigure picture={find('counting-to-20-17').visual!.prompt} />);
    const name = screen.getByRole('img').getAttribute('aria-label') ?? '';
    expect(name).toBe('A group of shapes');
    expect(name).not.toMatch(/fourteen|14/);
  });

  it('draws nothing at all from the generator"s visual data', () => {
    /*
     * The regression that would be silent. `InfiniteAdaptiveModal` hands
     * `visualData` to this for every problem, and for a generated one it holds
     * `initialCount` and `formula`. Rendering an empty frame from that would
     * replace a working question with a blank rectangle — which looks like a
     * loading state and is not one.
     */
    const { container } = render(<ProblemFigure picture={{ initialCount: 3, itemType: 'apple' }} />);
    expect(container.innerHTML).toBe('');

    const { container: empty } = render(<ProblemFigure picture={undefined} />);
    expect(empty.innerHTML).toBe('');
  });

  it('never scales a picture up past the size it was authored at', () => {
    /*
     * `spacing` is load-bearing — `count-by-spread` is a card that takes up more
     * room than it should — so stretching a drawing to fill a wide container
     * would change what the problem is asking. Shrinking to fit a phone is fine;
     * growing is not.
     */
    render(<ProblemFigure picture={find('counting-to-20-01').visual!.prompt} maxWidth={9999} />);
    const svg = screen.getByRole('img');
    const frame = (find('counting-to-20-01').visual!.prompt as { frame: { width: number } }).frame;
    expect(svg.style.maxWidth).toBe(`${frame.width}px`);
  });
});
