# `counting-to-20` — the first authored batch

> **Status: draft, for review.** No JSON has been written and nothing has
> been seeded. This document *is* the batch; the corpus entries will be
> generated from the same source that generated these tables, so reviewing
> what is below is reviewing what will be imported.
>
> **Not reviewed by an educator.** See §6.

Concept `counting-to-20`, band 6–7, from `docs/curriculum/age-7-bridge.md`
§3.1. Prerequisites `foundations-count-to-5` and
`foundations-match-numeral-to-5`, both of which exist.

**22 problems** — the corpus authors 20 per foundations concept and
21 is the median across all 63, so this sits at the density of its
neighbours rather than above it.

---

## 1. Two item shapes, and what distinguishes them

| | picture-choice | numeral-choice |
| --- | --- | --- |
| The child sees | a group, and three more groups | a group, and three numbers |
| Picks | `"the first one"` … | `"14"` … |
| `verification.measure` | `count` | `numeral` |
| Can carry `count-by-spread` | yes | no — nothing is drawn to misjudge |
| Can carry `teen-digits-reversed` | no — a position cannot express *41* | yes |
| In this batch | 11 | 11 |

**`problem_type` does not tell you which shape an item is.** The corpus
spreads all four types evenly across both — `foundations-count-to-5` has
five `match-set` items and `foundations-match-numeral-to-5` has five
`count-set` ones. The field is the pedagogical tag; `verification.measure`
is the shape. This batch follows that, because departing from it would make
`counting-to-20` the one concept where the tag means something else.

---

## 2. How a quantity is drawn

Six to ten is one row. **Eleven upwards is a full row of ten and a
remainder** — `figures` becomes `[10, 4]` under `layout: "stack"`, which
draws fourteen as *ten and four*.

This is the whole reason the concept exists. Fourteen is the first number
whose spoken name leads with the four, and a child who cannot see the ten
inside it has nothing to hold the name against. A line of fourteen circles
is not counting practice, it is a memory test.

> It is also the reason F0e happened. The gate read `figures[0].count` and
> would have rejected every teen item here as *"the picture draws 10 but the
> problem is about 14"*. Chasing that found twelve `foundations` problems
> the same rule had already condemned and F0b had already corrupted. The
> rule now sums every group, and this batch is the first content authored
> against the corrected one.

**One frame across a problem's three candidate pictures**, sized to the
largest. The corpus does this in all 160 problems that have candidate
pictures, without exception, and the reason is `count-by-spread` itself: a
card sized to its own contents makes the widest card visibly different, and
the child can answer a question about *how many* without counting.

---

## 3. Picture-choice items

The prompt group is drawn, then three candidates. `measures` lists what each
candidate draws, in the order they appear.

| id | draws | candidates | answer | distractors | type | diff |
| --- | --- | --- | --- | --- | --- | --- |
| `counting-to-20-01` | 6 as `[6]` | **6**, 7, 4 | 1 | `off-by-one-overcount` (2); `count-by-spread` (3) | `count-set` | 3 |
| `counting-to-20-02` | 7 as `[7]` | 8, **7**, 5 | 2 | `off-by-one-overcount` (1); `count-by-spread` (3) | `match-set` | 3 |
| `counting-to-20-03` | 8 as `[8]` | 6, 9, **8** | 3 | `count-by-spread` (1); `off-by-one-overcount` (2) | `count-set-interleaved` | 3 |
| `counting-to-20-04` | 9 as `[9]` | **9**, 7, 10 | 1 | `count-by-spread` (2); `off-by-one-overcount` (3) | `match-set-interleaved` | 3 |
| `counting-to-20-05` | 12 as `[10, 2]` | 11, **12**, 13 | 2 | `off-by-one-undercount` (1); `off-by-one-overcount` (3) | `count-set` | 4 |
| `counting-to-20-06` | 13 as `[10, 3]` | **13**, 14, 12 | 1 | `off-by-one-overcount` (2); `off-by-one-undercount` (3) | `match-set` | 4 |
| `counting-to-20-07` | 14 as `[10, 4]` | 15, 13, **14** | 3 | `off-by-one-overcount` (1); `off-by-one-undercount` (2) | `count-set-interleaved` | 4 |
| `counting-to-20-08` | 16 as `[10, 6]` | **16**, 17, 15 | 1 | `off-by-one-overcount` (2); `off-by-one-undercount` (3) | `match-set-interleaved` | 4 |
| `counting-to-20-09` | 17 as `[10, 7]` | 18, **17**, 16 | 2 | `off-by-one-overcount` (1); `off-by-one-undercount` (3) | `count-set` | 4 |
| `counting-to-20-10` | 19 as `[10, 9]` | 18, 20, **19** | 3 | `off-by-one-undercount` (1); `off-by-one-overcount` (2) | `match-set` | 4 |
| `counting-to-20-11` | 11 as `[10, 1]` | **11**, 12, 10 | 1 | `off-by-one-overcount` (2); `off-by-one-undercount` (3) | `count-set-interleaved` | 4 |

