# F2 draft — the age-7 bridge

> **Status: a draft for review, not content.** Nothing here is in the corpus and
> nothing should be until somebody who teaches seven-year-olds has marked it up.
> The concept ids, bands and prerequisites are derived from what the corpus
> already contains; the *pedagogy* is a proposal, and it is the part that needs a
> reader rather than a test.
>
> Mark it up in place. The JSON is generated from whatever this file ends up
> saying, so the argument happens here, once, in prose.

---

## 1. The gap is not a hole in a continuum

`ageBands.ts` already says *"Foundations stops at 6 and the fractions strand
starts at 8"*, and the roadmap calls age 7 the only year between 3 and 18 with no
authored problems. Both are true and both understate it.

**The two halves of the corpus are not connected to each other at all.**

| | |
| --- | --- |
| Where `foundations` ends (age 6) | counting to five, numerals to five, comparing size/length/quantity, ABAB patterns, odd-one-out |
| Where the far side begins (age 8) | `unit-fractions` — `prerequisites: []`<br>`polygon-perimeter` — `prerequisites: []` |

Both age-8 strand roots declare **no prerequisites**. A child who completes every
authored `foundations` concept has done nothing the corpus records as preparing
them for either. There is no addition, no subtraction, no place value, no
partitioning and no measurement anywhere in the authored content.

So age 7 is not a missing year in a sequence. It is **the missing bridge between
two corpora that were never joined** — and the test of whether this work
succeeded is not "age 7 has problems now" but "a child can walk from counting to
five all the way to unit fractions without stepping over a gap."

**That changes one thing about the deliverable.** The last step of F2 is adding
`prerequisites` to `unit-fractions` and `polygon-perimeter`, pointing back into
this band. Without that the new concepts are a third island.

---

## 2. Six proposed concepts

Ordered by dependency. Bands are proposed, not derived — `ageBands.ts` is
hand-written by design, *"one person's reading of where each idea sits"*, and
these rows are exactly that.

### 2.1 `foundations-count-to-20`

| | |
| --- | --- |
| **Title** | Counting to twenty |
| **Band** | 6–7 |
| **Prerequisites** | `foundations-count-to-5`, `foundations-match-numeral-to-5` |
| **Problem types** | `match-set`, `count-set`, `match-set-interleaved`, `count-set-interleaved` |
| **Verification** | `figure` — same shape as the existing counting concepts |

Counting past five, and reading the numeral that names the count. Reuses the
foundations problem-type vocabulary unchanged, because it is the same act at a
larger number.

**Proposed error types** — all three already exist in the corpus:
`off-by-one-overcount`, `off-by-one-undercount`, `count-by-spread` (judging
quantity by how much space the objects take up).

> **For review:** is twenty right, or should this stop at ten and a second
> concept take ten-to-twenty? The argument for twenty is that teen numbers are
> where the naming breaks ("fourteen" says the four first) and that is worth
> meeting inside a counting concept rather than after it.

### 2.2 `number-bonds-to-10`

| | |
| --- | --- |
| **Title** | Pairs that make ten |
| **Band** | 6–8 |
| **Prerequisites** | `foundations-count-to-20` |
| **Problem types** | `match-set`, `count-set` — see §3 before adding anything symbolic |
| **Verification** | `figure` for the pictured items, `sympy` for the written ones |

The pairs that make ten, met as a fact to know rather than a sum to compute.
This is the concept that makes everything after it cheap, and the one most worth
over-resourcing.

**Proposed error types:** `bond-off-by-one`, `bond-counts-one-part-twice`,
`bond-ignores-total` (giving any pair rather than one summing to ten). **All
three are new** — no existing foundations code describes them.

### 2.3 `add-subtract-within-20`

| | |
| --- | --- |
| **Title** | Adding and taking away |
| **Band** | 7–8 |
| **Prerequisites** | `number-bonds-to-10` |
| **Problem types** | `word-problem` + one symbolic type — see §3 |
| **Verification** | `sympy` — `"7 + 5"`, expected `12` |

The first concept in the corpus whose answers are **machine-checkable
arithmetic**, which matters: the gate can verify every one of them, where the
counting concepts can only be checked against their own pictures.

**Proposed error types:** `counts-the-start-number` (counting on from 7 by
saying "7, 8, 9…" and landing one short), `subtracts-smaller-from-larger`
regardless of order, `ignores-the-ten-boundary`. **All three new.**

> **For review:** the crossing-ten cases (8 + 5) are materially harder than the
> within-ten ones (3 + 4). One concept or two?

### 2.4 `place-value-tens-ones`

| | |
| --- | --- |
| **Title** | Tens and ones |
| **Band** | 7–8 |
| **Prerequisites** | `foundations-count-to-20` |
| **Problem types** | `word-problem` + one visual type — see §3 |
| **Verification** | `sympy` for the numeric answers, `figure` for the grouped pictures |

A two-digit number as a count of tens and a count of ones. Independent of
addition, so it can be authored in parallel.

