/**
 * The options a child picks between.
 *
 * Split out of `InfiniteAdaptiveModal` because the layout below is **judgement
 * rather than measurement**, and it should be possible to change one's mind
 * about it without touching the wiring that gets a picture onto the screen.
 * The renderer is verified against 715 pictures; none of that says anything
 * about whether three cards side by side work on a phone.
 *
 * ## Why picture choices go in a row, and text choices stay in a grid
 *
 * Because of what the labels say. The corpus uses three vocabularies for the
 * 171 problems whose options are drawn, and they do not mean the same thing:
 *
 * | words | count | what the words point at |
 * | --- | --- | --- |
 * | *the first / middle / last one* | 111 | **the card itself** |
 * | *the top / middle / bottom one* | 40 | a figure inside the **prompt** |
 * | *circle / square / star* | 20 | a figure inside the prompt |
 *
 * So for 111 of them the button's position **is** the answer, and a layout that
 * leaves "first" ambiguous makes the question unanswerable however well the
 * picture is drawn. `grid-cols-2` does exactly that: three items become two on
 * top and one below, and "the middle one" is the bottom-left card.
 *
 * A row fixes that — first is leftmost, last is rightmost — and it never lies
 * about the other two vocabularies either, because neither of them refers to a
 * card's position at all. A *column* would read correctly for "first / middle /
 * last" but would invent a top and a bottom for the 40 problems whose labels
 * already mean something by those words, and put a card labelled *"the top
 * one"* at the bottom of the screen.
 *
 * The other reason is that comparing the cards **is** the task. `count-by-
 * spread` and `match-by-width` are distractors that take up more room than they
 * should; the corpus gives a problem's three pictures one shared frame so that
 * room is comparable. Side by side at a common scale keeps that true. Stacked,
 * a child would be comparing widths against a memory of the card above.
 *
 * On a narrow screen the cards shrink rather than scroll. All three share a
 * frame, so they shrink by the same factor and the widths stay comparable —
 * which a scrolling row would destroy, since two cards visible at a time is
 * exactly the comparison the distractor is testing.
 */

import { AlertCircle, CheckCircle2 } from 'lucide-react';
import React from 'react';

import { ProblemFigure } from './ProblemFigure';
import { isPicture } from './figureLayout';

export interface ProblemChoicesProps {
  options: string[];
  /** Parallel to `options`; the server permutes the two together. */
  pictures?: unknown[];
  selected: string | null;
  submitted: boolean;
  /** True while an answer is queued and no verdict exists to show. */
  awaitingMark: boolean;
  correctAnswer: string;
  isCorrect: boolean;
  onSelect: (option: string) => void;
}

function styleFor({
  option,
  selected,
  submitted,
  awaitingMark,
  correctAnswer,
  isCorrect,
}: Pick<ProblemChoicesProps, 'selected' | 'submitted' | 'awaitingMark' | 'correctAnswer' | 'isCorrect'> & {
  option: string;
}): string {
  const isSelected = selected === option;

  if (submitted && awaitingMark) {
    // Nothing is revealed: the client does not know the answer, and dimming
    // everything but the child's choice would imply one.
    return isSelected
      ? 'bg-slate-100 border-slate-400 text-slate-900 ring-2 ring-slate-300 font-bold'
      : 'bg-slate-50 border-slate-200 text-slate-400 opacity-60';
  }

  if (submitted) {
    if (option === correctAnswer) {
      return 'bg-emerald-50 border-emerald-500 text-emerald-900 ring-2 ring-emerald-400 font-bold';
    }
    if (isSelected && !isCorrect) {
      return 'bg-rose-50 border-rose-500 text-rose-900 ring-2 ring-rose-400 font-bold';
    }
    return 'bg-slate-50 border-slate-200 text-slate-400 opacity-60';
  }

  if (isSelected) {
    return 'bg-indigo-50 border-indigo-600 text-indigo-900 ring-2 ring-indigo-500 font-bold';
  }

  return 'bg-white border-slate-200 hover:border-indigo-400 hover:bg-indigo-50/40 text-slate-800';
}

export const ProblemChoices: React.FC<ProblemChoicesProps> = ({
  options,
  pictures,
  selected,
  submitted,
  awaitingMark,
  correctAnswer,
  isCorrect,
  onSelect,
}) => {
  if (options.length === 0) return null;

  // One picture missing is not a text problem with a stray picture — it is a
  // drawn problem this cannot present honestly, so it falls back to words for
  // all of them rather than showing two cards and a label.
  const drawn = options.length > 0 && options.every((_, index) => isPicture(pictures?.[index]));

  return (
    <div
      className={
        drawn
          ? 'grid grid-flow-col auto-cols-fr gap-2 sm:gap-3 items-stretch'
          : 'grid grid-cols-1 sm:grid-cols-2 gap-3'
      }
      data-layout={drawn ? 'row' : 'grid'}
    >
      {options.map((option, index) => (
        <button
          key={index}
          onClick={() => onSelect(option)}
          disabled={submitted}
          aria-pressed={selected === option}
          className={`min-h-[50px] rounded-xl border-2 font-medium transition cursor-pointer ${
            drawn
              ? 'p-2 sm:p-3 flex flex-col items-center justify-between gap-2 text-center'
              : 'p-4 text-left text-base flex items-center justify-between'
          } ${styleFor({ option, selected, submitted, awaitingMark, correctAnswer, isCorrect })}`}
        >
          {drawn ? (
            <>
              <span className="flex items-center justify-center w-full text-indigo-600">
                <ProblemFigure picture={pictures![index]} />
              </span>
              <span className="text-xs font-semibold text-slate-600">{option}</span>
            </>
          ) : (
            <span className="font-mono">{option}</span>
          )}

          {submitted && !awaitingMark && option === correctAnswer && (
            <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
          )}
          {submitted && !awaitingMark && selected === option && !isCorrect && (
            <AlertCircle className="w-5 h-5 text-rose-600 shrink-0" />
          )}
        </button>
      ))}
    </div>
  );
};
