# Roadmap — building AcuityMath to the architecture

> **Status:** Active. This supersedes the "Open decision — the product direction"
> entry in `MIGRATION_STATUS.md`: **the institutional direction is chosen.**
>
> `ARCHITECTURE.md` states the vision. This states the distance to it and the
> order of travel. Where the two disagree, the architecture is the target and
> this document is the truth about today.

---

## 1. The decision, recorded

AcuityMath is an **institutional** K–12 mathematics platform: LTI 1.3 Advantage
and OneRoster 1.2, district and school entities, and the administrator surfaces
that follow from them.

The shape is a **layer, not a fork.** The learner product — practice loop,
manipulatives, Socratic coach, consent, screen time — is the foundation, and it
works standalone for a family that self-serves. The institutional layer sits on
top of it and does not replace it. Nothing below needs rewriting to support it.

This matters for sequencing: **no institutional work blocks learner work**, and
the ages 6–10 content gap (§6) is independent of all of it.

---

## 2. What already realizes the architecture

Not to be rebuilt. Each of these is implemented, tested, and enforced
server-side.

| Architecture section | State |
| --- | --- |
| §3 Four developmental tiers | Built — `manipulatives/` has Early, Elementary and Secondary labs, plus a hub |
| §4 3PL IRT core | Built — Newton-Raphson MLE, Fisher information, SEM with a floor, confidence interval, misconception taxonomy. Mastery moves inside the transaction that records the attempt |
| §4 Placement Quest | Built — 7 items, live θ and SEM readout |
| §5 Socratic AI | Built — server-side Gemini, guardrails, and a deterministic fallback that **labels itself** rather than posing as the model |
| §5 Bilingual scaffolding | Built — in-problem scanner and glossary |
| §6 Chromebook worker offloading | Built — dedicated worker, request correlation, timeout fallback |
| §8 Roles | Built — parent, teacher, admin, with server-side entitlement |
| §8 PIN gate | Built — **scrypt with lockout**, not the 4-digit plaintext compare the scaffold had |
| §8 Screen time | Built — server-measured, client supplies no duration |
| §8 COPPA consent | Built — append-only ledger, server-computed policy hash, and **enforced**: an under-13 without consent practises locally and nothing is recorded |
| §9 Port 3000 / `0.0.0.0` | True — `server.ts:14` |
| §11 Build lifecycle | True, but the commands are `pnpm`, not `npm` |

The psychometric and pedagogical core of the architecture is **done**. What is
missing is the institutional layer and the content to fill the tiers.

---

## 3. The gap, honestly

| Architecture claims | Reality |
| --- | --- |
| §7 LTI 1.3 Advantage — OIDC, Deep Linking 2.0, AGS v2.0 | **Served, C1–C6.** Keys, registry, initiation, token validation, staff and pupil launch, NRPS roster sync, AGS score posting, Deep Linking with a teacher-facing picker. Only C7 conformance remains, and it is blocked on Track A |
| §7 A pupil launching from an LMS | **Works.** The child is provisioned, consented under their district's agreement, and holds a learner session — refused clearly if the district has not agreed or the placement names no year group |
| §7 Endpoint URLs (`/api/lti/launch`, `/api/lti/login`, `/api/lti/jwks.json`) | Served. `acuitymath.org` is still not registered to this project, and a launch needs https because the session cookie must be `SameSite=None; Secure` |
| §7 OneRoster 1.2 | **Consumed** (D1–D2): credential storage, the client-credentials grant, paged collection reads, a district sync that produces campuses, classrooms, pupils and class lists, and reconciliation that deactivates a leaver without ever inferring one from an incomplete read. Track D's engineering is complete. Note the direction — this product **consumes** a district's OneRoster API; it does not serve one at `/api/oneroster/v1p2`, and the wizard no longer says it does |
| §7 Self-serve wizard with handshake testing | **Rebuilt in E5.** Endpoints come from the same constants `routes.ts` mounts, and the checks are real reads that can fail. It still cannot prove a *platform* can reach this instance — no local read can — and it says so rather than implying it |
| §8 District console, CSV, CCSS audit, PDF brief | **The console is real and routed** at `/district/<id>` (E1), and **a full per-child export exists** (E2), which is what the family policy and the institutional agreement both promise, and **real deletion** (E3), which is what the agreement's "removes rather than hides" clause requires — **both reachable** from the console (E4), with step-up and a typed-name confirmation. the **bulk district CSV** exists (E6), behind step-up and hardened against spreadsheet formula injection. The **CCSS audit reports the gap rather than a matrix** (E7), because no authored concept carries a standard code — the mapping is authoring work and is now F3. The PDF brief does not exist and has not been argued for |
| §8 "COPPA Safe Harbor Compliant" | Consent is real; the **certification is not held** |
| §8 "FERPA aligned… encrypted in transit and at rest" | No TLS config, no at-rest encryption in this repo |
| §4 `ELO = 1000 + 250θ` | Code uses `1200 + 300θ`, range 600–2400. **The document and the code disagree** |
| Data model for institutions | `users.institutionId` is a nullable int **pointing at no table**. There is no `institutions`, `schools` or `districts` entity |

