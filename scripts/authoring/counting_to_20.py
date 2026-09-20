"""The `counting-to-20` batch: one design, two renderings.

The markdown is the reviewable artifact and the JSON is what the gate reads.
Both come from here, so reviewing the first is reviewing the second — a markdown
table hand-copied from a JSON file is a third statement of the same thing, and
F0e is a long enough lesson about two.

Both outputs are regenerated in place, so a reviewer can check the claim rather
than take it:

    cd scripts/authoring
    python counting_to_20.py ../../docs/curriculum/counting-to-20.md
    python build_bridge_strand.py ../../data/curriculum
    git diff --exit-code          # silent, or the document and the corpus disagree

Usage:  python counting_to_20.py <out.md> [out.json]
"""
import json
import io
import sys

SIZE = 16
PAD = 20
ROW_GAP = 20
TIGHT = 5          # ordinary spacing between shapes
WORDS = ('zero one two three four five six seven eight nine ten eleven twelve '
         'thirteen fourteen fifteen sixteen seventeen eighteen nineteen twenty').split()

POSITIONS = ['the first one', 'the middle one', 'the last one']

# The teen names that actually lead with their unit digit, and so can produce
# the reversal. See §4 — this list is the whole content of that error type.
REVERSIBLE = {14, 16, 17, 18, 19}


# --------------------------------------------------------------------------
# pictures
# --------------------------------------------------------------------------

def rows_for(n):
    """A quantity as figure groups. Ten first, then the rest."""
    return [n] if n <= 10 else [10, n - 10]


def width_of(rows, spacing):
    return max(r * SIZE + (r - 1) * spacing for r in rows) + PAD


def frame(rows, spacing):
    return {
        'width': width_of(rows, spacing),
        'height': len(rows) * SIZE + (len(rows) - 1) * ROW_GAP + PAD,
    }


def picture(n, shape, spacing=TIGHT, label='A group of shapes'):
    rows = rows_for(n)
    return {
        'version': 1,
        'layout': 'stack' if len(rows) > 1 else 'row',
        'label': label,
        'figures': [{'shape': shape, 'size': SIZE, 'count': r, 'spacing': spacing}
                    for r in rows],
        'frame': frame(rows, spacing),
    }


def unify(visuals):
    """One frame across a problem's candidate pictures, sized to the largest."""
    w = max(v['frame']['width'] for v in visuals)
    h = max(v['frame']['height'] for v in visuals)
    for v in visuals:
        v['frame'] = {'width': w, 'height': h}
    return visuals


def spread_spacing(count, beat):
    """Spacing that makes `count` shapes the widest drawing on the table.

    `count-by-spread` names a child who answers *how many* by how much room
    something takes up. For that to pick out one card, that card has to be the
    one taking up the most room — not merely as much as the correct answer,
    which was the first version of this and left the widest card sitting under
    a different rationale.
    """
    gaps = count - 1
    need = (beat - count * SIZE) // gaps + 1
    return max(need, TIGHT + 4)


# --------------------------------------------------------------------------
# the batch
# --------------------------------------------------------------------------

# Picture-choice items: a drawn group, and three drawn candidates.
# (target, candidate counts in slot order, answer slot, spread slot or None,
#  prompt shape, candidate shape, problem type)
#
# The prompt shape and the candidate shape always differ, so the correct card
# is never a copy of the prompt. Candidates never mix one-row and two-row
# drawings, which is why 10 and 11 never appear on the same table.
PICTURE_ITEMS = [
    (6,  [6, 7, 4],    0, 2,    'circle', 'star',   'count-set'),
    (7,  [8, 7, 5],    1, 2,    'square', 'circle', 'match-set'),
    (8,  [6, 9, 8],    2, 0,    'star',   'square', 'count-set-interleaved'),
    (9,  [9, 7, 10],   0, 1,    'circle', 'star',   'match-set-interleaved'),
    (12, [11, 12, 13], 1, None, 'square', 'circle', 'count-set'),
    (13, [13, 14, 12], 0, None, 'star',   'square', 'match-set'),
    (14, [15, 13, 14], 2, None, 'circle', 'star',   'count-set-interleaved'),
    (16, [16, 17, 15], 0, None, 'square', 'circle', 'match-set-interleaved'),
    (17, [18, 17, 16], 1, None, 'star',   'square', 'count-set'),
    (19, [18, 20, 19], 2, None, 'circle', 'star',   'match-set'),
    (18, [17, 18, 19], 1, None, 'square', 'circle', 'count-set-interleaved'),
]

