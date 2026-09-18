"""Evaluate the authored corpus's own verification expressions.

The corpus was written to be checked. Every problem carries a `verification`
object, and 784 of the 1,132 carry an `expression` with the value its author
computed. Nothing ever evaluated them: `verify_generated.py` reads a sample
drawn from `ProblemGenerator`, so the symbolic gate has only ever covered
generated problems.

This is the missing half. It reads `{id, expression}` pairs on stdin as JSON and
writes `{id, value}` or `{id, error}` back, and it deliberately does **not**
compare anything — the comparison is a three-way cross-check in
`corpusVerification.ts`, where it can be unit-tested without a Python process.

**An expression that cannot be evaluated is an error, never a silent skip.**
The first version of the scan that found the twelve defective problems returned
a null for anything it could not resolve and its caller skipped nulls, so it
passed over exactly the cases it existed to catch and reported success. Every
path below returns either a value or a named error.
"""

from __future__ import annotations

import json
import sys
from typing import Any

try:
    from sympy import sympify
    from sympy.core.sympify import SympifyError
except ImportError:  # pragma: no cover - the caller reports this legibly
    print(json.dumps({"fatal": "sympy is not installed"}))
    sys.exit(2)


def evaluate(expression: str) -> dict[str, Any]:
    """One expression, as a float or a named failure."""
    text = (expression or "").strip()
    if not text:
        return {"error": "empty expression"}

    try:
        parsed = sympify(text, rational=True)
    except (SympifyError, SyntaxError, TypeError) as error:
        return {"error": f"could not parse: {error}".replace("\n", " ")[:200]}

    if parsed.free_symbols:
        # An expression with an unbound symbol has no single value. The corpus
        # substitutes before storing — "2*2 + 1", not "2*x + 1" — so a free
        # symbol means the substitution never happened.
        names = ", ".join(sorted(str(s) for s in parsed.free_symbols))
        return {"error": f"unbound symbol(s): {names}"}

    try:
        value = float(parsed.evalf())
    except (TypeError, ValueError) as error:
        return {"error": f"not a real number: {error}".replace("\n", " ")[:200]}

    if value != value or value in (float("inf"), float("-inf")):
        return {"error": "evaluates to a non-finite value"}

    return {"value": value}


def main() -> int:
    payload = json.load(sys.stdin)
    results = []
    for item in payload:
        outcome = evaluate(item.get("expression", ""))
        results.append({"id": item["id"], **outcome})
    json.dump(results, sys.stdout)
    return 0


if __name__ == "__main__":
    sys.exit(main())