Two things in the schema already anticipate this direction and are worth
knowing: `consent_events.method` includes **`institutional_agreement`**, which is
the real COPPA pathway when a school consents on behalf of pupils, and
`classrooms` / `classroom_learners` already model a teacher's class.

---

## 4. Track A — the long-lead work, which is not engineering

**Corrected sequencing.** An earlier version of this section said "start these
first", on the general principle that long-lead items should begin early. That
advice is too blunt for where this project actually is, and the objection to it
was right:

> **Certification assesses a product as it stands.** A Safe Harbor review of
> something still changing shape buys an assessment of a version that will not
> exist in three months. 1EdTech membership before any LTI code exists pays for
> a conformance suite that cannot be run — and conformance is the *last* step of
> Track C, not the first. Hosting matters when there is something to deploy.

**And the urgency that would justify starting early does not apply: there are no
users.** Zero deployments, zero environments, no public instance. The only
consent rows that exist are the demo family from `pnpm db:seed:demo`. Nobody is
relying on any claim this product makes.

So the block below **waits**, with two exceptions called out at the end — and
the exceptions are exceptions because of a *cost curve*, not because they are
urgent.

| Item | What it actually requires | Start when |
| --- | --- | --- |
| **1EdTech membership** (formerly IMS Global) | Paid membership. Certification is only available to members | **Track C is underway** and conformance is in sight. Buying it earlier buys a suite with nothing to test |
| **LTI Advantage conformance** | Passing 1EdTech's conformance suite per service (Core, NRPS, AGS, Deep Linking) | **After C1–C6.** It is the last step of that track |
| **COPPA Safe Harbor** | Application to an **FTC-approved** program — PRIVO, kidSAFE or ESRB — including a privacy assessment and annual review | **When the product is stable enough to be worth assessing.** `docs/privacy/DATA_MAP.md` is the input and is already written |
| **FERPA posture** | FERPA binds *schools*, not vendors. What a vendor provides is a **Data Protection Addendum**, a data map, a subprocessor list, and breach terms | **Before the first real school signs.** The data map is done; the DPA needs a lawyer |
| **Hosting** | A host that runs a **persistent Node process plus MySQL**, contracted for encryption in transit and at rest | **When there is something to deploy** |
| **`acuitymath.org`** | Registration | 🔸 **Now.** See below — it is cheap and it decays |

> **A note on hosting, because it is a live trap.** This project builds *two*
> artefacts: a static client and `dist/server.cjs`. A static-only deploy — which
> is what a Vite-preset import to a static host produces — serves the client and
> never runs the server. Every guarantee in §8 lives in the half that would not
> run: auth, the consent gate, screen time, entitlement. A static deployment of
> AcuityMath is not a limited version of it; it is the appearance of it.

### The two things that should not wait

Both are here because **waiting makes them more expensive**, not because they are
urgent.

