"""
Re-derives every generated answer with SymPy, independently of the TypeScript
that produced it.

The point of this file is that it does *not* trust `problemGenerator.ts`. Each
problem carries its own parameters in `visualData` — the counts, the roots, the
coefficients — so the answer can be computed a second time, in a second
language, by a computer algebra system, and compared. A generator that computes
its own answer and then checks it against itself proves nothing.

Three things are checked here that a structural pass cannot see:

  correctness      the declared answer equals the one SymPy derives
  value distinctness   no two options are the *same number* wearing different
                       text — `1/-1` and `-1` are distinct strings and identical
                       values, and a learner who picks the first is right and
                       marked wrong
  reachability     each distractor is what its tagged misconception would
                   actually produce; a tag that cannot produce its own
                   distractor is decoration, not diagnosis

Usage:
    python scripts/verify_generated.py <sample.json> <out-validation.json>

Exits non-zero when any check fails, so it can be a CI step on its own.
"""

from __future__ import annotations

import json
import re
import sys
from collections import Counter

import sympy as sp


# --------------------------------------------------------------------------
# parsing
# --------------------------------------------------------------------------

# Surface forms the generator emits for exact values. Written as a table rather
# than a regex so an unrecognised form fails loudly instead of being coerced
# into something plausible.
SURD_FORMS = {
    "√3/2": sp.sqrt(3) / 2,
    "√2/2": sp.sqrt(2) / 2,
    "√3/3": sp.sqrt(3) / 3,
    "√3": sp.sqrt(3),
    "√2": sp.sqrt(2),
}


class Unparsed(Exception):
    """The option is not in a form this verifier claims to understand."""


def parse_value(text: str):
    """A single exact numeric value from the generator's option text."""
    raw = text.strip()
    if raw in SURD_FORMS:
        return SURD_FORMS[raw]

    raw = raw.replace(" sq units", "").replace(" units", "").strip()

    # `1/-2`, `-3/4`, `7/1` — the generator builds these by interpolation, so
    # the sign can land on either side of the slash.
    if re.fullmatch(r"-?\d+\s*/\s*-?\d+", raw):
        num, den = raw.split("/")
        if int(den) == 0:
            raise Unparsed(f"zero denominator in {text!r}")
        return sp.Rational(int(num), int(den))

    if re.fullmatch(r"-?\d+", raw):
        return sp.Integer(int(raw))

    raise Unparsed(f"cannot parse {text!r}")


def strip_prefix(text: str, *prefixes: str) -> str:
    out = text.strip()
    for prefix in prefixes:
        if out.startswith(prefix):
            out = out[len(prefix):].strip()
    return out


def parse_root_set(text: str):
    """`x = 4, x = -1` -> the set {4, -1}."""
    parts = [p for p in text.split(",") if p.strip()]
    roots = []
    for part in parts:
        roots.append(parse_value(strip_prefix(part, "x =")))
    return sp.FiniteSet(*roots)


X = sp.Symbol("x")


def parse_polynomial(text: str):
    """`f'(x) = 8x^2 + 3` -> the SymPy expression 8*x**2 + 3."""
    body = strip_prefix(text, "f'(x) =", "f(x) =")
    # `8x^2` -> `8*x**2`; the generator never emits an explicit `*`.
    body = body.replace("^", "**")
    body = re.sub(r"(\d)(x)", r"\1*\2", body)
    try:
        return sp.sympify(body, locals={"x": X})
    except (sp.SympifyError, SyntaxError, TypeError) as exc:
        raise Unparsed(f"cannot parse polynomial {text!r}: {exc}") from exc


# --------------------------------------------------------------------------
# per-variant derivations
#
# Each returns (expected_answer, comparator, reachability) where:
#   expected_answer  what the correct option must equal
#   comparator       'value' | 'set' | 'expr' | 'text'
#   reachability     {MISCONCEPTION_CODE: [values that error would produce]}
# A code absent from `reachability` is reported as unchecked rather than passed.
# --------------------------------------------------------------------------


def derive_early_bond(v):
    a, total = v["filled"], v["target"]
    b = total - a
    return (
        sp.Integer(b),
        "value",
        {"OFF_BY_ONE_COUNTING": [sp.Integer(b + 1), sp.Integer(b - 1), sp.Integer(b + 2)],
         "GENERAL_CALCULATION_SLIP": [sp.Integer(total), sp.Integer(a)]},
    )


