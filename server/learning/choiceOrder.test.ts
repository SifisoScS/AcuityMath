// @vitest-environment node

/**
 * Varying the option order without desynchronising the pictures.
 *
 * The assertion that matters most here is not that the order changes — it is
 * that **the options and their drawings move together**. 160 of the 348 authored
 * multiple-choice problems carry a `visual.choices` array parallel to `choices`,
 * and permuting one without the other shows a child a circle labelled "star".
 * That would be a worse defect than the predictable ordering this fixes, and it
 * would present as a rendering bug nobody could trace to here.
 */

import { describe, expect, it } from 'vitest';

import { permutationFor, seedFrom, shuffleChoices } from './choiceOrder';

describe('the served order', () => {
  it('is a permutation — nothing gained, lost or duplicated', () => {
    const choices = ['a', 'b', 'c', 'd'];
    const result = shuffleChoices('learner-1:7', choices, null);

    expect([...result.choices].sort()).toEqual([...choices].sort());
    expect(new Set(result.choices).size).toBe(choices.length);
  });

  it('is stable for one child and one problem', () => {
    // A child meeting the same question twice should not find the options
    // rearranged, which reads as the product being unsure.
    const first = shuffleChoices('learner-1:7', ['a', 'b', 'c', 'd'], null);
    const second = shuffleChoices('learner-1:7', ['a', 'b', 'c', 'd'], null);
    expect(first.choices).toEqual(second.choices);
  });

  it('differs between children, and between problems', () => {
    const choices = ['a', 'b', 'c', 'd', 'e'];
    const one = shuffleChoices('learner-1:7', choices, null).choices;
    const two = shuffleChoices('learner-2:7', choices, null).choices;
    const three = shuffleChoices('learner-1:8', choices, null).choices;

    expect(one).not.toEqual(two);
    expect(one).not.toEqual(three);
  });

  it('actually moves the answer around across a run of problems', () => {
    /*
     * The positive control for the whole point of this module. A "shuffle" that
     * always returned the input would satisfy every other assertion above —
     * it permutes, it is stable, and different seeds could still yield the same
     * order by coincidence in a small sample.
     */
    const positions = new Set<number>();
    for (let problem = 0; problem < 40; problem += 1) {
      const result = shuffleChoices(`learner-1:${problem}`, ['right', 'b', 'c', 'd'], null);
      positions.add(result.choices.indexOf('right'));
    }
    expect(positions.size).toBe(4);
  });
});

describe('the pictures that belong to the options', () => {
  it('moves a drawing with its option', () => {
    /*
     * **The assertion this file exists for.** Each entry in `visual.choices` is
     * the drawing for the option at the same index; they must be permuted
     * identically or the labels and the pictures cross over.
     */
    const choices = ['circle', 'square', 'star'];
    const visuals = [{ shape: 'circle' }, { shape: 'square' }, { shape: 'star' }];

    const result = shuffleChoices('learner-3:11', choices, visuals);

    expect(result.visualChoices).not.toBeNull();
    for (let index = 0; index < result.choices.length; index += 1) {
      expect(result.visualChoices![index]).toEqual({ shape: result.choices[index] });
    }
  });

  it('serves the stored order rather than scrambling a mismatched pair', () => {
    /*
     * When the arrays disagree in length, no permutation can keep them in step.
     * Serving the stored order leaves the defect visible to the corpus gate;
     * reordering one of them would turn a findable data problem into a
     * rendering mystery.
     */
    const choices = ['a', 'b', 'c'];
    const visuals = [{ shape: 'a' }, { shape: 'b' }];

    const result = shuffleChoices('learner-1:1', choices, visuals);
    expect(result.choices).toEqual(choices);
    expect(result.visualChoices).toEqual(visuals);
  });

  it('leaves a problem with no pictures alone', () => {
    expect(shuffleChoices('learner-1:1', ['a', 'b'], null).visualChoices).toBeNull();
  });

  it('does not reorder a single option, or none', () => {
    expect(shuffleChoices('learner-1:1', ['only'], null).choices).toEqual(['only']);
    expect(shuffleChoices('learner-1:1', [], null).choices).toEqual([]);
  });
});

describe('the seeding', () => {
  it('produces the same permutation for the same seed', () => {
    expect(permutationFor('x', 5)).toEqual(permutationFor('x', 5));
  });

  it('covers every index exactly once', () => {
    const order = permutationFor('some-seed', 6);
    expect([...order].sort((a, b) => a - b)).toEqual([0, 1, 2, 3, 4, 5]);
  });

  it('hashes different strings differently', () => {
    expect(seedFrom('learner-1:7')).not.toBe(seedFrom('learner-1:8'));
    expect(seedFrom('a')).toBe(seedFrom('a'));
  });
});