**1. ~~The consent disclosure.~~ Done.** `CONSENT_POLICY_VERSION` is now
`'2026-09-v2'`, which says what v1 did not. The rest of this entry is kept
because the cost curve it describes is the reason it was done early rather than
later. v1 told parents their child's information
"is not sold or shared with anyone else", unqualified, while a child's free-text
message to the Socratic coach is sent to Google. Google is a processor rather
than a third party and no identifier accompanies the request — and that
distinction does not survive a parent reading the sentence.

The cost curve is the argument. Bumping the version supersedes every existing
consent, and superseded consent does not count — so every affected family
re-consents, and their children drop to local-only practice until they do.
**Today that is four seeded demo rows and one commit.** After the first real
school it is every family in it. The number only goes up.

**2. `acuitymath.org`.** Trivial to register, and someone else can take it. Every
LTI endpoint in `ARCHITECTURE.md` §7 is specified against that host name.

Everything else in the table waits.

**Whenever it is picked up: until Track A completes, the architecture's
compliance and certification language stays out of the README and out of any
public surface.** That is not a retreat from the vision — it is the difference
between holding a certification and claiming one.

---

## 5. Track B — foundations the institutional layer needs

Small, and everything in Tracks C–E depends on it.

### B1 — Institutional entities

`institutions` (districts) and `schools`, with `users.institutionId` becoming a
real foreign key. `classrooms` gains a nullable `school_id`, so a self-serve
teacher's class keeps working unchanged.

**Done when:** a learner can be reached by district → school → classroom, and
`writers.test.ts` accepts the new tables because something writes to them.

### B2 — Institutional scope in authorization

`learnerProcedure` currently entitles a **guardian or an admin**. It needs a
third path: an institutional administrator reaching learners **within their own
institution and no further**.

This is the highest-risk change in the whole roadmap. It widens the blast radius
of a bug from one family to a district, and the existing rule — that an
unreachable learner answers `NOT_FOUND`, never `FORBIDDEN`, so the platform's
children cannot be enumerated — must hold across tenants.

**Done when:** a mutation test proves an administrator of district A cannot
reach a learner in district B, and cannot tell whether that learner exists.

### ~~B3 — Reconcile the ELO mapping~~ **Done**

The document won, and there turned out to be **four** mappings rather than two:
the specification's `1000 + 250θ`, `adaptiveEngine`'s `1200 + 300θ` in two
places, an independent copy in `adaptiveWorker` — so the worker and its own
main-thread fallback could disagree about a child's rating depending which
answered — and a fourth that seeded a new learner's rating from their **age
tier**.

`src/services/eloScale.ts` is the only place the arithmetic exists now, stored
ratings were recomputed from `theta` by migration `0013`, and a test fails if a
fifth copy appears. Done while the only learners were a demonstration family,
for the same reason the consent bump was: every rating anyone has seen moves
with it.

---

## 6. Track C — LTI 1.3 Advantage

Sequenced by dependency. Each step is independently useful and independently
testable against 1EdTech's reference platform before any real LMS is involved.