# Numeral-choice items: a drawn group, and three written numbers.
# (target, numerals in slot order, answer slot, shape, problem type)
NUMERAL_ITEMS = [
    (6,  ['5', '6', '7'],    1, 'star',   'count-set'),
    (8,  ['8', '9', '7'],    0, 'circle', 'match-set'),
    (10, ['9', '11', '10'],  2, 'square', 'count-set-interleaved'),
    (11, ['12', '11', '10'], 1, 'star',   'match-set-interleaved'),
    (13, ['13', '14', '12'], 0, 'circle', 'count-set'),
    (14, ['15', '41', '14'], 2, 'square', 'match-set'),
    (15, ['15', '16', '14'], 0, 'star',   'count-set-interleaved'),
    (16, ['17', '16', '61'], 1, 'circle', 'match-set-interleaved'),
    (17, ['71', '18', '17'], 2, 'square', 'count-set'),
    (18, ['18', '81', '19'], 0, 'star',   'match-set'),
    (20, ['19', '20', '21'], 1, 'circle', 'count-set-interleaved'),
]

PICTURE_PROMPTS = [
    'Count them. Which group has just as many?',
    'Count them. Which one has the same number?',
    'How many are there? Which group matches?',
]
NUMERAL_PROMPTS = [
    'How many are there?',
    'Which number says how many?',
    'Count them. Which number is it?',
]

TEEN_EXPLANATION = (
    'Count the whole row of ten first, then carry on counting the ones left over. '
    'Ten and four more is fourteen.'
)
PLAIN_EXPLANATION = (
    'Touch each thing once and say the next number. The last number you say is '
    'how many there are.'
)
NUMERAL_EXPLANATION = (
    'Count the things first, then find the number that says the same. The number '
    'is a name for how many.'
)

# One value per measure, each a single step above its prerequisite. See §6.
PICTURE_DIFFICULTY, PICTURE_LOAD = 4, 2
NUMERAL_DIFFICULTY, NUMERAL_LOAD = 5, 3


