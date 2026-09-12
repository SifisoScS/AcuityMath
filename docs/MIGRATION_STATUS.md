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
| **A** | Generator verification, CI, test infrastructure | **Merged** (PR #1) |
| **B1** | Schema, migration, identity model | **Merged** (PR #3) |
| **B2** | Answer pipeline, mastery curve, test isolation | **Merged** (PR #4) |
| **B3a** | tRPC routers, practice loop API, tier unification | **Merged** (PR #5, repaired by #7) |
| **B3b** | Curriculum import, seed, practice loop on real content | **Merged** (PR #8) |
| **B3c** | Safety net, service layer, three a11y/authorisation fixes | **Merged** (PR #9) |
| **B3d** | Practice view serving authored content | **Merged** (PR #10) |
| **C1** | Sign in by emailed link | **Merged** (PR #11) |
| **C2** | Step-up PIN, elevation, child access tokens | **Merged** (PR #12) |
| **B3e** | Profiles from the server, demo family, real progress | **Merged** (PR #13) |
| **C3** | The PIN gate on real elevation | **Merged** (PR #14) |
| **B3f-1** | Parent analytics derived from real attempts | **Merged** (PR #15) |
| **B3f-2** | Assignments onto the server, teacher entitlement | **Merged** (PR #17) |
| **B3f-3** | Notifications onto the server, with real producers | **Merged** (PR #18) |
| **D** | Offline queue, rewards, focus traps | **Merged** (PR #22) |
| **E-pre** | Legacy credential surface closed | **Merged** (PR #20) |
| **E1** | COPPA consent onto `consent_events` | **Open** — this branch |
| **E1b** | Gate on consent for under-13s | **Shape decided, not built.** See below |
| **E2** | Screen-time enforcement onto the real schema | **Open** — this branch |
| **E3–E5** | Quarantine the stubs, delete the JSON store | Planned |

One pull request is open: **E1, this branch.** The table has twice drifted —
saying "open in PR #N" for work that had been in `main` for days, and naming a PR
number that was never allocated. Read it as a record of what landed and check
`gh pr list` before trusting the right-hand column.

PR #19 was split rather than merged: its credential commit went to #20, its
feature commits to #22, and its consent commits to this branch. It carries a
comment mapping all ten commits to their destinations.

The content-import half of Graft D was delivered early, in B3b: the database
holds 63 concepts, 1,138 authored problems and 572 hints. What remains of D is
the offline queue alone.

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
> **B3f is finished.** Analytics, assignments and notifications are all derived
> from rows now, and `src/utils/storage.ts` holds no invented data at all.
>
> Notifications were the one that needed producers rather than a migration: two
> events actually happen in this application — a concept crossing into mastery,
> and work being set — and those are exactly the two the feature reports. The
> `streak`, `reward` and `sync` types were removed rather than kept as
> permanently-empty cases, because nothing writes `learner_rewards` and the
> offline queue is Graft D.
>
> **Graft D is half built, on `graft-d-offline-queue`.**
>
> Done, with 12 integration tests and three mutations proved: an offline queue
> retries whatever it cannot confirm was delivered, and a retry the server treats
> as a fresh answer moves mastery and the 3PL estimate a second time for one
> question. That is not a duplicate row a report can filter out afterwards — the
> running scores have absorbed it and there is no way back. So `attempts` now
> carries a `client_id`, unique *per learner*, made by the client when the child
> answers rather than when the answer is sent; `recordAttempt` returns the
> original result on a replay; and `practice.submit` reports `replayed` so a
> reconciler can tell "delivered" from "delivered twice".
>
> Still to build: the IndexedDB queue itself, real connectivity detection
> (`isOffline` is a manual toggle today and nothing watches the network), the
> reconciler, and an honest banner.
>
> **The live defect this exists to fix:** `triggerCloudSync` in `App.tsx` fires
> the request fire-and-forget with a `.catch` that only logs, then a `setTimeout`
> unconditionally empties `pendingActions` and writes "Synced to Server" into the
> log. A failed sync reports success and discards the child's work.
>
> **Branch from `main`, and target `main`.** A stacked pull request merges into
> its base branch, not into `main` — PR #5 was based on `graft-b-schema` and its
> merge left `main` without the tRPC layer for an hour. PR #7 repaired it.

Local checkout: `C:\Users\sifis\Math-Analysis\AcuityMath`
Working branch: `graft-d-offline-queue`

---

## Picking Graft D back up

Paused 2026-09-10 with the idempotency foundation committed on
`graft-d-offline-queue` and the queue itself not started.

**Before anything, start Docker** — MySQL is a container on port 3307 and every
integration suite needs it. Then:

```bash
export DATABASE_URL="mysql://root:root@127.0.0.1:3307/acuitymath"
pnpm db:migrate        # 0006 adds attempts.client_id
pnpm db:seed           # curriculum: 63 concepts, 1,138 problems, 572 hints
pnpm db:seed:demo      # family, teacher, classroom, and two real notifications
pnpm test              # 483 tests; re-run this first, see the caveat below
```

**Caveat on the last verification.** The branch was committed with `tsc --noEmit`
and `pnpm build` both clean, and the 12-test idempotency suite green *after* the
database was rebuilt. The full suite was not re-run after that rebuild: the run
that would have done it was cut short when the MySQL container was OOM-killed
mid-run (exit 137, after many back-to-back full runs). So **run the full suite
before building on this branch** — it is expected green, not observed green.

### What to build next, in order

1. **The queue.** IndexedDB, one record per unsent answer: `clientId`,
   `learnerId`, `problemId`, `answer`, `responseTimeMs`, `answeredAt`. The
   `clientId` is generated when the child answers, not when the record is sent —
   that is what makes the retry safe, and it is already enforced server-side.
2. **Connectivity.** `navigator.onLine` plus failed-request detection. Keep the
   manual toggle for demonstrations, but label it as a simulation rather than
   letting it stand in for the real thing.
3. **The reconciler.** Drain oldest-first, removing an item only on a confirmed
   response. `practice.submit` returns `replayed`, so an item already delivered
   can be retired without being counted as work done. Anything not confirmed
   stays queued and is retried with backoff.
4. **The banner.** It currently reads "All math progress synced" unconditionally.
   It must be able to say that items are waiting, and that the last attempt
   failed.

### The defect that makes this urgent

`triggerCloudSync` in `src/App.tsx` calls `apiService.syncBatch(...)` without
awaiting it, attaches `.catch(err => console.warn(...))`, and then a `setTimeout`
clears `pendingActions` and appends "Synced to Server" log lines regardless of
what happened. **A failed sync reports success and throws the child's answers
away.** Replacing that path is the point of the graft, not a side errand.

---

## Graft E — retiring the legacy REST surface

`server/api.ts` predates the MySQL migration: 22 routes under `/api`, nine of
them reading `server/db.ts` — a JSON file (`data_store.json`, gitignored) that
**nothing migrated reads**. The learning product runs on tRPC against MySQL.
**The router has no authentication of any kind** — no session, no middleware.

The exploitable part was closed in PR #20. What remains is a parallel data
layer, and it has to come apart in order:

1. ~~**COPPA consent onto `consent_events`.**~~ **Done on this branch.** The
   legacy route stays refused; `consent.record` writes the ledger. Detail
   below.
2. ~~**Screen-time enforcement onto the real schema.**~~ **Done on this
   branch.** The legacy heartbeat and `/sync/batch` retire with it. Detail
   below.
3. **`/api/ai/socratic-coach` stays.** It proxies the AI coach and touches no
   store. Moving it under tRPC is optional.
4. **District and LMS endpoints quarantined** — a named module, a comment
   saying they are stubs, and no path from a real user surface to them. Not
   deleted, not left ambiguous.
5. **`server/db.ts` and `data_store.json` deleted.** That is the completion
   condition, not the starting point.

`server/legacyApi.test.ts` pins the surface meanwhile: the three deleted routes
stay deleted, no route here verifies a PIN, consent refuses, exactly seven named
routes touch `db.`, and the surface is **exactly 20 routes**. It is an inventory
rather than a ban, because banning the store while nine routes use it would only
mean skipping the test.

As each step lands, its routes come off that list. When the list is empty, the
inventory becomes the assertion that **no route under `/api` reads
`data_store.json`** — and the deletion in step 5 is verifiable rather than
hopeful.

### Step 1 — done

Consent is recorded in `consent_events`, one row per child, by `consent.record`
on `elevatedProcedure`. Design and the four decisions behind it:
[The Consent Ledger][consent-ledger]. The parts worth restating:

[consent-ledger]: https://claude.ai/code/artifact/5ef4427d-c8a3-46d2-b621-405a3549e2b4

- **The method is `email_verified_name_attested`.** The first draft called it
  `email_plus_verification`, which overstates it — "email plus" is a term of art
  for a method with a confirming second step this product does not perform. A
  name that needs the evidence read before it stops misleading is the wrong name.
- **The policy hash is computed server-side** from the server's own copy of the
  disclosure, never sent by the client, which could otherwise claim consent to
  text that was never displayed. The input is `.strict()`, so an attempt to
  supply one is refused rather than silently stripped.
- **`evidence` is gone.** One free-text `varchar(500)` standing for whatever the
  method happened to be was the same failure as a ledger with no policy version,
  one layer down. It is `attested_name`, `verified_email`, `email_verified_at`
  and `second_step_sent` now — so "every consent taken without a confirming
  step" is a `WHERE` clause.
- **`email_verified_at`** records when the magic link was consumed. The link
  proves control at T and consent is recorded at T+X; a gap of weeks is
  ordinary, and a record that cannot show it implies there wasn't one.
- **Precedence is one `status`**, not a decision plus a freshness flag:
  `withdrawn` outranks everything, `superseded` applies only to a granted row
  under an old version, and a child added after consent reads `none`.

### E1b — gate on consent. Shape decided, not built.

Recording consent fixes a false claim; it does not stop the product collecting
data from children nobody consented for, and that second half is the one that
protects anybody. The policy is **allow practice, block recording, make it
visible**, for under-13s, which `birthYear` already identifies.

**The shape is client-only ephemeral.** The generator runs in the browser,
nothing is written anywhere, and the only server call is the consent-state read.
Two alternatives were considered and rejected:

| Shape | Why not |
| --- | --- |
| Server-recognised ephemeral — the loop calls the server, the server skips the write | Simpler, but the child's attempts are still transmitted, which is the thing consent is about. "Nothing is being saved" would be true of the write and false of the transmit. |
| Local record, deferred sync — attempts queue until consent arrives | The queue built in Graft D exists to flush. A queue that must not flush is a second code path wearing the first one's name. |

Client-only is the only shape where **"nothing is being recorded" is true in the
strong sense, including the network layer**, so the banner can say *"Practice
mode — offline only. Nothing is being saved."* and be literally true. The
generator already runs client-side for offline mode, so the path exists.

**What this branch does not yet provide.** The shape needs the child's own
session to know whether consent covers them, and it cannot ask today:

- `consent.forFamily` is on `elevatedProcedure` — it requires a parent's
  step-up PIN, so a learner session cannot call it.
- `consent.policy` and `consent.policyHash` are `protectedProcedure`, but they
  return the disclosure, not a learner's status.

So E1b needs a **learner-scoped status read** that does not exist yet —
something like `consent.statusForLearner` on `learnerProcedure`, returning only
`granted | none` for that one learner, with no parent identity, no policy text
and no evidence. It is deliberately **not added here**: an unused authorisation
surface shipped ahead of its caller is the kind of thing that gets wired up
carelessly later. It is named so E1b starts from a decision rather than a
discovery.

### Step 2 — done

**The limit was real and the enforcement was not.** `screen_time_rules` has had
a writer (`learners.setScreenTimeLimit`, elevated), a reader (`learnerAnalytics`)
and a slider in the parent dashboard since B1 — a parent set a limit, got a
toast confirming it, and saw it displayed back. Nothing applied it.

- **`screen_time_usage` had no writer** outside tests, while the comment above
  it read "the heartbeat writes here". Third table in this project to exist
  without one, after `learner_rewards` and `consent_events`.
- **The heartbeat could not match a child.** `App.tsx` sent `activeProfile.id`
  — `learner-12` — to a route reading `data_store.json`, keyed `student_1..4`.
  `getStudentById` returned undefined, the route 404ed, `sendHeartbeat` caught
  it and returned `null`, and `if (res)` was false. **No child has ever been
  locked out.** The same id-format accident as `verifyPin`, and the same
  conclusion: it was never a property that the ids disagree, just an accident.

`screenTime.heartbeat` on `learnerProcedure` replaces it. What is worth
restating:

- **The beat carries no duration.** A counter the caller increments is a counter
  the child it restricts can decline to increment — sending `0` forever costs
  nothing and buys unlimited screen time. The server measures from
  `counted_through` instead, caps at two minutes so a sleeping laptop is not
  billed for the nap, and banks whole minutes only.
- **`counted_through` advances by the minutes banked, not to `now`.** The
  leftover seconds carry. Flooring to `now` would discard up to 59 seconds a
  beat, and since jitter puts beats a shade *over* the minute, the counter would
  have stalled near zero while a child practised all afternoon. It is its own
  column: `updated_at` answers when the row was touched, this answers what
  period has been counted, and one column holding both is how
  `screenTimeLimitMinutes` came to mean two different things.
- **No rule means no limit, not a limit of zero.** `screen_time_rules` has no
  row until a parent opens the control; reading the absence as zero would lock
  out every child whose parent never did. `src/utils/screenTime.ts` already drew
  that distinction for the meter and enforcement had to agree with it.
- **Enforcing is not an elevated act; setting the limit is.** The beat runs
  continuously while a child practises, and a limit needing the parent's PIN
  every minute would simply be switched off.
- **Mount reads rather than beats.** Beating on mount banks the gap since the
  last beat, which on a browser reopened the next morning is the whole night.
- **The day is the server's.** No timezone is stored anywhere and
  `server/learning/rewards.ts` already resolves a streak day this way; giving
  screen time a timezone alone would make the two disagree about when "today"
  started. Both move together when a timezone column lands.

**The JSON copy went with it**, rather than being left unread:
`StudentRecord.screenTimeLimitMinutes`, `todayMinutesSpent` and `isLocked`, plus
`db.recordHeartbeat` and `db.unlockStudent`. An orphaned
`screenTimeLimitMinutes` there would be the same defect wearing the same name as
the analytics field that survives — and a second source for one fact is what
this step exists to remove.

`POST /sync/batch` went too. It drove the heartbeat and had no caller left:
Graft D replaced it with an IndexedDB queue submitting through tRPC with a
per-learner `client_id`.

**One consequence of enforcement becoming real.** The lock modal used to say the
parental override was "not available yet", which cost nobody anything while the
lock could never fire. A family can arrive there now. It names the path that
works instead — raise the daily limit in the parent dashboard, behind the same
step-up PIN, honoured by the next beat. A separate one-off grant would be a
second source for the same fact, one step after removing one.

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
| `pnpm test` | Everything. 482 tests; integration suites skip without `DATABASE_URL` |
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

### Test against a database at your branch's migration level

**The dev database on 3307 is not reset between checkouts.** It carries whatever
migrations the last branch you worked on applied, so a branch *behind* it fails
schema tests for reasons that have nothing to do with that branch.

This has already happened. On 11 Sep 2026 the credential-surface fix (PR #20)
failed against 3307 because 3307 was four migrations ahead — carrying `0008`
and `0009` from PR #19, which drop `evidence` from `consent_events`. The branch
was correct and the database was wrong.

**What it looks like.** The failure surfaces in
`drizzle/database.integration.test.ts` as a query against a column the database
no longer has, or does not have yet:

```
× schema against MySQL > records consent as a sequence, not a flag
  → Failed query: insert into `consent_events` (`id`, `learner_id`,
    `granted_by_user_id`, `decision`, `method`, `evidence`, `recorded_at`) ...
```

That file is the tell, because it is the one suite that asserts the schema
itself rather than behaviour over it. **A failing query naming a column you did
not touch is this, not a bug in your branch** — check
`SELECT COLUMN_NAME FROM information_schema.COLUMNS` against the table it names
before reading another line of your own diff. Behavioural suites can fail this
way too, but they fail second and less legibly.

Neither instinct is safe here. Chasing the failure wastes an hour on code that is
fine; waving it away as "just the environment" is how a real schema regression
gets shipped. **Take the ambiguity away instead** — verify on a throwaway
database migrated to your own branch, and leave 3307 alone:

```bash
docker run -d --name acuitymath-verify   -e MYSQL_ROOT_PASSWORD=root -e MYSQL_DATABASE=acuitymath   -p 3308:3306 mysql:8.4

export DATABASE_URL="mysql://root:root@127.0.0.1:3308/acuitymath"
pnpm db:migrate && pnpm test

docker rm -f acuitymath-verify
```

**A green `pnpm test` with no `DATABASE_URL` is not coverage.** The integration
suites skip themselves and the run still reports success. On `main` at `6eecade`
that is **299 passed, 183 skipped** out of 482 — well under two thirds of the
suite actually executing. With a database at the right level, all 482 run.

CI is unaffected: the integration suites throw rather than skip when `CI` is set
and `DATABASE_URL` is unset, so a pipeline cannot go green by skipping the half
that needs a database.

**The fork that made this urgent is closed.** For a stretch, 3307 carried
`0006`–`0009` while `main` had none of them, and the 3308 recipe was the only
way to tell a branch failure from a database one. `0008` and `0009` landed in
#23, 3307 was dropped and re-migrated from `main`, and the full suite runs green
against it — the first time `main` and the dev database have agreed since
`0006`.

The recipe above stays. It was never only for that fork: **any branch that adds
or drops a migration reopens the same gap** for as long as it is unmerged, and
the next one will. What has gone is the standing mismatch, not the reason to
verify on a database at your own branch's level.

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

**An error handler that returns what the success path returns has made the
failure unobservable.** Not "the states look similar" — the mechanism is that
**the catch block answers the question the caller asked**, so the caller has no
way to tell the answer came from a failure. That is why reading the success path
never finds it. Three instances, all fail-open:

| Site | On failure it returned | Which the caller read as |
| --- | --- | --- |
| `apiService.verifyPin` | `{ valid: true, sessionToken: 'offline_token' }` | a correct PIN |
| `apiService.sendHeartbeat` | `null` | "no news", not "no answer" |
| `triggerCloudSync` | a log line, then the queue emptied | "Synced to Server" |

The first made an unreachable server indistinguishable from correct credentials.
The last discarded a child's work and reported success. **What to grep for is any
`catch` whose return satisfies the check the caller performs on it** — a truthy
flag, a `null` the happy path also produces, a shape the caller cannot
interrogate.

The escape is cheap, and this codebase already has it right once:
`askSocraticCoach` falls back to a canned reply but stamps
`source: 'client-offline-fallback'`, and `SocraticCoachModal` renders that
source. The failure announces itself. A fallback is fine; an *unlabelled* one is
the defect.

One is still live. `Database.load` in `server/db.ts` catches a parse error,
returns `INITIAL_STATE` and **persists it over the unreadable file** — so
"corrupt" and "never existed" are the same outcome, and the first one destroys
the evidence. It goes with the file in Graft E5.

**A shared resource that does not match the branch produces a failure that names
the wrong thing.** Two triggers, one shape, and the cost each time is an hour
spent reading correct code.

The dev database on 3307 is not reset between checkouts, so a branch *behind* it
fails the schema suite — PR #20 failed `records consent as a sequence, not a
flag` because 3307 carried `0008` and `0009` from a branch that had not merged.
And a scratch database survives a run that died part-way, half-migrated, so every
later run fails on `CREATE TABLE ... already exists`; that is the same mechanism
reached from the other direction, and the schema-mutation trap below is its first
recorded form.

Both failures **name a table or a column**, which is what makes them convincing.
Neither instinct is safe: chasing it wastes an hour on code that is fine, and
"just the environment" is the shrug that ships a real schema regression. Remove
the ambiguity instead — verify against a database migrated to your own branch
(the recipe is under *Getting running again*), and drop the `acuitymath_*`
scratch databases after a run that died.

**A table can be designed, migrated, read and displayed while nothing ever
writes to it.** Three times: `learner_rewards` showed every child zero coins and
made buying an avatar do nothing (#22); `consent_events` let the application
report a consent it had not recorded (#23); `screen_time_usage` let a parent set
a limit, confirmed it, displayed it, and locked nobody out (#25). Each shipped a
false claim to a parent, each survived weeks, and each was found by someone
happening to look.

The common surface is that **a missing writer looks exactly like a zero**. Coins
of zero, consent of none, minutes of nought — all indistinguishable from a child
who has not started. `drizzle/writers.test.ts` now asserts every table has one;
run against this history it reports three at `d634956` and none today.

**An assertion can check something adjacent to the thing it names.** This has
now happened three times, and it is the hardest defect in this project to
notice, because the test is green while it is wrong.

| The assertion looked like | What it actually checked | The fix |
| --- | --- | --- |
| `expect(routes.length).toBeGreaterThan(15)` — a route count | a floor seven below the real count; ten routes could vanish | assert the exact number, measured after the deletions |
| `grep -c verifyPin` on `main` — whether the routes are gone | a file-header comment describing the deletion | assert route *declarations*, which is what `legacyApi.test.ts` pins |
| `expect(body).toMatch(/consent\.record/)` — that the 410 names the call site | `replacedBy: 'consent.record'`, a machine field elsewhere in the same handler | extract the `error:` string and assert it separately from the field |

The shape is always the same: the assertion runs against a *container* of the
property rather than the property. A floor contains the count; the file contains
the routes; the handler contains the message. Each passes for a reason that has
nothing to do with what it claims, and each was only found by changing the code
it guards and watching it stay green. **Mutation is what distinguishes a test
from a decoration** — and two of these three were caught only because a mutation
was absorbed rather than because anything failed.

**Mutating a schema is not like mutating code.** Testing that the `client_id`
uniqueness is scoped per learner meant generating and applying a real migration,
which wrote to real databases. Reverting the source afterwards left behind: a dev
database with the wrong index, an applied migration with no file, and — worst —
a *scratch test database* carrying the mutant index, because `createTestDatabase`
does `CREATE DATABASE IF NOT EXISTS` and then migrates, so it never rebuilds an
existing one. The suite then failed on a mutation that no longer existed in any
file. **After mutating the schema, drop the scratch databases**
(`drop database acuitymath_<suite>`); they rebuild on the next run.

**Two guards can hide each other, and a mutation finds it.** The mastery
milestone has a crossing check (`was below 80, is now above`) and an
already-raised check. Driven through `recordAttempt`, removing *either* left the
suite green: the survivor was enough on its own. Both were only pinned once the
producer was called directly with explicit before/after values. A test that
exercises two guards through one path tests their disjunction, not each of them.

**A test can be named for something it does not do.** "raises nothing for an
attempt that was rolled back" submitted a non-existent problem id — which
`recordAttempt` rejects *before* opening a transaction, so the producer was never
reached and nothing was rolled back. It passed for the wrong reason and would
have kept passing if the producer had been moved out of the transaction
entirely. Rolling one back deliberately is the only version that watches the
write disappear.

**`git checkout <file>` discards uncommitted work.** Restoring a mutated file
that way during mutation testing silently reverted a producer that had never been
committed, and the next run failed ten tests. It happened a second time on
`drizzle/migrations/meta/_journal.json`, dropping the entry for a migration whose
`.sql` file was untracked and therefore survived — leaving the journal and the
migrations folder disagreeing. Copy the file aside and copy it back; only use
`git checkout` on work that is already in a commit.

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
- **Streaks, coins and rewards.** Nothing writes `learner_rewards`, so there are
  no streak or reward notifications and the `streak`/`reward` types are absent
  from the schema enum rather than present and empty. Closing it means a producer
  in `recordAttempt`, and it would also fix the zeros on every child's dashboard.
- **A teacher nudge.** The teacher roster had a "Nudge" button that raised a
  local notification about a hardcoded "Speed Addition Challenge" and toasted
  "Reminder sent" although nothing was sent. It is gone. A real one needs a third
  notification type, a message the teacher writes, and the classroom entitlement
  check `assignments.create` already uses.
- **District dispatch.** `/api/lms/dispatch-assignment` writes to an in-memory
  demonstration store, not the database, so no learner is given anything. It used
  to put an entry in the family bell saying the work was "now live across student
  course dashboards", and its `catch` reported success on failure. Both are
  fixed; the store itself is still demonstration data.
- **Teacher pilot survey.** `POST /api/feedback` **does** exist — an earlier
  entry here said it did not, which was wrong, and the reason matters because it
  is what a later reader would trust when deciding whether the fix still applies.
  It returns a real aggregate over `pilotFeedbackStore`, an in-memory array in
  `server/api.ts` **pre-seeded with three fabricated testimonials** from teachers
  who do not exist, and reset on every restart. So "88% report optimal ZPD (24
  responses)" was the client's hard-coded fallback, and a real submission would
  have averaged a teacher's answer into three invented ones. The widget now
  reports whether the answer was kept and shows no aggregate. Closing it means a
  table, and deleting the seeded testimonials.
- **LTI 1.3 / OneRoster.** The teacher dashboard claimed "LMS Two-Way Sync
  Active", "Connected to Google Classroom & Canvas", "100% Rosters Synced" and an
  assignment toggle that "writes to Google Classroom & Canvas course streams".
  None of it is built. A school would have believed its gradebook was being
  written to. All four now say the truth.
- **Nothing writes `learner_rewards`.** Coins, XP and streaks read zero for
  every learner.