| Step | Scope | Done when |
| --- | --- | --- |
| **C1 Keys** | RSA-256 keypair, JWKS endpoint, rotation without downtime | A platform can fetch `/api/lti/jwks.json` and verify a token we signed |
| **C2 Platform registry** | Store issuer, client id, deployment id, keyset URL per platform | Two platforms can be registered and neither can impersonate the other |
| ~~**C3a Initiation**~~ | OIDC third-party initiation, single-use state and nonce | **Done, PR #48.** Both verbs; an ambiguous issuer is refused rather than guessed |
| ~~**C3b Token validation**~~ | Signature, audience, nonce, deployment and target checks | **Done, PR #49.** Eleven mutations bite; the platform in the tests serves a real JWKS |
| ~~**C3c Staff launch**~~ | The `/launch` endpoint, staff provisioning, cross-site session | **Done.** A teacher launches from an LMS and lands signed in |
| ~~**C3d Learner ownership**~~ | `learners.guardian_id` nullable, `learners.institution_id`, exactly one set | **Done.** A district pupil exists and is refused by the consent gate — and family consent structurally cannot reach them |
| ~~**C3e Institutional consent**~~ | `institution_agreements`, and `institutional_agreement` consent that points at one | **Done.** The pupil C3d blocked now practises, and ending the agreement stops them again |
| ~~**C3f Pupil provisioning**~~ | An LMS pupil becomes a district learner, consented through C3e in the same act | **Done.** Created and consented together, or not created at all |
| ~~**C3g Learner session**~~ | The first session a child can start, and what it may reach | **Done.** A child launches from an LMS and practises; they can reach nothing that names another child |
| ~~**C4a Outbound auth**~~ | Client-credentials grant with a signed JWT assertion, and a token cache | **Done.** A platform that verifies our assertion against our JWKS issues us a token |
| ~~**C4b Roster read**~~ | The NRPS claim, the memberships call, pagination | **Done.** A course's membership list is read from the platform, over https, one token across all its pages |
| ~~**C4c Reconciliation**~~ | Turning a membership list into classrooms and learners | **Done.** A roster matches the platform's without manual entry; a departure unenrols and nothing else, and no sync creates an adult account |
| ~~**C4d Sync trigger**~~ | A district administrator can list their courses and run a sync | **Done.** NRPS is reachable; scope is checked against the database, not the session |
| ~~**C5a Gradebook protocol**~~ | Line items and score posting, against a platform that checks | **Done.** One column per placement, scores named by the platform's own user id |
| ~~**C5b Score policy**~~ | Which number is sent, and what triggers sending it | **Done.** A completed session puts the child's curriculum coverage in the gradebook, and a failure there never reaches the child |
| ~~**C6a Deep Linking protocol**~~ | Accept the launch, hold the request, sign and return a content item | **Done.** A platform verifying our response against our JWKS accepts it |
| ~~**C6b The picker**~~ | What a teacher actually sees and chooses from | **Done.** A teacher embeds a link, adaptive or for one topic, and their browser carries the signed answer back |
| **C7 Conformance** | Run 1EdTech's suite per service | **Blocked, not pending.** It needs 1EdTech membership, which is Track A and deferred — so Track C's engineering is complete without it |

**Reuse rather than rebuild, with one correction found while building C3c.**
A school-consented pupil must satisfy the existing consent gate rather than
bypass it — that still holds, and is why C3e exists. But it cannot reuse
`recordConsent` as written: that function consents for **every learner of the
guardian it is given**, which is right for a family and catastrophic for a
district. Whoever stood in as guardian for a school's pupils would have one call
consent for all of them, and `consentForFamily` would return thousands of
children to a single screen.

So C3d makes the footgun unrepresentable instead of documenting it. With
district pupils hanging off `institution_id` rather than `guardian_id`, the
family sweep structurally cannot reach them.

**And institutional consent must be as evidenced as family consent.**
`institutional_agreement` is already a value in the enum and costs nothing to
write — nothing has to exist for a row to claim it. Family consent snapshots a
policy version, a server-computed hash, an attested name, a verified email and a
timestamp. If the institutional path is only a string, the gate is weakest for
exactly the children with least agency, and weakest in the direction that
happens to be convenient for us. C3e therefore records who signed, when, and the
hash of what they signed, and a district whose agreement has lapsed fails the
gate the way a family that withdrew does.

---

## 7. Track D — OneRoster 1.2

Depends on B1. Independent of Track C.

- ~~**D1**~~ — **Done.** REST client with OAuth 2 client credentials: the
  credential sealed at rest, the grant, paged collection reads, and the refusals
  around all three.

  **The trust direction is the opposite of LTI's, and that shapes the code.**
  An LTI platform verifies a JWT we signed against our published keyset, so
  nothing secret ever crosses the wire and a dump of `lti_platforms` authorises
  nothing. A OneRoster provider issues us a **shared secret** for a system
  holding far more about their pupils than this one ever will. So
  `ONEROSTER_CREDENTIAL_KEY` seals it and its absence **refuses the
  registration** — a deployment that cannot protect a district's credential does
  not get to hold one.