The bracketed number is which of the three positions carries that error.

**`count-by-spread` is computed, not asserted.** Where a candidate carries
it, that candidate has *fewer* shapes than the answer and is spaced so that
it occupies at least as much width — so a child judging by how much room
something takes up is genuinely drawn to it. It appears only on the
single-digit items: once both pictures open with a full row of ten, width
stops being a thing the two differ in, and the rationale would be a label
rather than a fact.

---

## 4. Numeral-choice items

| id | draws | choices | answer | distractors | type | diff |
| --- | --- | --- | --- | --- | --- | --- |
| `counting-to-20-12` | 6 as `[6]` | 5, **6**, 7 | 6 | `5` → `off-by-one-undercount`; `7` → `off-by-one-overcount` | `count-set` | 4 |
| `counting-to-20-13` | 8 as `[8]` | **8**, 9, 7 | 8 | `9` → `off-by-one-overcount`; `7` → `off-by-one-undercount` | `match-set` | 4 |
| `counting-to-20-14` | 10 as `[10]` | 9, 11, **10** | 10 | `9` → `off-by-one-undercount`; `11` → `off-by-one-overcount` | `count-set-interleaved` | 4 |
| `counting-to-20-15` | 12 as `[10, 2]` | 21, **12**, 13 | 12 | `21` → `teen-digits-reversed`; `13` → `off-by-one-overcount` | `match-set-interleaved` | 5 |
| `counting-to-20-16` | 13 as `[10, 3]` | **13**, 31, 12 | 13 | `31` → `teen-digits-reversed`; `12` → `off-by-one-undercount` | `count-set` | 5 |
| `counting-to-20-17` | 14 as `[10, 4]` | 15, 41, **14** | 14 | `15` → `off-by-one-overcount`; `41` → `teen-digits-reversed` | `match-set` | 5 |
| `counting-to-20-18` | 15 as `[10, 5]` | **15**, 51, 14 | 15 | `51` → `teen-digits-reversed`; `14` → `off-by-one-undercount` | `count-set-interleaved` | 5 |
| `counting-to-20-19` | 16 as `[10, 6]` | 17, **16**, 61 | 16 | `17` → `off-by-one-overcount`; `61` → `teen-digits-reversed` | `match-set-interleaved` | 5 |
| `counting-to-20-20` | 17 as `[10, 7]` | 71, 18, **17** | 17 | `71` → `teen-digits-reversed`; `18` → `off-by-one-overcount` | `count-set` | 5 |
| `counting-to-20-21` | 18 as `[10, 8]` | **18**, 81, 19 | 18 | `81` → `teen-digits-reversed`; `19` → `off-by-one-overcount` | `match-set` | 5 |
| `counting-to-20-22` | 20 as `[10, 10]` | 19, **20**, 21 | 20 | `19` → `off-by-one-undercount`; `21` → `off-by-one-overcount` | `count-set-interleaved` | 5 |

**`teen-digits-reversed` is the new error type**, and the one this concept
is really for: *fourteen* says the four first, so a child writing what they
hear writes `41`. It is offered only where the reversal is a number a child
could plausibly produce — 12 through 19. Twenty reverses to `02`, which
nobody writes, so item 22's distractors are an ordinary miscount either side.

---

## 5. What was checked

