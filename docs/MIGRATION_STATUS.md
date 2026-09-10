# Migration status

**Last updated: 10 September 2026.** The resumption point for grafting the
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
| **B3a** | tRPC routers, practice loop API, tier unification | **Done**, open in **PR #5** |
| **B3b** | Curriculum import, seed, practice loop on real content | **Done**, merged (PR #8) |
| **B3c** | Safety net, service layer, three a11y/authorisation fixes | **Done**, merged (PR #9) |
| **B3d** | Practice view serving authored content | **Done**, open in **PR #10** |
| **B3e** | The rest of the `App.tsx` lift — profiles, analytics, assignments | **After Graft C** |
| **C1** | Sign in by emailed link | **Done**, merged (PR #11) |
| **C2** | Step-up PIN, elevation, child access tokens | **Done**, open in **PR #12** |
| **B3e** | Profiles from the server, demo family, real progress | **Done**, open in **PR #13** |
| **C3** | The PIN gate on real elevation | **Done**, open in **PR #14** |
| **B3f-1** | Parent analytics derived from real attempts | **Done**, merged (PR #15) |
| **B3f-2** | Assignments onto the server, teacher entitlement | **Done**, open in **PR #17** |
| **B3f-3** | Notifications onto the server | Needs a table; nothing emits them yet |
| **D** | Content import, offline queue on IndexedDB | Not started |

> **The gate is real now.** `handleNavigate` asks the account's role first, then
> the server's elevation. `authenticatedRoles` — a client-side record any
> devtools user could set, and which the API never saw — is gone.
>
> **Analytics are derived now.** `INITIAL_ANALYTICS` is deleted. Every figure a
> parent sees traces to a row the child's own answers produced, and the fields
> with no honest source — focus alerts, week-over-week change — say nothing
> rather than inventing a number.
>
> **A teacher now reaches a learner through a classroom, and through nothing
> else.** `learnerProcedure` stays guardian-or-admin — widening it would have
> given a teacher a parent's powers over a child, which
> `server/trpc/index.ts` refuses on purpose. `assignableLearnerIds` is a separate
> rule for the one thing a teacher should be able to do, and it gives an
> administrator no bypass: a district administrator is not a teacher.
>
> **Next up is B3f-3, notifications.** They have no table, and nothing in the app
> emits one. Unlike analytics and assignments this is not a matter of moving
> existing data — the producers have to be written first (a mastery milestone, an
> assignment being set, a streak), or the feature is an empty list.
>
> **Branch from `main`, and target `main`.** A stacked pull request merges into
> its base branch, not into `main` — PR #5 was based on `graft-b-schema` and its
> merge left `main` without the tRPC layer for an hour. PR #7 repaired it.

Local checkout: `C:\Users\sifis\Math-Analysis\AcuityMath`
Working branch: `graft-c3-real-gate`

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
| `pnpm test` | Everything. 347 tests; integration suites skip without `DATABASE_URL` |
| `pnpm test:integration` | Only the suites needing a database |
| `pnpm audit:generator` | Both halves of the content gate, writes `data/generator-validation.json` |
| `pnpm lint` | `tsc --noEmit` |
| `pnpm db:generate` | New migration from a schema change |
| `pnpm db:migrate` | Apply migrations |
| `pnpm db:seed` | Import the 1,132-problem curriculum. Idempotent |
| `pnpm db:seed:demo` | A demonstration family with real attempts. Idempotent |
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

### ~~1. tRPC routers over the existing helpers~~ - done, PR #5

`server/trpc/` holds the context, the procedures and the routers, mounted at
`/trpc`. The legacy `/api` REST surface over the JSON file is still mounted
beside it, and comes out when the client moves - not before, so the app is never
half-migrated at runtime.

The ownership check is **structural**. `learnerProcedure` requires a `learnerId`,
resolves the learner and proves entitlement before the handler runs, so a
procedure built on it cannot skip the check and one that forgets to declare
`learnerId` does not compile. A missing learner and an unreachable one answer
identically, so ids cannot be enumerated.

`server/auth/session.ts` is a **seam, not an implementation** - Graft C fills it
in. `DEV_AUTH_EMAIL` resolves a user in development and throws if it is ever set
in a production build.

### ~~2. Seed real content~~ - done, PR #8

`data/curriculum/` holds the four strands, in this repository rather than read
from a sibling checkout. `pnpm db:seed` writes 51 concepts, 67 prerequisites,
1,132 problems, 792 distractors and 572 hints in about two seconds, and is
idempotent.

`serveNextProblem` now prefers authored content and falls back to the generator
when a concept's written problems run out — or when a learner's age has none,
which is age 7.

**The corpus carries no age metadata at all**, so `server/curriculum/ageBands.ts`
is hand-authored: one reviewable table, 51 rows, reconciled against the source's
own prerequisite graph. Coverage by age is pinned in a test:

    3:5  4:9  5:9  6:6  7:0  8:3  9:8  10:7
    11:6  12:14  13:25  14:20  15:13  16:8  17:3  18:1

### ~~Practice view on real content~~ - done, PR #10

`InfiniteAdaptiveModal` now asks the server for a question and falls back to the
local generator when offline or signed out. A learner sees authored problems
with their authored explanations, and the server decides correctness.

`usePracticeLearner` is a **deliberate temporary bridge**: it finds or creates a
server learner matching the visible demo profile, so real content could reach
the practice view without touching identity. It deletes itself when the profile
system moves in B3e.

**Two gaps this exposed, both open:**

- **Foundations problems do not draw.** Their `visual` payload is a set of
  figures, and the practice card renders the prompt as text. "Which shape is the
  biggest?" with no shapes is unanswerable by a five-year-old — and the choices
  are the words *circle, square, star*, which she cannot read either. The
  imported early-years content is present but not yet usable.
- **The misconception label is wrong for imported content.** The card knows the
  generator's ten codes; the corpus uses its own vocabulary, so
  `size-middle-not-extreme` displays as "Arithmetic calculation step slip".
  Showing nothing would be better than showing something false.

### 1. Lift the rest of `App.tsx` (after Graft C)

**The largest single task in the whole migration.** `src/App.tsx` is 1,424 lines
holding **35 `useState` hooks**; only two files in the repo touch `localStorage`
and there are 13 `apiService` call sites, so the state lives in component memory
rather than in storage. It becomes server-backed queries.

Do it in slices behind `src/App.smoke.test.tsx`, which exists precisely as the
tripwire for this: it pins that the app renders with no reachable API, that the
four tiers are in the nav, and that the three role-gated surfaces are reachable.

### 2. Seed real content

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
| **One definition of the tier bands** | There were two and they disagreed at 6 and 14, so a six-year-old was placed in Early Sprouts and seeded with a seven-to-ten year old's ability. `services/tiers.ts` owns them now |
| **Authentication is a seam until Graft C** | The authorization logic can be built and tested now; only *who is signed in* is deferred, and the dev bypass throws in production rather than degrading |
| **LTI 1.3 deferred** | Greenfield in both repos, and no district pilots before auth is real |

---

## Traps, and what they cost

Each of these looked like something else first.

**A roster is not a family.** `learners.list` returns the signed-in *guardian's*
children, which is correct and was the only list the front end had. A teacher
signing in therefore saw an empty class and an assignment form with nobody in it.
`learnerSummaries` was extracted so the same summary can be computed over a
different set of children, with the scoping left to the caller — a teacher's
classroom, a guardian's family — rather than baked into the aggregation where
widening it would be invisible.

**A default selection can name people the form will not show you.** The
assignment form pre-selected every child on the roster. Once the checkbox list
was limited to children the adult may actually set work for, that pre-selection
included children with no checkbox to clear, so every submit was refused by the
server with nothing on screen the teacher could change. It starts empty now.

**A number can be wrong on both sides of a correct join.** The analytics
endpoint was verified over HTTP and the profile list was verified over HTTP, and
the parent dashboard still crashed on every load. The server keys analytics by
learner id (`12`); profiles are `learner-12`. Both sides were right; nothing
tested the correspondence. Two dashboards had learned to paper over it with
`|| analyticsMap['user-maya']`, so before the data was real a parent selecting
Leo saw Maya's numbers under Leo's name — and once it was real, the same line
dereferenced `undefined`. **A fallback that hides a missing key hides a wrong
key too.** `keyByProfileId` is exported so the join itself can be tested.

**Zero is not a value when it means "unset".** `screen_time_rules` has no row
until a parent creates one, and `learnerAnalytics` reports that absence as `0`.
`max(0, 0 - minutesPractised)` is zero remaining, which reads as "at the limit",
so every child whose parent had set nothing would have sat permanently in a
pulsing red warning. The rule lives in `src/utils/screenTime.ts` for that reason.

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

**A comment is not an implementation.** `blankProfile` seeded every learner's
ability at `createInitialProfile(10)` with a comment saying age-based seeding
"belongs at learner creation" — where nothing did it. Every learner began on a
ten-year-old's curve, and a five-year-old's first wrong answer moved her level
from 2.0 to 4.3. Found by looking at the ability meter in a screenshot, not by a
test. If a comment defers work, the work needs a home.

**A key built from data that moved is a suppression that fails quietly.** The
characterisation tests suppress the placement prompt with a sessionStorage key
containing the active profile id. Profile ids changed from `user-maya` to
`guest`/`learner-N`, the key stopped matching, and the prompt started covering
the page about one run in five. There is now a test asserting the suppression
still works, so the next time it rots it fails in one obvious place rather than
making twenty tests racy.

**Zeros about a real child are worse than invented numbers.** Moving profiles to
the server first returned them with progress zeroed, on the reasoning that
progress belonged to the snapshot. The dashboard then showed "Level 0, 0 ELO"
for a learner with eighteen recorded answers. `learners.list` carries headline
progress now — three aggregate queries for the whole family rather than a
snapshot request per child.

**Sort ranges collide silently.** Generated concepts were numbered 10-120 and
imported strands 0-3000, so a nine-year-old was offered a generated fraction
before ever seeing `unit-fractions` — the corpus was seeded and invisible.
Generated concepts start at 9000 now, past every strand.

**A prerequisite graph outranks a syllabus.** Several concepts sit later than a
textbook would put them, because this corpus chains them that way — triangle
classification behind the angle sum, expressions behind proportionality. Banding
by convention instead would send a child to a roadmap step their age says they
cannot take.

**Decimal values need decimal columns.** The IRT parameters began as
`varchar(12)` holding decimal strings, and the generator produced an item
difficulty of `-0.29000000000000004` — twenty characters of floating-point noise
from `-0.2 + theta * 0.3` — which the insert rejected. They are `DECIMAL` now, so
the precision is a fact about the column rather than a convention every writer
has to remember. Storing seventeen significant digits of a psychometric estimate
was recording noise as measurement either way.

**TRUNCATE cannot empty a table a foreign key references.** Not even with
`FOREIGN_KEY_CHECKS = 0`: TRUNCATE is DDL and its implicit commit discards the
session state the suspension lives in. `DELETE` is DML, honours the suspension,
and is what the test harness uses. `learners` is referenced by fourteen tables,
so this is not an edge case.

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
- **Screen-time enforcement** has a schema and a parent-facing setting, but
  nothing pauses the app. The dashboard used to claim "Automated pause"; it now
  says the limit is shown to the child, which is what actually happens.
- **Week-over-week change** is not computed. `learnerAnalytics` reads the last
  seven days only, so the "+18% vs last week" badge was removed rather than
  guessed at. Closing it means a second window in the query.
- **Notifications** are still demonstration data in `src/utils/storage.ts`. They
  have no table, and nothing in the app emits one, so this is not a matter of
  moving existing data: the producers have to be written first.
- **Teacher pilot survey.** `POST /api/feedback` does not exist. The widget
  claimed "88% report optimal ZPD (24 responses)" from hard-coded state nothing
  could update, and said "Feedback logged!" over a request that always failed. It
  now reports that the answer was not kept, which is true, and shows no
  aggregate. Closing it means a table and an endpoint.
- **LTI 1.3 / OneRoster.** The teacher dashboard claimed "LMS Two-Way Sync
  Active", "Connected to Google Classroom & Canvas", "100% Rosters Synced" and an
  assignment toggle that "writes to Google Classroom & Canvas course streams".
  None of it is built. A school would have believed its gradebook was being
  written to. All four now say the truth.
- **Nothing writes `learner_rewards`.** Coins, XP and streaks read zero for
  every learner.