- ~~**D2**~~ — **Done.** `orgs` become campuses, `classes` become classrooms on
  them, `users` become children, and `enrollments` become class lists. Three link
  tables hold the `sourcedId` mapping, which is what makes a second run a no-op —
  matching on names instead would create a second copy of every child the first
  time somebody is married or corrected.

  **C4c's three rules hold unchanged**, because they are about meaning rather
  than about NRPS: a sync never archives a child, never creates an adult account,
  and never restores an archived pupil.

  Two things differ, and both are OneRoster's doing. **Ages arrive** — a SIS
  carries `grades`, where an LTI membership list carries no age at all, so the
  refusal C4c makes constantly is rare here. And **the empty-roster guard had to
  be written rather than inherited**: C4c gets it free from requiring a known
  teacher, but unenrolment here is driven by the enrolment list, so an empty read
  would unenrol a whole district. An empty class collection is refused as a
  failed read.

  **`academicSessions` and `courses` are deliberately not synchronised.** There
  is nowhere in this schema for a term or a course of study to live, and adding
  tables to hold data nothing reads is how a model acquires columns that are
  always null. When something needs them — a report scoped to a term, most
  likely — they arrive with the thing that needs them.
- ~~**D3**~~ — **Done.** Reconciliation, and the correction of a rule that had
  gone stale.

  **C4c said a sync must never archive a child**, on the grounds that archiving
  was what this product did when somebody asked for records to be removed. That
  was true when written. **E3 changed it** — after E3 the schema says archiving
  is for a child who has stopped, *"they left the school, the family paused, a
  roster no longer lists them"*, and that deletion is the other thing. The rule
  outlived its reason, D2 carried it forward, and D3 replaces it with a narrower
  one: **a sync archives only on a positive statement of departure, never on
  absence.**

  That is also the answer to the question D1 left open. OneRoster pages by
  `limit`/`offset`, so a collection changing underneath a minute-long read skips
  records, and a skipped child looks exactly like a departed one. A run whose row
  count contradicts the provider's `X-Total-Count` is marked **partial**: it
  still creates and enrols, which is additive and costs a child who arrives a day
  late, and it performs **no** departure at all.

  `learners.archived_reason` is what makes restoration safe. Without it, a
  returning pupil would un-archive two different children: the one a SIS
  deactivated last term, and the one a person deliberately hid. The second is
  somebody's decision being overturned by a nightly job.

  `oneroster_sync_runs` records what each run did, including refusals — three
  weeks of "nothing changed" is invisible in the data and obvious in that table.

**Done when:** running the sync twice changes nothing the second time, and a
pupil removed at the SIS is deactivated rather than deleted.

---

## 8. Track E — the district surfaces, rebuilt

`DistrictAdminDashboard.tsx` **was** 1,353 lines and the second-largest file in
the product on the day it was scaffolded, before any institutional data existed
to fill it. It seeded its own campuses and rendered "Google Classroom & Canvas
Live". E1 deleted it and re-derived the console from real queries, which is what
"design reference, not a head start" meant in practice.

> **A note on the numbering, because this section and §3 disagreed.** The list
> below originally read E1 analytics, E2 CSV, E3 CCSS, E4 nav-and-cleanup. What
> shipped under those labels was different — the cleanup happened inside E1, and
> E2–E4 went to the rights the institutional agreement grants, which turned out
> to matter more than a second export format. The labels below are now **what
> was actually built**, because these are the names used to pick the next step.

- ~~**E1**~~ — **Done.** The district console: multi-campus analytics from real
  attempts, via the same derivation `learnerAnalytics` uses for parents. Deleted
  `DistrictAdminDashboard.tsx` and its seeded campuses in the same change.
- ~~**E2**~~ — **Done.** A full per-child export, which is what the family policy
  and the institutional agreement both promise.
- ~~**E3**~~ — **Done.** Real deletion, removing a child's history rather than
  hiding it, as the agreement's own wording requires.
- ~~**E4**~~ — **Done.** The records panel, which is what made E2 and E3 reachable
  by a human being.
