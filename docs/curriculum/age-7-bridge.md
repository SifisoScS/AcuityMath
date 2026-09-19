# F2 — the age-7 bridge

> **Status: a reviewed draft. No content exists yet.** The concept set below is
> settled; the problems are not written. Nothing here is in the corpus.
>
> **Reviewer: the product owner, on the record. Not an educator.** That is
> recorded rather than glossed, because the error types in §3 are the part most
> in need of somebody who teaches seven-year-olds, and neither person who has
> read this draft is one.
>
> Pedagogical frame: a bridge band drawn from Singapore's concrete–pictorial–
> abstract progression, the Russian emphasis on mental arithmetic and place
> value, Japanese lesson-study problem variation, and the UK mastery approach's
> focus on verbal reasoning about quantity. **Age 7 is not "more of age 6" — it
> is the year a child stops counting and starts structuring.**

---

## 1. The gap, measured

`ageBands.ts` says *"Foundations stops at 6 and the fractions strand starts at
8"*, and `docs/ROADMAP.md` calls age 7 the only year between 3 and 18 with no
authored problems. Both are true and both understate it.

**The two halves of the corpus are not connected at all**, and the near side is
thinner than either draft of this document first assumed.

| | |
| --- | --- |
| Everything `foundations` contains | `compare-size`, `compare-length`, `compare-quantity`, `subitise-to-3`, `count-to-5`, `match-numeral-to-5`, `match-identical`, `odd-one-out`, `pattern-abab` |
| Where it tops out | **counting to five**, and naming the numeral for it |
| Where age 8 begins | `unit-fractions` — `prerequisites: []`<br>`polygon-perimeter` — `prerequisites: []` |

Both age-8 strand roots declare **no prerequisites**. There is no addition, no
subtraction, no place value, no partitioning and no measurement anywhere in the
authored corpus.

The first version of this draft assumed age 6 ended with counting to twenty and
addition to ten, and chained the band to `foundations-count-to-20` and
`foundations-add-to-10`. **Neither exists.** That is why the set below is seven
concepts and not five: the bridge is longer than it looked.

> The test of this work is not "age 7 has problems now". It is that a child can
> walk from counting to five all the way to unit fractions without stepping over
> a gap.

---

## 2. The two decisions, recorded

**Seven concepts, not five.** `counting-to-20` and `number-bonds-to-10` join the
band as its first two, chained from `foundations-count-to-5`. They could instead
have been added to `foundations`, and were not: putting them here says *the
foundations band was built thin and the bridge band corrects it*, which is what
happened. It also leaves a verified corpus closed rather than reopening it.

**`half-of-odd-not-possible` is dropped.** "Half of nine doesn't exist" is
**correct** for a seven-year-old working in whole numbers. As a distractor it
would have marked a right answer wrong — the same defect as the twelve pictures
F0b repaired, arrived at from the other direction. If the idea is wanted later it
returns as `half-of-odd-rounded-down` ("half of 9 is 4"), which is an error
rather than a truth.

---

## 3. The seven concepts

Ordered by dependency. Every prerequisite below names a concept that exists, or
one defined earlier in this list.

**Bands are ranges, never a single year.** No concept in the corpus uses one, and
a single-year band would make these reachable at exactly 7 and nowhere else.
Every pair below satisfies the rule `importCurriculum.test.ts` enforces — a
prerequisite never *starts* later than the thing that needs it.

### 3.1 `counting-to-20`

| | |
| --- | --- |
| **Band** | 6–7 |
| **Prerequisites** | `foundations-count-to-5`, `foundations-match-numeral-to-5` |
| **Feeds** | `number-bonds-to-10`, `place-value-to-100`, `measurement-compare-and-iterate` |

Counting past five, and reading the numeral that names the count. The teen
numbers are the reason this is a concept rather than an extension: *fourteen*
says the four first, and that is the first time the spoken name and the written
numeral disagree about order.

**Problem types:** `count-set`, `match-set`, `count-set-interleaved`,
`match-set-interleaved` — the existing foundations vocabulary unchanged, because
it is the same act at a larger number.

**Error types:** `off-by-one-overcount`, `off-by-one-undercount`,
`count-by-spread` — all three already exist in the corpus.
**New:** `teen-digits-reversed` (reading 14 as 41).

### 3.2 `number-bonds-to-10`

| | |
| --- | --- |
| **Band** | 6–8 |
| **Prerequisites** | `counting-to-20` |
| **Feeds** | `add-subtract-within-100` |

The pairs that make ten, met as a fact to know rather than a sum to compute.
This is the concept that makes everything after it cheap, and the one most worth
over-resourcing.

**Problem types:** `bond-complete` (7 + __ = 10), `bond-pick` (which pair makes
ten), `bond-from-picture`, `bond-decompose` (10 is __ and __).

**Error types — all new:** `bond-off-by-one`, `bond-counts-one-part-twice`,
`bond-ignores-total` (any pair rather than one summing to ten).

