/**
 * The options, and the one thing about their layout that is not taste.
 *
 * For 111 of the 171 drawn problems the label is *"the first one"* and the
 * button's position is the answer. Everything else here — the row, the card
 * size, the label under the picture — is judgement and is meant to be changed
 * once somebody has used it on a phone. What is asserted below is only what
 * would make the question **unanswerable** if it broke.
 */

import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';

import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { ProblemChoices } from './ProblemChoices';

const CURRICULUM = path.resolve(__dirname, '../../../data/curriculum');

interface Problem {
  id: string;
  choices?: string[];
  answer?: string;
  visual?: { prompt?: unknown; choices?: unknown[] };
}

const problems: Problem[] = readdirSync(CURRICULUM)
  .filter(file => file.endsWith('-curriculum.json'))
  .flatMap(file => JSON.parse(readFileSync(path.join(CURRICULUM, file), 'utf8')).problems as Problem[]);

const find = (id: string) => problems.find(p => p.id === id)!;

const base = {
  selected: null,
  submitted: false,
  awaitingMark: false,
  correctAnswer: '',
  isCorrect: false,
  onSelect: () => {},
};

describe('choosing between drawn options', () => {
  const problem = find('counting-to-20-01');

  it('lays drawn options out in one line, in the order they were served', () => {
    /*
     * **The assertion that carries a question's answerability.** These options
     * read "the first one", "the middle one", "the last one"; a layout that
     * wraps three items into two-plus-one puts "the middle one" bottom-left,
     * and the child cannot tell which card the words mean. A row keeps first
     * leftmost and last rightmost.
     */
    const { container } = render(
      <ProblemChoices {...base} options={problem.choices!} pictures={problem.visual!.choices} />,
    );

    expect(container.firstElementChild).toHaveAttribute('data-layout', 'row');

    const buttons = screen.getAllByRole('button');
    expect(buttons.map(b => b.textContent)).toEqual([
      'the first one',
      'the middle one',
      'the last one',
    ]);
  });

  it('puts the picture it was given on the button it belongs to', () => {
    /*
     * `visual.choices` is permuted with `options` by `serveProblem`, so index i
     * of one belongs to index i of the other. Getting that pairing wrong would
     * mark a child wrong for picking the picture they were told to pick — and
     * every count would still be correct, so nothing else would notice.
     *
     * The three candidates here draw 6, 7 and 4 shapes, which is what makes
     * them distinguishable without reading any attribute but the drawing.
     */
    const { container } = render(
      <ProblemChoices {...base} options={problem.choices!} pictures={problem.visual!.choices} />,
    );

    const counts = [...container.querySelectorAll('button')].map(
      button => button.querySelectorAll('polygon, circle, rect').length,
    );
    expect(counts).toEqual([6, 7, 4]);
  });

  it('keeps the text grid when there is nothing to draw', () => {
    const { container } = render(
      <ProblemChoices {...base} options={['12', '14', '16', '18']} />,
    );
    expect(container.firstElementChild).toHaveAttribute('data-layout', 'grid');
    expect(screen.getAllByRole('button')).toHaveLength(4);
  });

  it('falls back to words rather than drawing some options and not others', () => {
    /*
     * A half-drawn set is worse than an undrawn one: two cards and a bare label
     * reads as though the third option is different in some way the problem
     * meant, when in fact the data is incomplete.
     */
    const partial = [problem.visual!.choices![0], undefined, problem.visual!.choices![2]];
    const { container } = render(
      <ProblemChoices {...base} options={problem.choices!} pictures={partial} />,
    );

    expect(container.firstElementChild).toHaveAttribute('data-layout', 'grid');
    expect(container.querySelectorAll('svg')).toHaveLength(0);
  });

  it('reports the choice a child made', async () => {
    const onSelect = vi.fn();
    render(
      <ProblemChoices
        {...base}
        options={problem.choices!}
        pictures={problem.visual!.choices}
        onSelect={onSelect}
      />,
    );

    screen.getAllByRole('button')[1].click();
    expect(onSelect).toHaveBeenCalledWith('the middle one');
  });

  it('reveals nothing while an answer is still queued', () => {
    /*
     * The offline case. The client is never sent the correct answer with the
     * question, so there is genuinely nothing to mark against — and marking the
     * right card green here would be inventing a verdict.
     */
    render(
      <ProblemChoices
        {...base}
        options={problem.choices!}
        pictures={problem.visual!.choices}
        selected="the first one"
        submitted
        awaitingMark
        correctAnswer="the first one"
      />,
    );

    const buttons = screen.getAllByRole('button');
    expect(buttons.every(b => !b.className.includes('emerald'))).toBe(true);
    expect(buttons.every(b => b.hasAttribute('disabled'))).toBe(true);
  });

  it('marks the right card once there is a verdict', () => {
    render(
      <ProblemChoices
        {...base}
        options={problem.choices!}
        pictures={problem.visual!.choices}
        selected="the middle one"
        submitted
        correctAnswer="the first one"
      />,
    );

    const buttons = screen.getAllByRole('button');
    expect(buttons[0].className).toContain('emerald');
    expect(buttons[1].className).toContain('rose');
  });

  it('draws the stacked-prompt problems in a row too', () => {
    /*
     * `foundations-compare-length` labels its options *"the top one"*, *"the
     * middle one"*, *"the bottom one"* — and those words point at sticks in the
     * **prompt**, not at the cards. A column of cards would invent a second top
     * and bottom and put the card labelled "the top one" at the bottom of the
     * screen. A row cannot, because it has neither.
     */
    const sticks = find('foundations-compare-length-01');
    const { container } = render(
      <ProblemChoices {...base} options={sticks.choices!} pictures={sticks.visual!.choices} />,
    );

    expect(container.firstElementChild).toHaveAttribute('data-layout', 'row');
    expect(sticks.choices).toEqual(['the top one', 'the middle one', 'the bottom one']);
  });
});
