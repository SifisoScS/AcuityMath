# Generator integrity

`src/services/problemGenerator.ts` produces an unbounded number of questions.
Nobody reviews them. A hand-authored bank of 500 problems is read by a person
at least once; a generator is read never, and its defects reach a learner at the
rate the learner practises.

This document describes the gate that stands in for that missing review, why it
is shaped the way it is, and what it found the first time it ran.

## Running it

```bash
pnpm audit:generator     # both halves, writes data/generator-validation.json
pnpm test                # the structural half only, plus regression cases
```

Requires Python 3 with SymPy (`pip install sympy`). This is not optional — see
[Why two gates](#why-two-gates).

## Why two gates

The gate is in two halves because two different classes of defect exist and
neither tool can see the other's.

| Half | Lives in | Catches |
| --- | --- | --- |
| Structural | `scripts/generator-invariants.ts` | Duplicated options, undiagnosed distractors, the correct answer tagged as a misconception, IRT parameters outside the range the adaptive engine assumes, elided coefficients |
| Mathematical | `scripts/verify_generated.py` | Wrong answers, options that are the same *number* in different text, distractors tagged with a misconception that cannot produce them |

A structural pass cannot tell you an answer is wrong. A computer algebra system
cannot tell you an option appears twice. Running only one is worse than useless,
because it reports success.

The mathematical half **re-derives every answer from the problem's own
parameters**, in Python, with SymPy — it does not check the generator against
itself. Each problem carries its parameters in `visualData` (the counts, the
roots, the coefficients), so the answer can be computed a second time by
something that shares no code with the thing that produced it. A generator that
computes its own answer and then confirms it is proving nothing.

## Determinism

`scripts/generator-sample.ts` swaps `Math.random` and `Date.now` for seeded
stand-ins, draws 6,720 problems across four tiers and seven abilities, and puts
the globals back in a `finally`.

The seed is part of the contract. `pnpm audit:generator` and `pnpm test` draw
the *same* problems, so a failure reported by CI reproduces locally by running
the same command. An integrity gate that cannot reproduce its own failure is
not a gate.

The sample size is not arbitrary. The rarest defect found below occurred **twice
in 6,720 draws**; a materially smaller sample would have passed while the bug was
still there.

## Coverage, including where there is none

`DECLARED_KINDS` lists all twelve variants the generator can produce. Two checks
guard the list: a declared variant that is never drawn fails, and a drawn variant
that was never declared fails. Without them the gate would quietly test less than
it did yesterday whenever a branch became unreachable.

Two known holes, both reported rather than hidden:

- **`early-pat`** is a sequence of symbols with no numeric content. It is checked
  structurally and counted under `unverifiable_by_kind` in the report — not
  silently passed.
- **`high-trig`** has authored wrong answers rather than computed ones, so there
  is no arithmetic rule to check them against. They appear under
  `reachability_unchecked`. Closing this means giving each trig item a stated
  derivation for its distractors.

## What it found on first run

Every defect below was present in `main`, in code that reads as obviously
correct, and none of it was reachable by inspection.

| Variant | Defect | Frequency |
| --- | --- | --- |
| `mid-integers` | `-(\|p\| + q)` and `p - q` are the same number for any negative `p`. **Every** question offered a duplicate and only three real choices. | ~100% |
| `mid-slope` | Slopes rendered as `1/-1`, which is the same value as `-1`, with both offered on one question. A learner picking the first was right and marked wrong. | 74 |
| `high-quad` | `x = 5, x = -5` and `x = -5, x = 5` offered as different options. Same roots. | 90 |
| `mid-linear` | `xVal = 0` made the sign-error distractor equal the answer; `b = 0` did the same to the inverted-sign distractor. | 140 |
| `early-bond` | `Math.max(1, b - 1)` clamped to 1 — the answer itself when the missing part is 1. | 160 |
| `high-quad` | A root of 0 negates to itself, so a "sign error" distractor equalled the answer. | 51 |
| `elem-geom` | A 6m by 3m garden has an area of 18 and a perimeter of 18, so the perimeter distractor *was* the answer. | 13 |
| `elem-mult` | At 18 × 9, "added instead of multiplied" and "dropped the ones place" both give 171. | 2 |
| `mid-linear` | The inverted-sign distractor was `Math.round((c + b) / a)` — rounding produced a whole number no sign rule yields, so the tag was decoration. | 245 |
| four variants | A zero coefficient left an empty slot in the question template: `x²  - 25 = 0`. | ~2,200 |

In total: **3,534 structural violations and 916 mathematical ones** across a
6,720-problem sample, in a generator that had shipped.

## The fix, and why it is one function

Each defect above is individually rare and they were collectively constant. They
also share a cause: twelve call sites each assembling their own options inline,
each with a formula that collides with another somewhere in its parameter range.

`assembleOptions(correct, candidates)` in `problemGenerator.ts` now owns that.
Callers pass an ordered list of candidate distractors — more than the three
needed — and the assembler takes them in order, skipping any that duplicate the
correct answer or one already chosen.

It **throws** rather than returning a short list. A question with three options
is a pedagogical defect, not a rendering edge case, and there is nothing sensible
to substitute at the point of failure. The contract is that callers supply enough
candidates that this cannot happen, and the gate is what proves it holds across
the whole parameter space rather than only where someone thought to look. The
throw fired exactly once during development — on a quadratic with roots `{0, 1}`,
where negation is a no-op and three of five candidates collapsed onto each other.

## Adding a variant

1. Write it in `problemGenerator.ts`, building options through `assembleOptions`.
2. Add its id prefix to `DECLARED_KINDS` in `scripts/generator-invariants.ts`.
3. Add a `derive_*` function in `scripts/verify_generated.py` that re-derives the
   answer from `visualData` alone, and register it in `DERIVATIONS`.
4. In that function, state which value each misconception code produces. A code
   you leave out is reported as unchecked, which is honest; a code you map to the
   wrong value is worse than no gate at all.
5. Run `pnpm audit:generator`. If the sample never draws the new variant, the
   coverage check fails before anything else does.