- ~~**E5**~~ — **Done.** The LTI onboarding wizard, made true. It advertised three
  endpoints that were not routes, printed a client id, a deployment id and a
  `sec_live_…` secret belonging to no platform, offered an LTI **1.1** cartridge
  under a 1.3 heading, and its "Test LMS Handshake" button was a 1,200ms
  `setTimeout` that reported success unconditionally. The paths now live once, in
  `server/lti/toolConfiguration.ts`, and `routes.ts` mounts from the same
  constants the wizard reads.
- ~~**E6**~~ — **Done.** RFC 4180 CSV of a district's pupils, behind step-up.

  The format was never the decision. **What belongs in one file containing every
  child in a district** was. E2's export is one child and everything about them —
  every answer, session and message — which is right for a record request about a
  named pupil and wrong for a thousand of them: nobody reads it, and it would be
  the largest disclosure this product can make, assembled by a click. So this is
  one row per pupil and eleven columns, enough for the questions a district
  actually asks and not a copy of anyone's work.

  **Formula injection is the part RFC 4180 says nothing about.** A field
  beginning `=`, `+`, `-`, `@`, tab or CR is *evaluated* by Excel, LibreOffice
  and Sheets — and these names arrive from a district's SIS, a system this
  product does not control and cannot vet. `server/learning/csv.ts` prefixes
  them, before quoting rather than after, and that ordering is load-bearing.
- ~~**E7**~~ — **Moved to Track F as F3.** This was listed here as though it were
  a reporting step waiting on a query. It is not.

  E7 went looking for the audit and found that **the authored corpus carries no
  standard codes at all** — fifty-one concepts across four strands, none of them
  mapped, and `SourceConcept` has no field to put one in. The twelve concepts
  that *do* carry a code are the generator's, and they are exactly the concepts
  with no authored problems. The only part of this product aligned to a standard
  is the part nobody wrote questions for.

  Nothing in that is fixable by engineering. `server/curriculum/standardsCoverage.ts`
  now reports the real position and a test fails the day it changes, so the claim
  cannot drift; the mapping itself is curriculum work and is **F3** below.

The PDF brief named in `ARCHITECTURE.md` §8 is **deliberately not listed**. A
console plus a CSV covers what it was for, and a generated PDF is a dependency
serving a format somebody would export anyway. It should be argued for before it
is built.

---

## 9. Track F — the content gap

Independent of every other track, and the largest *product* gap.

**These figures are computed, not copied.** `server/curriculum/contentCoverage.ts`
derives them from the corpus and `contentCoverage.test.ts` asserts them, so the
table below fails the build rather than going stale. It was hand-maintained
until F1, which is why it is worth saying.

| Age | Concepts | With authored problems | Authored problems |
| --- | --- | --- | --- |
| 3 | 8 | 5 | 100 |
| 4 | 12 | 9 | 180 |
| 5 | 12 | 9 | 180 |
| 6 | 9 | 6 | 120 |
| **7** | **3** | **0** | **0** |
| 8 | 6 | 3 | 65 |
| 9 | 11 | 8 | 185 |
| 10 | 10 | 7 | 165 |
| 11 | 9 | 6 | 150 |
| 12 | 17 | 14 | 340 |
| 13 | 28 | 25 | 566 |
| 14 | 23 | 20 | 431 |
| 15 | 16 | 13 | 272 |
| 16 | 11 | 8 | 168 |
| 17 | 6 | 3 | 63 |
| 18 | 4 | 1 | 21 |

**Age 7 is the only year between 3 and 18 with no authored problems at all.** It
is served by three generator concepts and nothing else, where a nine-year-old
has those plus a hundred and eighty-five written questions.

That is **not incorrect mathematics**. Generated problems pass the same
integrity gate the authored corpus does — structural invariants and SymPy — so
a seven-year-old is served correct questions. The year is *narrower*, which is a
different and smaller complaint than the earlier wording implied.

A caution for whoever measures this next: counting `problems` rows in a
development database says age 7 has three. Those rows are `source = 'generated'`
— generator output persisted while somebody used the app. `takeAuthoredProblem`
filters on that column, and any measurement that does not is counting the
generator's work as somebody's authoring.