### 3.3 `place-value-to-100`

| | |
| --- | --- |
| **Band** | 7–8 |
| **Prerequisites** | `counting-to-20`, `foundations-compare-size` |
| **Feeds** | `add-subtract-within-100`, `equal-sharing-and-halves` |

The single biggest conceptual jump of the year. A child who can recite to a
hundred is not the same as a child who knows 47 is four tens and seven ones.

**Problem types:** `bundle-and-name` (loose units and bundled tens, child names
the number), `decompose` ("47 is __ tens and __ ones"), `compare-by-place`,
`build` (given "3 tens and 8 ones", pick the numeral).

**Error types — all new:** `digits-as-units` (47 read as "four and seven"),
`reverse-digits` (47 as 74), `place-swap` (writing 407 for four tens and seven
ones), `compare-by-first-digit-only`.

> **An authoring constraint on that last one.** Comparing by the first digit is
> *correct* for 62 against 59 and wrong for 45 against 54. It may only be
> attached to items where it actually misleads. The gate will not catch a
> misuse: it checks that a distractor is reachable and is not the answer, not
> that the error type applies to this particular pair of numbers.

### 3.4 `add-subtract-within-100`

| | |
| --- | --- |
| **Band** | 7–8 |
| **Prerequisites** | `place-value-to-100`, `number-bonds-to-10` |
| **Feeds** | `simple-multiplication-as-equal-groups` |

Where place value stops being a fact and becomes a tool. Regrouping is what
proves a child holds ten as a unit rather than as a word.

**Problem types:** `no-regroup` (23 + 45 by place), `regroup-add` (28 + 35),
`regroup-subtract` (52 − 27), `missing-addend` (34 + __ = 51), `word-context`
(two sentences at most).

**Error types — all new:** `ones-first-no-regroup` (28 + 35 = 53),
`subtract-smaller-from-larger` (52 − 27 taken as 57), `off-by-ten` (a borrow
that loses or gains a ten), `add-all-digits` (23 + 45 = 68).

### 3.5 `equal-sharing-and-halves` — *the on-ramp to fractions*

| | |
| --- | --- |
| **Band** | 7–8 |
| **Prerequisites** | `place-value-to-100`, `foundations-compare-size` |
| **Feeds** | `unit-fractions` (age 8) |

Sharing and halving are the concrete experiences that make *one half* mean
something before it becomes notation. Partition before defining — the
lesson-study move. This is the concept `unit-fractions` has assumed since it was
written.

**Problem types:** `share-equally` ("12 apples between 2 children"), `halve-a-set`
("half of 8"), `halve-a-shape` (figure mode), `is-it-half` (an unequal partition;
child picks the reason from a list — see §5), `double-and-halve`.

