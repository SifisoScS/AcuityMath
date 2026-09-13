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
| §7 LTI 1.3 Advantage — OIDC, Deep Linking 2.0, AGS v2.0 | **Nothing exists.** No LTI, OIDC or JWT-platform code in the repository |
| §7 Endpoint URLs (`/api/lti/launch`, `/login_init`, `/jwks.json`) | Do not exist, and `acuitymath.org` is not registered to this project |
| §7 OneRoster 1.2 (`/api/oneroster/v1p2`) | Nothing exists |
| §7 Self-serve wizard with handshake testing | `LtiOnboardingWizardModal.tsx` renders a form and **makes no network calls** |
| §8 District console, CSV, CCSS audit, PDF brief | `DistrictAdminDashboard.tsx` exists but is unrouted, and seeds **invented campuses** into its own state |
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

**Start these first.** They take months of calendar time and no amount of code
shortens them. Every one is a prerequisite for a claim the architecture makes.

| Item | What it actually requires | Blocks |
| --- | --- | --- |
| **1EdTech membership** (formerly IMS Global) | Paid membership. Certification is only available to members | Any honest use of "LTI 1.3 Advantage" or the certified mark |
| **LTI Advantage conformance** | Passing 1EdTech's conformance suite per service (Core, NRPS, AGS, Deep Linking) | The §7 claims |
| **COPPA Safe Harbor** | Application to an **FTC-approved** program — PRIVO, kidSAFE or ESRB — including a privacy assessment and annual review | The §8 badge |
| **FERPA posture** | FERPA binds *schools*, not vendors. What a vendor provides is a **Data Protection Addendum**, a data map, a subprocessor list, and breach terms | The §8 claim, which should be reworded from "compliant" to what is actually offered |
| **Domain and hosting** | `acuitymath.org`, and a host that runs a **persistent Node process plus MySQL** | Every LTI endpoint, which platforms must reach at a stable HTTPS URL |

> **A note on hosting, because it is a live trap.** This project builds *two*
> artefacts: a static client and `dist/server.cjs`. A static-only deploy — which
> is what a Vite-preset import to a static host produces — serves the client and
> never runs the server. Every guarantee in §8 lives in the half that would not
> run: auth, the consent gate, screen time, entitlement. A static deployment of
> AcuityMath is not a limited version of it; it is the appearance of it.

**Until Track A completes, the architecture's compliance and certification
language stays out of the README and out of any public surface.** That is not a
retreat from the vision — it is the difference between holding a certification
and claiming one.

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

### B3 — Reconcile the ELO mapping

`ARCHITECTURE.md` §4 specifies `1000 + 250θ`; `adaptiveEngine.ts` uses
`1200 + 300θ`. Pick one and make both say it. The document is the specification,
so absent a reason, the code moves — but the code's range is live in dashboards,
so this is a migration, not an edit.

---

## 6. Track C — LTI 1.3 Advantage

Sequenced by dependency. Each step is independently useful and independently
testable against 1EdTech's reference platform before any real LMS is involved.

| Step | Scope | Done when |
| --- | --- | --- |
| **C1 Keys** | RSA-256 keypair, JWKS endpoint, rotation without downtime | A platform can fetch `/api/lti/jwks.json` and verify a token we signed |
| **C2 Platform registry** | Store issuer, client id, deployment id, keyset URL per platform | Two platforms can be registered and neither can impersonate the other |
| **C3 Core launch** | OIDC third-party initiation, launch validation, nonce and state replay protection, user provisioning into B1's entities | A launch from the reference platform lands a real learner in a real classroom |
| **C4 NRPS** | Names and Roles — pull the roster from the platform | A class roster matches the platform's without manual entry |
| **C5 AGS v2.0** | Line items and score passback | A completed session appears in the platform gradebook |
| **C6 Deep Linking 2.0** | Teacher selects a concept or quest; platform receives a signed content item | A teacher can embed a specific quest |
| **C7 Conformance** | Run 1EdTech's suite per service | Certification, and only then the badge |

**Reuse rather than rebuild:** C3's provisioning should write through the same
`recordConsent` path — with method `institutional_agreement` — so a school-consented
pupil satisfies the existing consent gate rather than bypassing it. The gate
refuses writes for learners without consent, and an LTI-provisioned pupil must go
through it, not around it.

---

## 7. Track D — OneRoster 1.2

Depends on B1. Independent of Track C.

- **D1** — REST client with OAuth 2 client credentials, against a sandbox first.
- **D2** — Sync orgs, academic sessions, courses, classes, enrollments, users.
- **D3** — Idempotent reconciliation. **This project already knows how to do
  this**: Graft D's offline queue solved the same problem with a `client_id`
  unique per learner and an "only leaves the queue when the server has it" rule.
  A nightly roster sync is that pattern with a different source.

**Done when:** running the sync twice changes nothing the second time, and a
pupil removed at the SIS is deactivated rather than deleted.

---

## 8. Track E — the district surfaces, rebuilt

`DistrictAdminDashboard.tsx` is 1,353 lines and was the second-largest file in
the product on the day it was scaffolded — before any institutional data existed
to fill it. It seeds its own campuses, and it still renders "Google Classroom &
Canvas Live".

**Treat it as a design reference, not a head start.** The layout and the
information architecture are worth keeping; the data layer under it must be
built from B1 and the component re-derived from real queries. Reviving it as-is
would reintroduce invented data behind a real login, which is worse than the
quarantine it is in now.

- **E1** — Multi-campus analytics from real attempts, via the same derivation
  `learnerAnalytics` already uses for parents.
- **E2** — RFC 4180 CSV export from those queries.
- **E3** — CCSS coverage from the authored corpus, which means it will honestly
  show the gap in §9 rather than a full matrix.
- **E4** — Restore the nav entry and the route, and delete the seeded state in
  the same change. The `'district' → 'admin'` role mapping was kept for exactly
  this moment.

---

## 9. Track F — the content gap

Independent of every other track, and the largest *product* gap.

Concepts with at least one authored problem, by age:

```
 3:5   4:9   5:9   6:6   7:0   8:3   9:8  10:7
11:6  12:14 13:25 14:20 15:13 16:8  17:3 18:1
```

**Age 7 has no authored problems at all.** The generator covers it at runtime, so
a seven-year-old gets questions — but nobody has checked those the way the 1,132
authored ones were checked by the integrity gate.

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
Track A  ──────────────────────────────────────────▶  (start now, runs for months)
           membership · Safe Harbor · DPA · domain · hosting

Track B  ──▶  institutions, tenancy, ELO
                │
                ├──▶  Track C   LTI: keys → registry → launch → NRPS → AGS → DL → conformance
                ├──▶  Track D   OneRoster: client → sync → reconciliation
                └──▶  Track E   district surfaces, rebuilt on real data

Track F  ──────────────────────────────────────────▶  (independent, start any time)
           ages 6–10 authoring, age 7 first
```

**B2 is the gate.** Multi-tenant authorization is the one place where a mistake
stops being a bug about one family and becomes a bug about a district. Nothing
in C, D or E should land before it has been mutation-tested.

**Track A is the long pole.** Certification calendars, not sprints, decide when
the architecture's compliance language can appear on a public surface. Starting
it late is the only way to make the engineering wait.

---

## 12. What does not change

The learner product keeps working for a family that signs up on its own, with no
institution behind it. That is not a fallback — it is the foundation the
institutional layer stands on, and every guarantee it makes about a child's data
holds identically whether a parent or a district put them there.
