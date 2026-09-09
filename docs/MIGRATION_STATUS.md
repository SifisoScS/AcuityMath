# Migration status

**Last updated: 8 September 2026.** The resumption point for grafting the
Sovereign Mathematical Learning Engine's spine under AcuityMath.

Read this first if you are picking the work up cold. It records what is done,
what is next, which decisions are settled, and the traps that cost time so they
do not cost it twice.

---

## The strategy, in one paragraph

AcuityMath is the product; the Sovereign Mathematical Learning Engine is the
parts bin. AcuityMath has the better product design — manipulatives, age
tiering, bilingual scaffolding, a working problem generator — and the engine has
the better system: real persistence, verified content, magic-link auth, and test
discipline. What makes AcuityMath good lives in the top 20% of the stack; what
was missing is the bottom 80%. The work is four independent grafts, ordered so
each ships alone.

Full plan, with the reasoning and the five corrections it makes to the original
integration proposal: <https://claude.ai/code/artifact/910a15a9-58dd-4acc-a8c5-2ace4243959b>

Donor repository, read-only reference:
`C:\Users\sifis\mathematics\Sovereign-Mathematical-Learning-Engine-`

---

## Where things stand

| Graft | Scope | State |
| --- | --- | --- |
| **A** | Generator verification, CI, test infrastructure | **Done**, merged to `main` (PR #1) |
| **B1** | Schema, migration, identity model | **Done**, merged to `main` (PR #3) |
| **B2** | Answer pipeline, mastery curve, test isolation | **Done**, open in **PR #4** — not yet in `main` |
| **B3** | tRPC routers, `App.tsx` state lift, content seeding | **Next** |
| **C** | Auth, de-Manusing, child access | Not started |
| **D** | Content import, offline queue on IndexedDB | Not started |

> **First thing tomorrow:** PR #4 carries the answer pipeline and this document.
> It missed the PR #3 merge window by a few minutes. Merge it before branching
> anything new, or B3 will be built on a `main` that has no `recordAttempt`.

Local checkout: `C:\Users\sifis\Math-Analysis\AcuityMath`
Working branch: `graft-b-schema`

---

## Getting running again

```bash
# 1. The database. Port 3307 deliberately, to avoid colliding with a local 3306.
docker run -d --name acuitymath-mysql \
  -e MYSQL_ROOT_PASSWORD=root -e MYSQL_DATABASE=acuitymath \
  -p 3307:3306 mysql:8.4

# If it already exists from last session:
docker start acuitymath-mysql

# 2. Environment
export DATABASE_URL="mysql://root:root@127.0.0.1:3307/acuitymath"

# 3. Dependencies and schema
pnpm install
pnpm db:migrate
```

Toolchain this was built against: Node 23.9, pnpm 11.21, Python 3.12.10 with
SymPy 1.13.1, MySQL 8.4. Python and SymPy are **not optional** — half the
generator integrity gate is written in them.

### Commands

| Command | What it does |
| --- | --- |
| `pnpm test` | Everything. 119 tests; integration suites skip without `DATABASE_URL` |
| `pnpm test:integration` | Only the suites needing a database |
| `pnpm audit:generator` | Both halves of the content gate, writes `data/generator-validation.json` |
| `pnpm lint` | `tsc --noEmit` |
| `pnpm db:generate` | New migration from a schema change |
| `pnpm db:migrate` | Apply migrations |
| `pnpm build` | Client bundle plus server bundle |

CI runs these in order: schema/migration → generator gate → typecheck → test →
build.

---

## What is done

### Graft A — the content gate

`problemGenerator.ts` emits an unbounded number of questions that nobody reads,
so the gate stands in for the missing review. Two halves, because two classes of
defect exist and neither tool sees the other's:

- `scripts/generator-invariants.ts` — structure. Duplicated options, undiagnosed
  distractors, the answer tagged as a misconception, IRT parameters out of range.
- `scripts/verify_generated.py` — mathematics. Re-derives every answer with
  SymPy from the problem's own parameters, sharing no code with the generator.

`scripts/generator-sample.ts` seeds `Math.random` and `Date.now`, so a CI failure
reproduces locally by running the same command.

**It found, in shipped code:** 3,534 structural violations and 916 mathematical
ones across 6,720 problems. `mid-integers` offered a duplicate on *every*
question. `mid-slope` offered `-1` and `1/-1` as separate options, so a learner
picking the second was right and marked wrong. Full list in
[GENERATOR_INTEGRITY.md](GENERATOR_INTEGRITY.md). All fixed via one
`assembleOptions` function that owns distractor selection.

### Graft B1 — the schema

21 tables, one migration, and the decision the whole graft turns on. `users`
holds adults who authenticate; `learners` holds children who do not;
**`guardian_id` is deliberately not unique**; all fourteen learner-scoped tables
key on `learner_id`.

Foreign keys are declared, which the donor engine does not do — its integrity
gate exists because nothing at the storage level rejects an orphan.

### Graft B2 — the answer pipeline

`server/learning/recordAttempt.ts`. One answer, six tables, one transaction.
Correctness decided from the stored problem, never from the client. Wrong
answers diagnosed only where the generator predicted them.

`server/learning/mastery.ts` holds the curve, pure and separately tested.

---

## What is next: Graft B3

Three pieces, in dependency order.

### 1. tRPC routers over the existing helpers

The helpers exist and are tested; nothing exposes them yet. Add tRPC 11 with
Zod input validation, and procedures scoped so a guardian can only reach their
own learners — the scoping is the security boundary and should be tested as one,
not assumed.

Minimum surface for the practice loop: list learners for the signed-in guardian,
start a session, fetch the next problem, submit an attempt, read a learner
snapshot.

### 2. Lift `App.tsx`

**The largest single task in the whole migration.** `src/App.tsx` is 1,424 lines
holding **35 `useState` hooks**; only two files in the repo touch `localStorage`
and there are 13 `apiService` call sites, so the state lives in component memory
rather than in storage. It becomes server-backed queries.

Do it in slices behind `src/App.smoke.test.tsx`, which exists precisely as the
tripwire for this: it pins that the app renders with no reachable API, that the
four tiers are in the nav, and that the three role-gated surfaces are reachable.

### 3. Seed real content

Import the engine's **1,132 SymPy-verified problems** into `problems` and
`problem_distractors`. They live in
`<engine>/data/*-curriculum.json` with validation artifacts beside them.

Know where they land: fractions→algebra 500, algebra 252, geometry 200 land in
middle/high; foundations 180 is early but heavily templated
(`unique_prompt_ratio: 0.1`). **Ages 6–10 is thin in both repositories** — the
import does not fix it.

---

## Decisions that are settled

Do not relitigate these without a reason that is new.

| Decision | Why |
| --- | --- |
| **Guardian → many learners** | Sarah Jenkins with four children *is* AcuityMath. The engine's `.unique()` model cannot express it, and re-keying later touches a dozen tables |
| **MySQL, not Postgres** | The Phase 1 doc said Postgres, but every donor migration and seed is MySQL and Drizzle abstracts the rest |
| **Foreign keys declared** | Moves orphan detection from a test into the storage engine |
| **pnpm, not bun** | One lockfile, and it is the one with the patch in it |
| **Mastery and theta are separate models** | Per-concept knowledge and cross-concept difficulty answer different questions |
| **Learner PIN/QR/picture are not credentials** | They resolve a child inside an authenticated guardian session; they cannot start one. This is the COPPA story |
| **LTI 1.3 deferred** | Greenfield in both repos, and no district pilots before auth is real |

---

## Traps, and what they cost

Each of these looked like something else first.

**pnpm build approvals live in exactly one place.** `pnpm.onlyBuiltDependencies`
in `package.json` is no longer read. The same key as a *list* in
`pnpm-workspace.yaml` is silently ignored by 11.21. `only-built-dependencies[]`
in `.npmrc` is silently ignored. Only an **`allowBuilds` map** in
`pnpm-workspace.yaml` works — which is what `pnpm approve-builds` writes.

Worse, a local install *appears* to accept all of them, because pnpm
short-circuits on "Already up to date" and never re-evaluates. **Verify any
change with a cold `pnpm install --frozen-lockfile` in an empty directory.**
This cost one red CI run.

**Vitest and Vite must be on matching lines.** Vitest 2 bundles Vite 5's types
while this project is on Vite 6; `defineConfig` then rejects the React plugin
with an unreadable variance error. Vitest 3 fixes it.

**Integration suites need separate databases.** Vitest runs files in parallel. A
concept seeded by the pipeline suite turned up in the schema suite's age-band
assertion, and the failure read as a schema defect. `server/test-support/database.ts`
gives each suite its own database. Do not "fix" this by serialising the files —
that leaves the hazard for whoever forgets the flag.

**A skipping suite is worse than a missing one.** The integration suites *throw*
rather than skip when `DATABASE_URL` is absent and `CI` is set. A suite that
skips itself reports green while covering nothing, which is how the donor engine
shipped three defects its seeds only revealed on first execution.

**Mastery must round outward.** With `Math.round`, a learner at 97 answering
correctly computes 97.4 and is shown 97 again — the answer reads as not counting.
`correctAnswersToReach` steps the curve rather than inverting it, because the
closed form is out by an answer once the rounding accumulates.

---

## Still-open questions

Answers change what gets built; none block B3.

1. **Is there a pilot date?** It decides whether the ages 6–10 content gap is a
   tracked project or an emergency.
2. **Does the Gemini coach stay as it is?** `server/gemini.ts` already does this
   correctly with a deterministic fallback. Simplest answer is to keep it and
   delete the engine's `_core/llm.ts` equivalent rather than port it.
3. **Who authors curriculum for ages 6–10?** The verification pipeline makes
   generated content trustworthy; it cannot invent pedagogy for a band neither
   repository covers.

---

## Known gaps

Recorded rather than hidden.

- **`early-pat`** has no numeric content, so it is checked structurally and
  counted under `unverifiable_by_kind` in the validation report.
- **`high-trig`** distractors are authored rather than computed, so reachability
  cannot be checked by re-derivation. They appear under
  `reachability_unchecked`. Closing it means giving each trig item a stated
  derivation for its wrong answers.
- **Ages 6–10 curriculum** is thin in both repositories.
- **Screen-time enforcement** has a schema but no server logic yet.