**Error types — all new:** `parts-not-equal` (any split into the right *number*
of pieces), `shares-by-count-not-size`, `half-as-subtract-one` ("half of 8 is
7"), `double-as-add-one`.

`parts-not-equal` is the one that matters: it survives all the way into
`compare-fractions` at 9.

### 3.6 `measurement-compare-and-iterate` — *the on-ramp to perimeter*

| | |
| --- | --- |
| **Band** | 6–8 |
| **Prerequisites** | `foundations-compare-size`, `foundations-compare-length`, `counting-to-20` |
| **Feeds** | `polygon-perimeter` (age 8) |

Comparing by attribute rather than by appearance, and the year comparison
becomes transitive. **This is the second bridge**, and without it
`polygon-perimeter` stays orphaned with no prerequisites at all.

**Problem types:** `direct-compare`, `unit-iterate` ("this pencil is 4 paperclips
long, that one is 6"), `transitive` ("Ravi is taller than Sam, Sam than Dee"),
`estimate`, `attribute-match` (figure mode).

**Error types — all new:** `compare-by-appearance` (a wide short object judged
longer than a narrow tall one), `non-transitive`, `wrong-attribute` (length when
asked for weight), `estimate-unreasoned` ("the door is 50 metres tall").

### 3.7 `simple-multiplication-as-equal-groups` — *the bridge out*

| | |
| --- | --- |
| **Band** | 7–8 |
| **Prerequisites** | `equal-sharing-and-halves`, `add-subtract-within-100` |
| **Feeds** | `unit-fractions` (age 8) |

Multiplication as repeated equal groups, not as tables — so that when fractions
arrive at 8, *3 × 4* already means *three groups of four*, which is the structure
the fraction strand assumes.

**Problem types:** `count-equal-groups` (three bags of four), `skip-count`
(written or picked — see §5), `array` (a 4×3 grid), `multiply-as-repeated-add`,
`word-context`.

**Error types — all new:** `add-instead-of-multiply` ("3 groups of 4 is 7"),
`count-groups-not-total` ("3 groups of 4 is 3"), `skip-count-slip`,
`array-dimension-confusion` (4×3 read as 4+3).

### The chain, end to end

```
foundations-count-to-5 ────┬──▶ counting-to-20 ──┬──▶ number-bonds-to-10 ─────────┐
foundations-match-numeral-to-5 ─┘                │                                │
                                                 ├──▶ place-value-to-100 ─────────┼──▶ add-subtract-within-100 ──┐
foundations-compare-size ────────────────────────┤            │                   │                              │
                                                 │            └──▶ equal-sharing-and-halves ──┬──▶ unit-fractions (8)
foundations-compare-length ──────────────────────┴──▶ measurement-compare-and-iterate         │
                                                              │                simple-multiplication ────────────┘
                                                              └──▶ polygon-perimeter (8)
```

**Closing it means editing two existing concepts**: `unit-fractions` gains
`equal-sharing-and-halves` and `simple-multiplication-as-equal-groups`;
`polygon-perimeter` gains `measurement-compare-and-iterate`. Until then the new
band is a third island.

---

## 4. Which problem-type vocabulary this follows

A concept declares `problem_types`; a problem carries a `problem_type`. **In
three strands of four these are different vocabularies** — 20 declared terms are
carried by no problem, 4 carried terms are declared by no concept, and 388 of
1,132 problems (34%) carry a type their own concept never mentions.

`foundations` is the only coherent strand: 0 of 180.

**This band follows `foundations`.** Every type named in §3 is declared by its
concept and carried by its problems, and nothing else. That is the coherent
half, it is the half age 7 sits against, and choosing the incoherent convention
for consistency's sake is how incoherence becomes the standard.

One consequence: the position invariant only examines groups of twelve or more
problems sharing a type. Spreading 140–175 problems across thirty narrow types
would put most groups under that floor, where nobody is watching where the
answer sits. **Four or five types per concept, each with enough problems to be
measurable.**

---

## 5. Three things that cannot be marked as written

Each was in the reviewed draft and each is a rewrite, not engineering.

| as drafted | why it cannot be marked | as it lands |
| --- | --- | --- |
| *"count by 2s, 5s, 10s, **aloud**"* | there is no audio input | a written or selected answer |
| *"compare, **with a follow-up rationale**"*<br>*"yes/no **with reasoning**"* | **0 of 1,132** problems have multiple parts or a follow-up; one prompt, one answer | the rationale becomes the choice — *"Which is larger, and why?"* with the reasons as options |
| a free-text answer | `text` exists in the enum and is used by **zero** problems; nothing grades one | not used |

The middle one is the interesting rewrite: picking among rationales is a better
item than writing one, because the distractors become named misconceptions the
engine can diagnose.

---

## 6. How each answer will be verified

The corpus carries three independent statements of every numeric answer, and the
gate cross-checks all three. New content must do the same.

| | |
| --- | --- |
| `answer` | what a child is marked against |
| `expression` | the mathematics, e.g. `"28 + 35"` |
| `expected` | the computed value |

Figure problems carry `measures` and a `direction` that determine which option is
correct, plus a `target` where one applies — **and the picture must agree with
the target.** That is exactly what the twelve repaired problems got wrong: five
fields agreed and the drawing did not.

Roughly: `place-value-to-100`, `add-subtract-within-100`, parts of
`equal-sharing-and-halves`, `measurement-compare-and-iterate` and
`simple-multiplication-as-equal-groups` are SymPy-verifiable; `counting-to-20`,
`number-bonds-to-10` and the partition pictures are figure mode.

---

## 7. What the build will break, on purpose

Each is a test written so somebody is told:

- `importCurriculum.test.ts` → **`it('leaves age 7 with nothing at all')`**. This
  test failing is the deliverable.
- the concept and problem counts (51 / 1,132) and the coverage-by-age map
- `contentCoverage.test.ts`'s age table, and `ROADMAP.md` §9, which is computed
  from it
- `standardsCoverage.test.ts` — seven more concepts carrying no standard, which
  widens the **F3** gap and should be stated rather than absorbed
- `pnpm audit:corpus` will check every new answer, and `corpus_seeds` means the
  database must be re-seeded before the app serves any of it

---

## 8. Still open

1. **The nineteen new error types.** Named from the errors two non-educators
   would expect. A teacher will know which ones children actually make, and
   which have been invented. This is the part most worth a real reviewer.
2. **Scope.** Time, money and simple data handling are deliberately absent:
   nothing downstream needs them. Age 8 opens with `unit-fractions` and
   `polygon-perimeter`, so time and money would be leaves — real for a child,
   but they do not unblock anything, and this band's job is to connect two
   disconnected halves. Worth revisiting once it does.
3. **Whether `counting-to-20` should instead extend `foundations`.** Decided
   against in §2, and the decision is reversible until problems are written.

---

## 9. What is not in this document

Problems. 140–175 items is a great deal of work to redo if the concept shape is
wrong, and the shape is what a reviewer can judge quickly.

Next: problems per concept at corpus density (20–25), as markdown here first,
then reviewed, then converted to JSON with the three-way answer structure, then
`pnpm audit:corpus` before any of it reaches a child.
