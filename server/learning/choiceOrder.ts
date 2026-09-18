/**
 * Varying where the right answer sits, on the way out.
 *
 * The corpus gate found `conceptual` with its answer first in 48 of 48 — a
 * child who always taps the first option scoring full marks without doing any
 * mathematics, and the 3PL engine reading that as ability. F0b balanced those
 * positions in the data. This is the other half: the served order varies too,
 * so a future authoring slip cannot hand anybody a free heuristic while nobody
 * is looking.
 *
 * **Both halves are kept deliberately.** Shuffling alone would make the
 * presentation fair and the skew invisible — new lopsided authoring would sail
 * past because the child never sees the stored order. Balancing alone leaves the
 * order fixed and learnable. So the data stays honest, the gate keeps measuring
 * the data, and the serve path varies what a child sees. Three independent
 * properties, each checked on its own.
 *
 * **The permutation must reach the pictures too.** 160 of the 348 authored
 * multiple-choice problems carry a `visual.choices` array parallel to
 * `choices` — the drawing for each option. Permuting one and not the other
 * shows a child a circle labelled "star", which is a worse defect than the one
 * this exists to fix and would look exactly like a rendering bug.
 *
 * Seeded rather than random, so the same child meeting the same problem sees a
 * stable order and a test can assert an exact arrangement. Two children get
 * different ones.
 */

/** A small deterministic generator. Not for anything that needs to be unguessable. */
function mulberry32(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** A stable 32-bit hash, so a seed can be built from ids rather than a counter. */
export function seedFrom(text: string): number {
  let hash = 2166136261;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

/**
 * The order the options should be shown in, as indices into the stored array.
 *
 * Returned rather than applied, so one permutation can be used for the choices
 * and their pictures without any chance of the two being generated separately.
 */
export function permutationFor(seed: string, length: number): number[] {
  const order = Array.from({ length }, (_, index) => index);
  const random = mulberry32(seedFrom(seed));

  for (let i = order.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1));
    [order[i], order[j]] = [order[j], order[i]];
  }
  return order;
}

export interface ShuffledChoices<T> {
  choices: string[];
  /** Null when the problem has no pictures for its options. */
  visualChoices: T[] | null;
}

/**
 * One permutation, applied to the options and to their pictures together.
 *
 * Refuses to reorder anything when the two arrays disagree in length. A
 * mismatch means the pair cannot be kept in step, and showing a child options
 * whose pictures belong to different options is worse than showing them a
 * predictable order — so the stored order is served unchanged and the defect
 * stays visible to the gate rather than being scrambled into something nobody
 * can diagnose.
 */
export function shuffleChoices<T>(
  seed: string,
  choices: string[],
  visualChoices: T[] | null,
): ShuffledChoices<T> {
  if (choices.length < 2) return { choices, visualChoices };
  if (visualChoices !== null && visualChoices.length !== choices.length) {
    return { choices, visualChoices };
  }

  const order = permutationFor(seed, choices.length);

  return {
    choices: order.map(index => choices[index]),
    visualChoices: visualChoices === null ? null : order.map(index => visualChoices[index]),
  };
}