### F3 — the standards mapping

**Moved here from Track E, where it had been listed as a reporting step.** There
is nothing to report from: no authored concept carries a standard code, and
`SourceConcept` has no field for one. What exists is twelve codes on the
generator's concepts — the twelve with no authored problems.

| | Concepts | With a standard code |
| --- | --- | --- |
| Authored corpus | 51 | **0** |
| Generator concepts | 12 | 12 |

**Computed, not copied**, the same way the table above is:
`server/curriculum/standardsCoverage.ts` derives these and
`standardsCoverage.test.ts` asserts them **in both directions** — the suite goes
red if the gap widens *and* on the day somebody authors a mapping, because at
that point this section says something untrue.

Done when: every authored concept names the standard it satisfies, decided by
somebody willing to stand behind each one. A fabricated alignment is worse than
an absent one — a district reads it, believes it, and buys on it.

This is authoring work, not engineering, and it can proceed in parallel with
everything above. It is also the work that most directly serves the §2 vision:
the child on the eight-year-old Chromebook is likelier to be seven than
seventeen.

---

## 10. Corrections to `ARCHITECTURE.md` itself

The document should come into the repository, because design intent belongs
under version control where it can be checked. Four things to fix as it lands:

1. **Recast the tense.** §7 and §8 are written as descriptions of a running
   system — endpoint URLs, "integrates seamlessly", "compiled and verified".
   They are the target. Every section should carry its status, so a reader can
   tell built from intended without reading the code.
2. **Fix the phase-plan labels.** The directory tour maps `PHASE_2_PLAN.md` to
   "District Administration & LMS", `PHASE_3` to IRT and `PHASE_4` to
   manipulatives. The files themselves say Phase 2 is manipulatives, Phase 3 is
   the Socratic coach, and **Phase 4 is Enterprise LMS** — last, which is also
   where `AUDIT_REPORT.md` puts it.
3. **Update the stack and anatomy.** No mention of MySQL, Drizzle, tRPC, the
   auth layer or the 40 test files; `data_store.json` is listed as the datastore
   and was deleted. Commands are `pnpm`, and the Gemini model is
   `gemini-3.8-flash`, not 2.5 Flash.
4. **Replace Golden Directive 8.** "Verify with `lint_applet` and
   `compile_applet`" names Google AI Studio's tools. Here it is
   `pnpm lint && pnpm test && pnpm build`, and the integration suites skip
   silently without `DATABASE_URL`.

Directives 1–7 are sound and should be kept as written.

---

## 11. Order of work

```
now      consent disclosure fix  ·  register acuitymath.org
           (cheap today, expensive later — not the Track A block)

Track B  ──▶  institutions, tenancy, ELO
                │
                ├──▶  Track C   LTI: keys → registry → launch → NRPS → AGS → DL ──┐
                ├──▶  Track D   OneRoster: client → sync → reconciliation         │
                └──▶  Track E   district surfaces, rebuilt on real data           │
                                                                                  ▼
Track A  ································································▶  membership,
           (waits for a product worth assessing)                     conformance, Safe
                                                                  Harbor, DPA, hosting

Track F  ──────────────────────────────────────────▶  (independent, start any time)
           ages 6–10 authoring, age 7 first
```

**B2 is the gate.** Multi-tenant authorization is the one place where a mistake
stops being a bug about one family and becomes a bug about a district. Nothing
in C, D or E should land before it has been mutation-tested.

**Track A is still the long pole — but a pole raised at the end.** Certification
calendars decide when the architecture's compliance language can appear on a
public surface, so leave roughly a quarter for them and start the membership when
Track C's conformance step comes into view. The mistake to avoid is not starting
late; it is **certifying a product that is still changing**, and then paying to
certify it again.

---

## 12. What does not change

The learner product keeps working for a family that signs up on its own, with no
institution behind it. That is not a fallback — it is the foundation the
institutional layer stands on, and every guarantee it makes about a child's data
holds identically whether a parent or a district put them there.
