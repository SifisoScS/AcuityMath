"""Render the reviewed `counting-to-20` batch as the `bridge` strand.

The problems come from `counting_to_20.py` — the same function that renders the
markdown tables — so the strand file and the reviewed document cannot disagree
about what was authored.

Usage:  python build_bridge_strand.py <data/curriculum dir>
"""
import io
import json
import os
import sys

from counting_to_20 import build

CONCEPT = {
    'id': 'counting-to-20',
    'title': 'Counting to twenty',
    'description': 'Count a group past five, and read the number that names how many',
    'prerequisites': ['foundations-count-to-5', 'foundations-match-numeral-to-5'],
    'problem_types': [
        'count-set', 'match-set', 'count-set-interleaved', 'match-set-interleaved',
    ],
    'error_types': [
        'off-by-one-overcount', 'off-by-one-undercount', 'count-by-spread',
        'teen-digits-reversed',
    ],
}

PATHWAY = {
    'id': 'pathway-brg-01',
    'concept_id': 'counting-to-20',
    'title': 'Counting to twenty',
    'entry_criteria': {'mastery_below': 80},
    'exit_criteria': {'mastery_at_least': 80, 'accuracy_at_least': 75},
    'branches': ['advance'],
    'remediation_loops': CONCEPT['error_types'],
}

OVER_UNDER = ['off-by-one-overcount', 'off-by-one-undercount']
SPREAD = ['count-by-spread']
REVERSED = ['teen-digits-reversed']

# (error types, cognitive state, style, scaffold, content)
HINTS = [
    (OVER_UNDER, 'confusion', 'concrete-example', 1,
     'Touch each thing in the question picture and count out loud together: one, '
     'two, three. Do not ask for an answer yet.'),
    (OVER_UNDER, 'uncertain', 'error-location', 1,
     'Count it again, slower, and watch that each thing is touched once. Counting '
     'one thing twice, or skipping one, is where the number goes wrong.'),
    (OVER_UNDER, 'procedural-stuck', 'symbolic-hint', 2,
     'Say the last number again after counting. The last number you say is how '
     'many there are — it is not just the name of the last thing.'),
    (OVER_UNDER, 'conceptual-gap', 'analogical-explanation', 2,
     'Move each thing aside as it is counted, if they can be moved. What is left '
     'to count gets smaller, so nothing is counted twice.'),
    (SPREAD, 'conviction-error', 'counter-example', 2,
     'Put four things close together and four things spread far apart, and count '
     'both. Taking up more room is not the same as being more.'),
    (SPREAD, 'confusion', 'error-location', 1,
     'Do not choose by which picture looks biggest. Count one, say the number, '
     'then count the next.'),
    (REVERSED, 'conceptual-gap', 'concrete-example', 2,
     'Fourteen is ten and four. Count the full row of ten first, say "ten", then '
     'count the rest on: eleven, twelve, thirteen, fourteen.'),
    (REVERSED, 'conviction-error', 'counter-example', 3,
     'Fourteen says the four first but writes the one first. Point at 41 and count '
     'out that many — it is far more than the picture shows.'),
    (REVERSED, 'uncertain', 'symbolic-hint', 2,
     'For a teen number the 1 comes first, because the ten comes first. 14 is ten '
     'and four; 41 would be four tens.'),
    (OVER_UNDER + REVERSED, 'procedural-stuck', 'analogical-explanation', 3,
     'Count the ten, then the ones left over, then say the whole name: ten and '
     'six is sixteen.'),
    (OVER_UNDER, 'confusion', 'concrete-example', 1,
     'Start again at one for each new group. The count does not carry over from '
     'the picture before it.'),
    (SPREAD + OVER_UNDER, 'uncertain', 'error-location', 2,
     'Two groups can look different and still be the same number. The only way to '
     'know is to count both.'),
]


def hint_pool():
    hints = []
    for index, (errors, state, style, scaffold, content) in enumerate(HINTS, start=1):
        hints.append({
            'id': f'counting-to-20-hint-{index:02d}',
            'concept_id': 'counting-to-20',
            'prerequisite_knowledge_points': CONCEPT['prerequisites'],
            'error_types': errors,
            'cognitive_state': state,
            'difficulty_level': 4,
            'hint_style': style,
            'scaffold_level': scaffold,
            'content': content,
            # What the corpus means by this field, and what it does not. Import
            # drops anything false, so a hint marked unverified is a hint the
            # concept does not have. All 572 existing hints are `true`. It means
            # "written deliberately, not generated" — it has never meant "read by
            # a teacher", and §6 of the batch document says so where it counts.
            'verified': True,
        })
    return {
        'schema_version': '1.0.0',
        'strand': 'bridge',
        'hint_count': len(hints),
        'hints': hints,
    }


def curriculum(problems):
    return {
        'schema_version': '1.0.0',
        'strand': 'bridge',
        'concepts': [CONCEPT],
        'pathways': [PATHWAY],
        'problems': problems,
    }


def write(path, payload):
    io.open(path, 'w', encoding='utf-8', newline='\n').write(
        json.dumps(payload, indent=2, ensure_ascii=False) + '\n')


if __name__ == '__main__':
    out = sys.argv[1]
    problems = build()

    # Every error type a problem uses must be one the concept declares, or the
    # remediation loop has nowhere to send a child who makes it.
    declared = set(CONCEPT['error_types'])
    used = {e for p in problems for e in p['expected_error_modes']}
    assert used <= declared, f'undeclared error types: {sorted(used - declared)}'
    assert {p['problem_type'] for p in problems} <= set(CONCEPT['problem_types'])

    write(os.path.join(out, 'bridge-curriculum.json'), curriculum(problems))
    write(os.path.join(out, 'bridge-hint-pool.json'), hint_pool())
    print(f'bridge strand: 1 concept, {len(problems)} problems, {len(HINTS)} hints')