**Proposed error types:** `digits-as-separate-numbers` (reading 24 as "two and
four"), `tens-and-ones-swapped`, `place-value-by-position-only`. **All new.**

### 2.5 `equal-sharing` — *the on-ramp to fractions*

| | |
| --- | --- |
| **Title** | Sharing equally |
| **Band** | 7–8 |
| **Prerequisites** | `add-subtract-within-20` |
| **Problem types** | `word-problem` + one visual type — see §3 |
| **Verification** | `figure` for the partitioned shapes, `sympy` for "how many each" |

Splitting a set or a shape into equal parts, and naming what one part is. This
is the concept `unit-fractions` has been assuming since it was written.

**Proposed error types:** `parts-not-equal` (accepting any split into the right
*number* of pieces), `shares-by-count-not-size`, `names-the-parts-not-the-whole`.
**All new**, and the first is the one that matters — it is the misconception
that survives all the way into `compare-fractions` at 9.

### 2.6 `measure-with-units` — *the on-ramp to perimeter*

| | |
| --- | --- |
| **Title** | Measuring with a unit |
| **Band** | 7–8 |
| **Prerequisites** | `foundations-compare-length`, `foundations-count-to-20` |
| **Problem types** | `word-problem` + one visual type — see §3 |
| **Verification** | `figure` for the laid-out units, `sympy` for the totals |

Repeating a unit along a length and counting the repeats. `polygon-perimeter` at
8–9 assumes it.

**Proposed error types:** `counts-marks-not-gaps` (the fencepost error),
`units-with-gaps`, `units-overlapping`. **All new.** `length-by-endpoint` already
exists in `foundations-compare-length` and applies here too.

---

## 3. There is no single problem-type vocabulary to reuse

Found while checking this draft's own claims, and it is the reason five rows
above say "see §3" instead of naming types.

**A concept declares `problem_types`. A problem carries a `problem_type`. In
three strands of four these are different vocabularies.**

| | |
| --- | --- |
| Declared on concepts but carried by no problem | 20 terms — `classification`, `decomposition`, `equation-solving`, `modeling`, `percent`, `rate`, `scaling`, `symbolic-translation`, … |
| Carried by problems but declared by no concept | 4 terms — `conceptual`, `procedural`, `symbolic`, `visual-model` |

| strand | problems | carrying a type their own concept never declares |
| --- | ---: | ---: |
| `foundations` | 180 | **0** |
| `algebra-1` | 252 | 108 (43%) |
| `fractions-to-algebra` | 500 | 200 (40%) |
| `geometry` | 200 | 80 (40%) |
| **all** | **1,132** | **388 (34%)** |

`foundations` is the only internally consistent strand — its concepts declare
exactly what its problems carry. The three imported strands declare a rich
taxonomy that nothing implements, and label their problems with four generic
terms no concept mentions.

**This is not the same severity as the twelve**, and saying so matters.
`problemType` is imported, stored, and used by nothing that reaches a child —
the schema notes it is kept for a retrieval-practice scheduler that does not
exist yet. Today it is read by exactly one thing: the position invariant, which
groups by it. So this is a taxonomy that was designed and never made coherent,
not a defect a seven-year-old can feel.

It still has to be decided before authoring, because **new content cannot "use
the existing convention" when there are two of them.**

> **For review — which does age 7 follow?**
>
> **(a) The `foundations` convention.** Concepts declare precisely the types
> their problems carry. Internally consistent, matches the neighbour this band
> extends, and leaves the three imported strands alone.
>
> **(b) The imported convention.** Generic labels — `procedural`, `visual-model`,
> `conceptual` — matching what 388 problems already do in practice.
>
> I lean to **(a)**: it is the half of the corpus that is coherent, it is the
> half age 7 sits against, and picking the incoherent convention to be consistent
> with incoherence is how the incoherence becomes the standard.

**One consequence either way.** The position invariant only examines groups of
twelve or more problems sharing a type. Spreading 120–150 new problems across
many narrow types would put some groups under that floor, where nobody is
watching the answer positions. Fewer, larger types are safer.

---

## 4. What this costs

At the corpus's own density — 20 to 25 problems per concept, never fewer:

| | |
| --- | --- |
| Concepts | 6 |
| Problems | **120–150** |
| Of which machine-verifiable | roughly two thirds (`sympy`), the rest `figure` |
| New misconception codes | 16 |

Every problem needs a prompt, an answer, a `verification` object, an
explanation, a hint, distractors mapped to named error types, and — for the
pictured ones — a `visual` block. The corpus gate will check every answer that
carries an expression, which is the reason for doing the gate first.

---

## 5. What the build will break, on purpose

Adding this content makes several asserted figures wrong, and each one is a test
written so that somebody is told:

- `importCurriculum.test.ts` → `it('leaves age 7 with nothing at all')`. **This
  test failing is the deliverable.** It exists to make the gap impossible to
  close silently.
- the concept and problem counts (51 / 1,132) and the coverage-by-age map
- `contentCoverage.test.ts`'s age table, and the table in `ROADMAP.md` §9, which
  is computed from it
- `standardsCoverage.test.ts` — six more concepts carrying no standard, which
  widens the F3 gap and should be stated rather than absorbed

---

## 6. Open questions for the reviewer

1. **Is the six-concept shape right**, or is this two passes — number first
   (2.1–2.4), then the two on-ramps (2.5–2.6) once the number work is in?
2. **Twenty or ten** for the counting ceiling (§2.1).
3. **One concept or two** for adding across the ten boundary (§2.3).
4. **The sixteen new misconception codes** are the part I am least able to judge.
   They are named from the errors I would expect; a teacher will know which ones
   children actually make, and which three I have invented that nobody makes.
5. **Which problem-type convention** (§3) — the coherent `foundations` one, or
   the one 388 problems already follow.
6. **Should `unit-fractions` and `polygon-perimeter` gain prerequisites** pointing
   here? I think yes and §1 argues why, but it changes two existing concepts and
   that deserves a second opinion.

---

## 7. What is not in this draft

No problems. Deliberately: 120 to 150 items is a great deal of work to redo if
the concept shape is wrong, and the concept shape is the part a reviewer can
judge quickly. Once §2 is agreed, the problems follow — as markdown here first,
then generated into the strand JSON, then checked by `pnpm audit:corpus` before
any of it reaches a child.