| | |
| --- | --- |
| Answer position across the batch | 9 first, 7 middle, 6 last — worst share 41% |
| Interleaved | 10 of 22 |
| Problem types | `count-set` 6, `count-set-interleaved` 6, `match-set` 6, `match-set-interleaved` 4 |
| Error types used | `count-by-spread`, `off-by-one-overcount`, `off-by-one-undercount`, `teen-digits-reversed` |
| Every answer among its own choices | yes |
| No answer used as its own distractor | yes |
| Picture agrees with `target`, summed over groups | yes, all 22 |

**The position invariant will not examine this batch on its own.**
`lopsidedTypes` needs twelve problems in a group before it says anything,
and 22 split four ways gives groups of four to six. What it examines is
each type *corpus-wide*, where these join the existing members — which is
the number that matters:

| problem type | n, corpus-wide | first / middle / last | worst share |
| --- | --- | --- | --- |
| `count-set` | 21 | 5 / 9 / 7 | 43% |
| `count-set-interleaved` | 21 | 8 / 7 / 6 | 38% |
| `match-set` | 21 | 9 / 7 / 5 | 43% |
| `match-set-interleaved` | 19 | 8 / 5 / 6 | 42% |

> **A snapshot, not a live claim.** Those figures and the 22-of-22 below
> come from running `verifyFigure` and `lopsidedTypes` over this batch and
> the corpus together, before this document was committed, against the gate
> as of `042b25f`. Nothing re-checks them while the batch is markdown.
> `pnpm audit:corpus` becomes the live check the moment the JSON lands, and
> it is the one to believe.

Against that same gate, **all 22 verify on the first pass** — no
`unresolvable`, no picture disagreeing with its target, nothing falling
through to `unverifiable`. That is a statement about the batch being
internally consistent. It is not a statement that the mathematics is
appropriate for a six-year-old, which is what §6 is about.

### 5.1 Whether the cross-check is real or circular

"All 22 verify" is worth nothing if the answer, the measurements and the
picture all render from one variable — then the gate is confirming the
generator and the content is unchecked. Six deliberate mutations, each
caught:

| mutation | caught as |
| --- | --- |
| answer moved to a slot that does not hold the target | *the measurements point at "the first one" and the answer is "the middle one"* |
| `target` changed, picture and measures untouched | *the picture draws 6 but the problem is about 7* |
| a measure changed, so no candidate holds the target | *the correct option is not among the choices* |
| prompt picture redrawn, target untouched | *the picture draws 15 but the problem is about 14* |
| a teen prompt loses its remainder row | *the picture draws 10 but the problem is about 14* |
| numeral answer swapped for one of its own distractors | *the measurements point at "14" and the answer is "41"* |

**But only the first three and the last are reachable from a typo here.**
In the tables above, the target, the candidate counts and which slot holds
the answer are three separately written numbers, so mistyping any one of
them is caught by the other two. The prompt picture is not: it is *drawn
from* the target, so the fourth and fifth mutations cannot arise from a
mistake in this document — only from editing the JSON afterwards.

That is the honest limit of generated content, and it is the argument for
reviewing this document rather than the JSON. **The tables are the authored
artifact**; the JSON is a rendering of them, and a rendering can only be as
right as what it renders. A wrong number in the `draws` column produces a
picture and a target that agree with each other perfectly and are both
wrong — and no gate that exists will ever say so. A reader will.

---

## 6. What is provisional

`teen-digits-reversed` is new to the corpus and **has not been reviewed by
anyone who teaches six-year-olds**. It is drawn from how the teen numbers
are described in the literature and from the error types the corpus already
uses, not from watching a child get it wrong. The same caveat covers the
other eighteen new error types in `age-7-bridge.md` §8.

The difficulty and cognitive-load numbers are the weakest thing here. They
are set by a rule — teens harder than single digits, numerals harder than
pictures — which is defensible and is not evidence. Nothing in the engine
validates them; the 3PL parameters are learned from attempts, so a wrong
number here costs some early mis-ordering and then washes out.

---

## 7. What happens next

This document is reviewed first. The JSON is generated after and in a
separate pass — not because the conversion is hard, but because a batch
that arrives as 22 JSON objects gets read for whether it parses.