def build():
    problems = []
    index = 0

    for target, counts, answer_at, spread_at, prompt_shape, card_shape, ptype in PICTURE_ITEMS:
        index += 1
        choices = list(POSITIONS)

        spacings = [TIGHT] * len(counts)
        if spread_at is not None:
            beat = max(width_of(rows_for(c), TIGHT)
                       for slot, c in enumerate(counts) if slot != spread_at)
            spacings[spread_at] = spread_spacing(counts[spread_at], beat - PAD)

        visuals = unify([picture(count, card_shape, spacings[slot])
                         for slot, count in enumerate(counts)])

        rationales = {}
        for slot, count in enumerate(counts):
            if slot == answer_at:
                continue
            if slot == spread_at:
                rationales[choices[slot]] = 'count-by-spread'
            else:
                rationales[choices[slot]] = (
                    'off-by-one-overcount' if count > target else 'off-by-one-undercount'
                )

        problems.append(assemble(
            index=index,
            prompt=PICTURE_PROMPTS[index % len(PICTURE_PROMPTS)],
            answer=choices[answer_at],
            choices=choices,
            rationales=rationales,
            visual={
                # The prompt names its count: for these items the answer is a
                # position, so saying "seven" describes the picture without
                # giving anything away.
                'prompt': picture(target, prompt_shape, TIGHT,
                                  f'A {"group" if target > 10 else "row"} of '
                                  f'{WORDS[target]} shapes'),
                'choices': visuals,
            },
            verification={'mode': 'figure', 'measure': 'count', 'direction': 'match',
                          'measures': counts, 'target': target},
            explanation=TEEN_EXPLANATION if target > 10 else PLAIN_EXPLANATION,
            hint=('Count the full row of ten, then count on for the rest.' if target > 10
                  else 'Touch each thing and count out loud, then start again at one '
                       'for the next group.'),
            rationale_values=rationales.values(),
            difficulty=PICTURE_DIFFICULTY,
            load=PICTURE_LOAD,
            ptype=ptype,
        ))

    for target, numerals, answer_at, shape, ptype in NUMERAL_ITEMS:
        index += 1
        measures = [int(c) for c in numerals]
        flipped = int(str(target)[::-1]) if target in REVERSIBLE else None

        rationales = {}
        for slot, value in enumerate(measures):
            if slot == answer_at:
                continue
            if flipped is not None and value == flipped:
                rationales[numerals[slot]] = 'teen-digits-reversed'
            else:
                rationales[numerals[slot]] = (
                    'off-by-one-overcount' if value > target else 'off-by-one-undercount'
                )

        problems.append(assemble(
            index=index,
            prompt=NUMERAL_PROMPTS[index % len(NUMERAL_PROMPTS)],
            answer=str(target),
            choices=numerals,
            rationales=rationales,
            # The label must not name the count here: the count *is* the answer,
            # and a description that states it hands the item to anyone reading
            # the picture's alternative text instead of the picture.
            visual={'prompt': picture(target, shape, TIGHT, 'A group of shapes')},
            verification={'mode': 'figure', 'measure': 'numeral', 'direction': 'match',
                          'measures': measures, 'target': target},
            explanation=TEEN_EXPLANATION if target > 10 else NUMERAL_EXPLANATION,
            hint=('Say "ten" for the full row, then count the rest on from there.'
                  if target > 10
                  else 'Count the things out loud, then say the last number again '
                       'and look for it.'),
            rationale_values=rationales.values(),
            difficulty=NUMERAL_DIFFICULTY,
            load=NUMERAL_LOAD,
            ptype=ptype,
        ))

    return problems


def assemble(*, index, prompt, answer, choices, rationales, visual, verification,
             explanation, hint, rationale_values, difficulty, load, ptype):
    return {
        'id': f'counting-to-20-{index:02d}',
        'concept_id': 'counting-to-20',
        'prerequisites': ['foundations-count-to-5', 'foundations-match-numeral-to-5'],
        'prompt': prompt,
        'answer': answer,
        'answer_type': 'multiple_choice',
        'choices': choices,
        'distractor_rationales': rationales,
        'visual': visual,
        'verification': verification,
        'explanation': explanation,
        'hint': hint,
        'expected_error_modes': sorted(set(rationale_values)),
        'cognitive_load_level': load,
        'difficulty': difficulty,
        'problem_type': ptype,
        'context': 'a set of picture cards',
        'variant_index': index,
        'interleaved': ptype.endswith('interleaved'),
    }


# --------------------------------------------------------------------------
# the markdown
# --------------------------------------------------------------------------

def drawn_as(target):
    rows = rows_for(target)
    return f'`[{", ".join(str(r) for r in rows)}]`'