def derive_early_add(v):
    a, b = v["red"], v["green"]
    total = a + b
    return (
        sp.Integer(total),
        "value",
        {"OFF_BY_ONE_COUNTING": [sp.Integer(total + 1), sp.Integer(total - 1), sp.Integer(total + 2)],
         "SIGN_ERROR": [sp.Integer(abs(a - b))]},
    )


def derive_elem_frac(v):
    num, den = v["comparisonNumerator"], v["comparisonDenominator"]
    base_num = v["numerator"]
    # The answer is a specific surface form, not merely an equivalent value: the
    # question asks which listed fraction is equivalent, and both 2/4 and 1/2 are
    # equivalent to 1/2 while only one is on offer.
    return (
        f"{num}/{den}",
        "text",
        {"OFF_BY_ONE_COUNTING": [f"{num + 1}/{den}"],
         "INVERTED_FRACTION": [f"{den}/{num}"],
         "DISTRIBUTIVE_OMISSION": [f"{base_num}/{den}", f"{num}/{den + 1}"]},
    )


def derive_elem_mult(v):
    a, b = v["cols"], v["rows"]
    product = a * b
    return (
        sp.Integer(product),
        "value",
        {"ADDITIVE_INSTEAD_OF_MULTIPLICATIVE": [sp.Integer(product + b)],
         "GENERAL_CALCULATION_SLIP": [sp.Integer(product - 10)],
         "DISTRIBUTIVE_OMISSION": [sp.Integer(a * 10 - b), sp.Integer((a // 10) * 10 * b)]},
    )


def derive_elem_geom(v):
    length, width = v["length"], v["width"]
    area = length * width
    perimeter = 2 * (length + width)
    return (
        sp.Integer(area),
        "value",
        {"ADDITIVE_INSTEAD_OF_MULTIPLICATIVE": [sp.Integer(perimeter)],
         "OFF_BY_ONE_COUNTING": [sp.Integer(area + length), sp.Integer(area + width)],
         "DISTRIBUTIVE_OMISSION": [sp.Integer(length + width)]},
    )


def derive_mid_linear(v):
    a, b, c = v["a"], v["b"], v["c"]
    # Solved by SymPy rather than read from visualData.x, so a generator that
    # miscomputes c is caught instead of being confirmed by its own bookkeeping.
    expected = sp.solve(sp.Eq(a * X + b, c), X)[0]
    return (
        expected,
        "value",
        {"SIGN_ERROR": [-expected, sp.Rational(c + b, a)],
         "OFF_BY_ONE_COUNTING": [expected + 1, expected - 1, expected + 2]},
    )


def derive_mid_integers(v):
    p, q = v["left"], v["right"]
    total = p + q
    return (
        sp.Integer(total),
        "value",
        {"ADDITIVE_INSTEAD_OF_MULTIPLICATIVE": [sp.Integer(abs(p) + q)],
         "SIGN_ERROR": [sp.Integer(-total)],
         "ORDER_OF_OPERATIONS": [sp.Integer(p - q)],
         "OFF_BY_ONE_COUNTING": [sp.Integer(total + 1)]},
    )


def derive_mid_slope(v):
    x1, y1, x2, y2 = v["x1"], v["y1"], v["x2"], v["y2"]
    dx, dy = x2 - x1, y2 - y1
    if dx == 0:
        raise Unparsed("vertical line has undefined slope")
    slope = sp.Rational(dy, dx)
    reach = {
        "SIGN_ERROR": [sp.Rational(-dy, dx)],
        "GENERAL_CALCULATION_SLIP": [sp.Rational(dy + dx, dx), sp.Rational(dy, dx + 1)] if dx + 1 != 0 else [sp.Rational(dy + dx, dx)],
    }
    if dy != 0:
        reach["COORDINATE_AXIS_SWAP"] = [sp.Rational(dx, dy)]
    return (slope, "value", reach)


def derive_high_quad(v):
    b, c = v["b"], v["c"]
    roots = sp.solve(sp.Eq(X ** 2 + b * X + c, 0), X)
    expected = sp.FiniteSet(*roots)

    # Sign errors on either or both factors. Built from the roots SymPy derived,
    # not from the pair the generator recorded.
    if len(roots) == 2:
        a, b_root = roots
        sign_variants = [
            sp.FiniteSet(-a, -b_root),
            sp.FiniteSet(a, -b_root),
            sp.FiniteSet(-a, b_root),
        ]
        # SymPy returns the roots as an unordered pair, so which one the
        # generator called r1 is unknowable here. Every off-by-one form is
        # therefore admitted under both assignments.
        slips = []
        for r1, r2 in ((a, b_root), (b_root, a)):
            slips += [
                sp.FiniteSet(r1 + 1, r2 - 1),
                sp.FiniteSet(r1 - 1, r2 + 1),
                sp.FiniteSet(r1 + 1, r2),
                sp.FiniteSet(r1, r2 - 1),
                sp.FiniteSet(r1 + 2, r2 + 2),
            ]
    else:
        # A repeated root. Flipping the sign of one of the two identical factors
        # is still a sign error, and yields {r, -r} rather than {-r}, so both
        # forms have to be admissible here.
        (r,) = roots
        sign_variants = [sp.FiniteSet(-r), sp.FiniteSet(r, -r)]
        slips = [sp.FiniteSet(r + 1, r - 1), sp.FiniteSet(r, r - 1), sp.FiniteSet(r + 1, r), sp.FiniteSet(r + 2)]

    return (expected, "set", {"SIGN_ERROR": sign_variants, "GENERAL_CALCULATION_SLIP": slips})


def derive_high_calc(v):
    a, n, b = v["a"], v["n"], v["b"]
    expected = sp.expand(sp.diff(a * X ** n + b * X - 7, X))
    return (
        expected,
        "expr",
        {"DISTRIBUTIVE_OMISSION": [sp.expand(a * X ** (n - 1) + b), sp.expand(a * X ** n + b)],
         "ORDER_OF_OPERATIONS": [sp.expand(a * n * X ** n + b)],
         "RECIPROCAL_MISAPPLIED": [sp.expand(a * n * X ** (n - 1))]},
    )


TRIG_TRUTH = {
    "sin(π/6) or sin(30°)": sp.Rational(1, 2),
    "cos(π/3) or cos(60°)": sp.Rational(1, 2),
    "sin(π/4) or sin(45°)": sp.sqrt(2) / 2,
    "cos(π) or cos(180°)": sp.Integer(-1),
    "tan(π/4) or tan(45°)": sp.Integer(1),
}


def derive_high_trig(v):
    query = v["query"]
    if query not in TRIG_TRUTH:
        raise Unparsed(f"no independent truth for {query!r}")
    # The three wrong values per item are authored, not computed, so there is no
    # arithmetic rule to check them against. Reported as unchecked rather than
    # passed, so the coverage hole stays visible in the report.
    return (TRIG_TRUTH[query], "value", {})


DERIVATIONS = {
    "early-bond": derive_early_bond,
    "early-add": derive_early_add,
    "elem-frac": derive_elem_frac,
    "elem-mult": derive_elem_mult,
    "elem-geom": derive_elem_geom,
    "mid-linear": derive_mid_linear,
    "mid-integers": derive_mid_integers,
    "mid-slope": derive_mid_slope,
    "high-quad": derive_high_quad,
    "high-calc": derive_high_calc,
    "high-trig": derive_high_trig,
    # `early-pat` is a symbol sequence with no numeric content; it is checked
    # structurally in generator-invariants.ts and counted as unverifiable here
    # rather than silently passed.
}


# --------------------------------------------------------------------------
# comparison
# --------------------------------------------------------------------------

def as_comparable(text: str, mode: str):
    if mode == "text":
        return text.strip()
    if mode == "set":
        return parse_root_set(strip_prefix(text, ""))
    if mode == "expr":
        return sp.expand(parse_polynomial(text))
    return parse_value(strip_prefix(text, "x =", "m ="))


def equal(left, right, mode: str) -> bool:
    if left is None or right is None:
        return False
    if mode == "text":
        return str(left) == str(right)
    if mode == "set":
        return sp.FiniteSet(*left) == sp.FiniteSet(*right)
    if mode == "expr":
        return sp.simplify(left - right) == 0
    return sp.simplify(left - right) == 0


# --------------------------------------------------------------------------
# the run
# --------------------------------------------------------------------------

def verify(sample):
    failures = []
    checked = Counter()
    unverifiable = Counter()
    unchecked_reach = Counter()

    for problem in sample:
        kind = problem["kind"]
        pid = problem["id"]
        derive = DERIVATIONS.get(kind)

        if derive is None:
            unverifiable[kind] += 1
            continue

        try:
            expected, mode, reachability = derive(problem.get("visualData") or {})
        except (Unparsed, KeyError, TypeError, ZeroDivisionError) as exc:
            failures.append({"check": "derivation", "kind": kind, "id": pid, "detail": str(exc)})
            continue

        # --- the declared answer is the derived one -----------------------
        try:
            declared = as_comparable(problem["correctAnswer"], mode)
        except Unparsed as exc:
            failures.append({"check": "parse-correct", "kind": kind, "id": pid, "detail": str(exc)})
            continue

        if not equal(declared, expected, mode):
            failures.append({
                "check": "wrong-answer",
                "kind": kind,
                "id": pid,
                "detail": f"declared {problem['correctAnswer']!r}, SymPy derives {expected}",
            })
            continue

        checked[kind] += 1

        # --- no two options are the same value ----------------------------
        parsed_options = []
        for option in problem["options"]:
            try:
                parsed_options.append((option, as_comparable(option, mode)))
            except Unparsed:
                # An unparseable option cannot be compared by value. It is still
                # covered by the string-distinctness check on the JS side.
                parsed_options.append((option, None))

        for i in range(len(parsed_options)):
            for j in range(i + 1, len(parsed_options)):
                (text_i, val_i), (text_j, val_j) = parsed_options[i], parsed_options[j]
                if val_i is None or val_j is None or text_i == text_j:
                    continue
                if equal(val_i, val_j, mode):
                    failures.append({
                        "check": "duplicate-value",
                        "kind": kind,
                        "id": pid,
                        "detail": f"{text_i!r} and {text_j!r} are both {val_i}",
                    })

        # --- each distractor is what its tag would produce ----------------
        for option, code in (problem.get("distractorDiagnostics") or {}).items():
            if option == problem["correctAnswer"]:
                continue  # flagged by the structural gate; not this gate's job
            produced = reachability.get(code)
            if produced is None:
                unchecked_reach[f"{kind}:{code}"] += 1
                continue
            if not produced:
                continue  # deliberately unconstrained, e.g. a catch-all slip
            try:
                value = as_comparable(option, mode)
            except Unparsed:
                continue
            if not any(equal(value, candidate, mode) for candidate in produced):
                failures.append({
                    "check": "unreachable-distractor",
                    "kind": kind,
                    "id": pid,
                    "detail": f"{option!r} tagged {code}, which produces {sorted(map(str, produced))}",
                })

    return failures, checked, unverifiable, unchecked_reach


def main() -> None:
    if len(sys.argv) != 3:
        print(__doc__)
        raise SystemExit(2)

    sample_path, out_path = sys.argv[1], sys.argv[2]
    with open(sample_path, encoding="utf-8") as handle:
        sample = json.load(handle)

    failures, checked, unverifiable, unchecked_reach = verify(sample)

    # Collapse repeated failures so the report stays readable; the count is what
    # matters and one example is enough to reproduce.
    grouped = {}
    for failure in failures:
        key = f"{failure['check']} :: {failure['kind']}"
        entry = grouped.setdefault(key, {"count": 0, "example": failure["detail"], "example_id": failure["id"]})
        entry["count"] += 1

    report = {
        "sample_size": len(sample),
        "sympy_verified_count": sum(checked.values()),
        "verified_by_kind": dict(sorted(checked.items())),
        "unverifiable_by_kind": dict(sorted(unverifiable.items())),
        "reachability_unchecked": dict(sorted(unchecked_reach.items())),
        "failure_count": len(failures),
        "failures": dict(sorted(grouped.items(), key=lambda kv: -kv[1]["count"])),
        "passed": not failures,
    }

    with open(out_path, "w", encoding="utf-8") as handle:
        json.dump(report, handle, indent=2, ensure_ascii=False)
        handle.write("\n")

    print(f"sample {len(sample)} · sympy-verified {report['sympy_verified_count']} · failures {len(failures)}")
    for key, entry in report["failures"].items():
        print(f"  - {key} — {entry['count']} occurrence(s), e.g. {entry['example']}")
    if unchecked_reach:
        print("  reachability not mechanically checked for:")
        for key, count in sorted(unchecked_reach.items()):
            print(f"    · {key} ({count})")

    raise SystemExit(0 if report["passed"] else 1)


if __name__ == "__main__":
    main()
