/**
 * A deterministic sample of the algorithmic problem generator.
 *
 * `problemGenerator.ts` reaches for `Math.random()` in a dozen places and
 * stamps `Date.now()` into every id. Neither is a defect — but both make the
 * output unrepeatable, and an integrity gate that cannot reproduce its own
 * failure is not a gate. Rather than thread a seed through the generator (a
 * change to product code in service of a test), this module swaps both globals
 * for deterministic stand-ins, draws the sample, and puts them back.
 *
 * The seed is therefore part of the contract: `pnpm audit:generator` and the
 * Vitest suite draw the *same* problems, so a failure reported by CI can be
 * reproduced locally by running the same command.
 */

import { ProblemGenerator, type GeneratedMathProblem } from '../src/services/problemGenerator';

export type Tier = 'early' | 'elementary' | 'middle' | 'high';

export const TIERS: Tier[] = ['early', 'elementary', 'middle', 'high'];

/**
 * Thetas spanning the range the adaptive engine actually produces.
 * `AdaptiveEngine` clamps theta to [-3, 3] and seeds new learners between
 * -1.2 and +1.0, so sampling outside that band would test states no learner
 * can reach, while sampling only at 0 would miss every theta-dependent branch.
 */
export const SAMPLED_THETAS = [-2.5, -1.2, -0.5, 0, 0.4, 1.0, 2.5];

/** mulberry32 — small, fast, and good enough for drawing a corpus. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * The generator's variant, recovered from the id it stamps.
 * `gen-early-bond-1757356800000-421` -> `early-bond`. Ids carry a timestamp and
 * a nonce, so the first three segments are the only stable part.
 */
export function kindOf(problem: GeneratedMathProblem): string {
  const [, tier, variant] = problem.id.split('-');
  return `${tier}-${variant}`;
}

export interface SampledProblem extends GeneratedMathProblem {
  /** The variant that produced it, e.g. `mid-linear`. */
  kind: string;
  /** The theta it was drawn at, so a failure names the branch it came from. */
  sampledTheta: number;
}

export interface SampleOptions {
  seed?: number;
  /** Draws per (tier, theta) pair. 240 covers every variant many times over. */
  drawsPerCell?: number;
}

/**
 * Draws a reproducible corpus across every tier and theta.
 *
 * Restores `Math.random` and `Date.now` in a `finally`, so a throw inside the
 * generator cannot leave the globals patched for whatever runs next — in
 * Vitest that would silently corrupt every later test in the file.
 */
export function drawSample(options: SampleOptions = {}): SampledProblem[] {
  const { seed = 20260908, drawsPerCell = 240 } = options;

  const realRandom = Math.random;
  const realNow = Date.now;
  const rng = mulberry32(seed);
  let tick = 1_757_356_800_000;

  const drawn: SampledProblem[] = [];

  try {
    Math.random = rng;
    Date.now = () => tick++;

    for (const tier of TIERS) {
      for (const theta of SAMPLED_THETAS) {
        for (let i = 0; i < drawsPerCell; i++) {
          const problem = ProblemGenerator.generate(tier, theta);
          drawn.push({ ...problem, kind: kindOf(problem), sampledTheta: theta });
        }
      }
    }
  } finally {
    Math.random = realRandom;
    Date.now = realNow;
  }

  return drawn;
}