def markdown(problems):
    out = []
    w = out.append

    pics = [p for p in problems if p['verification']['measure'] == 'count']
    nums = [p for p in problems if p['verification']['measure'] == 'numeral']

    w('# `counting-to-20` — the first authored batch')
    w('')
    w('> **Status: reviewed, converted.** §7 lists what the review changed and')
    w('> §8 what it could not. The corpus entries and these tables are both')
    w('> generated by `scripts/authoring/counting_to_20.py`, so reading this is')
    w('> reading what was imported — and re-running it leaves `git diff` silent')
    w('> if that is still true.')
    w('>')
    w('> **Not reviewed by an educator.** See §6.')
    w('')
    w('Concept `counting-to-20`, band 6–7, from `docs/curriculum/age-7-bridge.md`')
    w('§3.1. Prerequisites `foundations-count-to-5` and')
    w('`foundations-match-numeral-to-5`, both of which exist.')
    w('')
    w(f'**{len(problems)} problems** — the corpus authors 20 per foundations concept and')
    w('21 is the median across all 63, so this sits at the density of its')
    w('neighbours rather than above it. Between them the two tables use every')
    w('quantity from 6 to 20.')
    w('')
    w('---')
    w('')

    w('## 1. Two item shapes, and what distinguishes them')
    w('')
    w('| | picture-choice | numeral-choice |')
    w('| --- | --- | --- |')
    w('| The child sees | a group, and three more groups | a group, and three numbers |')
    w('| Picks | `"the first one"` … | `"14"` … |')
    w('| `verification.measure` | `count` | `numeral` |')
    w('| Can carry `count-by-spread` | yes | no — nothing is drawn to misjudge |')
    w('| Can carry `teen-digits-reversed` | no — a position cannot express *41* | yes |')
    w(f'| In this batch | {len(pics)} | {len(nums)} |')
    w('')
    w('**`problem_type` does not tell you which shape an item is.** The corpus')
    w('spreads all four types evenly across both — `foundations-count-to-5` has')
    w('five `match-set` items and `foundations-match-numeral-to-5` has five')
    w('`count-set` ones. The field is the pedagogical tag; `verification.measure`')
    w('is the shape. This batch follows that, because departing from it would make')
    w('`counting-to-20` the one concept where the tag means something else.')
    w('')
    w('---')
    w('')

    w('## 2. How a quantity is drawn')
    w('')
    w('Six to ten is one row. **Eleven upwards is a full row of ten and a')
    w('remainder** — `figures` becomes `[10, 4]` under `layout: "stack"`.')
    w('')
    w('What that buys is narrower than it first looks, and the first draft')
    w('overstated it. A bare row of ten is **not** seen as ten; nothing is drawn')
    w('around it, so a child has to count it like anything else. What the split')
    w('does buy is real but smaller: the remainder is left subitisable — four is')
    w('four at a glance in a way fourteen never is — and the ten becomes a chunk')
    w('that recurs identically across every teen item, which is the thing a child')
    w('can eventually learn to take on trust. Ten-frame *recognition* would need a')
    w('frame drawn round it, and the schema has no way to ask for one.')
    w('')
    w('> It is also the reason F0e happened. The gate read `figures[0].count` and')
    w('> would have rejected every teen item here as *"the picture draws 10 but the')
    w('> problem is about 14"*. Chasing that found twelve `foundations` problems')
    w('> the same rule had already condemned and F0b had already corrupted. The')
    w('> rule now sums every group, and this batch is the first content authored')
    w('> against the corrected one.')
    w('')
    w('**One frame across a problem\'s three candidate pictures**, sized to the')
    w('largest — the corpus does this in all 160 problems that have candidate')
    w('pictures, without exception. The reason is `count-by-spread` itself: a card')
    w('sized to its own contents makes the widest card visibly different, and the')
    w('child can answer a question about *how many* without counting.')
    w('')
    w('**Candidates never mix one-row and two-row drawings.** No corpus problem')
    w('does — 0 of 160 — and the reason is the same one: a card with a different')
    w('silhouette can be picked out, or ruled out, without being counted. Given')
    w('the rule above, this has a consequence worth stating outright: **ten and')
    w('eleven can never be candidates on the same table**, because ten draws as')
    w('one row and eleven as two.')
    w('')
    w('---')
    w('')

    w('## 3. Picture-choice items')
    w('')
    w('The prompt group is drawn, then three candidates. `measures` lists what each')
    w('candidate draws, in the order they appear.')
    w('')
    w('| id | draws | shapes | candidates | answer | distractors | type |')
    w('| --- | --- | --- | --- | --- | --- | --- |')
    for p in pics:
        v = p['verification']
        slot = p['choices'].index(p['answer'])
        cand = ', '.join((f'**{c}**' if i == slot else str(c))
                         for i, c in enumerate(v['measures']))
        dis = '; '.join(f'`{r}` ({POSITIONS.index(k) + 1})'
                        for k, r in p['distractor_rationales'].items())
        ps = p['visual']['prompt']['figures'][0]['shape']
        cs = p['visual']['choices'][0]['figures'][0]['shape']
        w(f"| `{p['id']}` | {v['target']} as {drawn_as(v['target'])} | {ps} → {cs} | "
          f"{cand} | {POSITIONS.index(p['answer']) + 1} | {dis} | `{p['problem_type']}` |")
    w('')
    w('The bracketed number is which of the three positions carries that error.')
    w('Difficulty is 4 and cognitive load 2 throughout; §6 says why they are flat.')
    w('')
    w('**The candidates are never drawn in the prompt\'s shape.** The first draft')
    w('used one shape for everything, which made the correct card a pixel-for-pixel')
    w('copy of the prompt — a child could match the two images and never count')
    w('anything. `foundations-count-to-5` switches shape in all twenty of its')
    w('items, and it is switching for exactly this reason.')
    w('')
    w('**`count-by-spread` is computed, not asserted.** The card carrying it holds')
    w('*fewer* shapes than the answer and is spaced so that it is **the widest')
    w('drawing on the table** — wider than the correct card and wider than the')
    w('other distractor. The first draft only made it as wide as the correct card,')
    w('which left the genuinely widest card sitting under `off-by-one-overcount`')
    w('and put the rationale on the wrong option.')
    w('')
    w('It appears only on the single-digit items. Once both pictures open with a')
    w('full row of ten, width stops being something they differ in, and the')
    w('rationale would be a label rather than a fact.')
    w('')
    w('---')
    w('')

    w('## 4. Numeral-choice items')
    w('')
    w('| id | draws | choices | answer | distractors | type |')
    w('| --- | --- | --- | --- | --- | --- |')
    for p in nums:
        v = p['verification']
        cand = ', '.join(f'**{c}**' if c == p['answer'] else c for c in p['choices'])
        dis = '; '.join(f'`{k}` → `{r}`' for k, r in p['distractor_rationales'].items())
        w(f"| `{p['id']}` | {v['target']} as {drawn_as(v['target'])} | {cand} | "
          f"{p['answer']} | {dis} | `{p['problem_type']}` |")
    w('')
    w('Difficulty 5, cognitive load 3 throughout.')
    w('')
    w('### 4.1 `teen-digits-reversed`, and where it does not apply')
    w('')
    w('The new error type: *four-teen* says the four first, so a child writing or')
    w('choosing what they hear reaches for `41`.')
    w('')
    w('**The mechanism needs the name to lead with the unit digit, and most teen')
    w('names do not.** The first draft offered the reversal for 12, 13 and 15 as')
    w('well, and that was wrong:')
    w('')
    w('| number | name | leads with the unit? |')
    w('| --- | --- | --- |')
    w('| 11 | *eleven* | no — no unit is audible at all |')
    w('| 12 | *twelve* | no — nothing in it says *two* |')
    w('| 13 | *thirteen* | eroded — *thir-*, not *three* |')
    w('| 15 | *fifteen* | eroded — *fif-*, not *five* |')
    w('| 14, 16, 17, 18, 19 | *four-*, *six-*, *seven-*, *eigh-*, *nine-* | yes |')
    w('')
    w('So the reversal is offered on **14, 16, 17 and 18** only. Eleven and twelve')
    w('give a child no reason whatever to reach for 11 or 21; thirteen and fifteen')
    w('are arguable and are left out rather than argued for. Nineteen would qualify')
    w('and is a picture item instead. Twenty reverses to `02`, which nobody writes.')
    w('')
    w('This is the difference between an error type and a label. `21` sitting under')
    w('a picture of twelve is not a teen reversal — it is just a wrong number, and')
    w('calling it a reversal would have taught the remediation loop to drill a')
    w('confusion the child never had.')
    w('')
    w('---')
    w('')

    counts = {}
    for p in problems:
        counts.setdefault(p['problem_type'], []).append(p['choices'].index(p['answer']))
    positions = [p['choices'].index(p['answer']) for p in problems]
    spread = [positions.count(i) for i in range(3)]

    w('## 5. What was checked')
    w('')
    w('| | |')
    w('| --- | --- |')
    w(f'| Answer position across the batch | {spread[0]} first, {spread[1]} middle, '
      f'{spread[2]} last — worst share {max(spread) / len(positions):.0%} |')
    w(f'| Interleaved | {sum(1 for p in problems if p["interleaved"])} of {len(problems)} |')
    w('| Problem types | ' + ', '.join(f'`{k}` {len(v)}' for k, v in sorted(counts.items())) + ' |')
    w('| Error types used | ' + ', '.join(
        f'`{e}`' for e in sorted({e for p in problems for e in p['expected_error_modes']})) + ' |')
    w(f'| Quantities covered | every one from 6 to 20 |')
    w('| Every answer among its own choices | yes |')
    w('| No answer used as its own distractor | yes |')
    w('| Picture agrees with `target`, summed over groups | yes, all 22 |')
    w('| Candidates share a silhouette and differ from the prompt in shape | yes, all 11 |')
    w('| `count-by-spread` sits on the widest card | yes, all 4 |')
    w('')
    w('**The position invariant does not examine this batch on its own.**')
    w('`lopsidedTypes` needs twelve problems in a group and 22 split four ways')
    w('gives groups of four to six. What it examines is each type *corpus-wide*,')
    w('where these join the existing members. That is the number that matters, and')
    w('`pnpm audit:corpus` now computes it on every run rather than this document')
    w('asserting it.')
    w('')
    w('---')
    w('')

    w('## 6. What is provisional')
    w('')
    w('`teen-digits-reversed` **has not been reviewed by anyone who teaches')
    w('six-year-olds**. §4.1 narrows it to the four numbers whose names produce')
    w('the mechanism, which makes it a sharper claim than the draft\'s and still')
    w('an untested one. The same caveat covers the other eighteen new error types')
    w('in `age-7-bridge.md` §8.')
    w('')
    w('**The difficulty and load numbers are flat on purpose.** The draft had four')
    w('values — teens harder than single digits, numerals harder than pictures —')
    w('and two things were wrong with that. It put the single-digit picture items')
    w('at difficulty 3, which is `foundations-count-to-5`\'s own number, so the')
    w('batch asserted that counting to nine is exactly as hard as counting to')
    w('five. And the teen/single-digit gap was invented: nobody measured it.')
    w('')
    w('The corpus\'s own practice is one value per concept per measure —')
    w('`foundations-count-to-5` is 3/2 across all twenty of its problems and')
    w('`foundations-match-numeral-to-5` is 4/3 across all twenty of its. So this')
    w('batch carries two numbers, each one step above its prerequisite: **4/2 for')
    w('the picture items, 5/3 for the numeral ones.** That asserts exactly one')
    w('thing — this concept is harder than the two it is built on — and leaves the')
    w('rest to the 3PL parameters, which are learned from attempts rather than')
    w('guessed here.')
    w('')
    w('Counting nineteen things really is harder than counting seven. That')
    w('difference is real and is deliberately not encoded, because no one has')
    w('measured how much harder and a number typed today would be indistinguishable')
    w('from one that had been.')
    w('')
    w('---')
    w('')

    w('## 7. What the review changed')
    w('')
    w('Five defects, none of which any gate can see. They are recorded because the')
    w('batch verified 22 of 22 against the gate **before** they were fixed, which')
    w('is the entire argument for reading the tables.')
    w('')
    w('| # | defect | why no gate catches it |')
    w('| --- | --- | --- |')
    w('| 1 | Prompt and candidates drawn in one shape, so the correct card was a copy of the prompt and could be matched without counting | the gate checks counts, and every count was right |')
    w('| 2 | `count-by-spread` sat on a card that was not the widest; the widest was the off-by-one card | a rationale is a string; nothing compares it to the picture |')
    w('| 3 | One item mixed a one-row candidate with two-row candidates, making it eliminable by silhouette | group counts were internally consistent |')
    w('| 4 | `teen-digits-reversed` claimed for 12, 13 and 15, whose names do not produce it | the distractor is a valid numeral and not the answer |')
    w('| 5 | Difficulty 3 on the single-digit items — the prerequisite\'s own number — and an invented teen/single-digit split | no check reads difficulty at all |')
    w('')
    w('Defects 1, 2 and 3 are about **drawings that are correct and still wrong**:')
    w('every count agreed with every target, and the pictures still handed the')
    w('answer away. Defect 4 is an **invented error type**, which is the failure')
    w('mode `age-7-bridge.md` §8 warns about, caught in its first use. Defect 5 is')
    w('a **formulaic number**, which is what §6 now refuses to produce.')
    w('')
    w('---')
    w('')

    w('## 8. What the review could not fix, and what happened next')
    w('')
    w('**When this batch was reviewed, nothing in the application drew these')
    w('pictures.** The `visual` object was served to the client and handed to')
    w('`MathManipulatives`, which reads `visualData.initialCount`, `.itemType`,')
    w('`.shapeType` and `.formula` — none of which exist in this schema — and')
    w('which drew only when `visualType` was one of five names.')
    w('`InfiniteAdaptiveModal` hardcoded `visualType: undefined` for every')
    w('served problem, so every branch was skipped and the default card')
    w('rendered, printing the prompt text back under the heading *Math')
    w('Expression*.')
    w('')
    w('For a picture-choice item that meant a sentence, the same sentence again')
    w('in monospace, and three buttons reading *the first one*, *the middle')
    w('one*, *the last one*, with nothing drawn to tell them apart. Not hard —')
    w('unanswerable. It was true of all 180 `foundations` problems too, and had')
    w('been since they were imported.')
    w('')
    w('**`src/components/figures/` draws them now.** Every dimension the schema')
    w('states is honoured and only the gaps between figures are derived, because')
    w('`spacing` is what makes a `count-by-spread` card take up more room than')
    w('it should, and a renderer that spread glyphs to fill their frame would')
    w('delete the error the problem is about. The layout is checked against all')
    w('715 pictures in the corpus, and reproduces 182 of the 202 authored prompt')
    w('frames and all 171 choice sets to the pixel.')
    w('')
    w('So the drawing decisions in §2 and §3 — the ten-and-remainder split, the')
    w('shape switch, the spread card, the shared silhouette — have now been')
    w('looked at rather than only reasoned about. They hold up: fourteen reads')
    w('as ten and four, and the spread card is visibly the widest of the three.')
    w('')
    w('> One thing that only showed up in the drawing. The corpus has **three**')
    w('> figure forms, not two: a glyph run, a bar, and a bare shape carrying')
    w('> neither `count` nor `length`. The third is 500 of the 1,083 figures and')
    w('> is how `compare-size`, `odd-one-out`, `pattern-abab` and')
    w('> `match-identical` are drawn. Reading a missing `count` as zero rendered')
    w('> those four concepts — 80 problems — as empty frames, and the layout')
    w('> test passed anyway, because it compared the glyphs asked for against')
    w('> the glyphs drawn and both were zero. It was caught by looking at the')
    w('> output, which is §5.1 arriving one layer further down.')
    w('')
    return '\n'.join(out) + '\n'


if __name__ == '__main__':
    built = build()
    io.open(sys.argv[1], 'w', encoding='utf-8', newline='\n').write(markdown(built))
    if len(sys.argv) > 2:
        io.open(sys.argv[2], 'w', encoding='utf-8', newline='\n').write(
            json.dumps(built, indent=2, ensure_ascii=False) + '\n')
    print(f'{len(built)} problems')
