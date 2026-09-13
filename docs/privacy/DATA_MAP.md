# Data map

> **Purpose.** The inventory a COPPA Safe Harbor application, a Data Protection
> Addendum and a privacy policy all need: what personal data AcuityMath collects,
> why, where it lives, how long, who can reach it, and what leaves the system.
>
> **Derived from `drizzle/schema.ts` and the code paths that write it**, not from
> a description of the product. Where this disagrees with the consent disclosure
> in `src/data/consentPolicy.ts`, that is a finding, not a rounding error — see §6.
>
> **Track A** in `docs/ROADMAP.md`. Status: first draft, engineering-verified.
> Not legally reviewed.

---

## 1. What is collected about a child

A learner record is deliberately thin. **There is no surname, no address, no
photograph, no date of birth and no way to contact the child.**

| Field | Table | Why it exists | Notes |
| --- | --- | --- | --- |
| Display name | `learners.display_name` | Shown on the child's own profile | Chosen by the guardian; may be a first name or a nickname |
| Birth **year** | `learners.birth_year` | Tier selection, and the under-13 consent gate | Year only — not a date of birth |
| Avatar | `learners.avatar` | Personalisation | An emoji |
| Answers given | `attempts.submitted_answer` | Marking, mastery, and the 3PL ability estimate | The child's own keystrokes for a maths answer |
| Response time | `attempts.response_time_ms` | Item calibration | |
| Correctness, misconception code | `attempts` | Diagnostic feedback | |
| Ability estimate (θ, SEM, ELO) | `learner_ability`, `_history` | Choosing the next question | Derived, not collected |
| Concept mastery | `learner_concept_mastery`, `_history` | Progress and parent reporting | Derived |
| Practice sessions | `practice_sessions` | Grouping a sitting | |
| Screen-time usage | `screen_time_usage` | Enforcing the guardian's limit | Minutes per day |
| Coins, XP, streak, avatars owned | `learner_rewards`, `learner_avatars` | Motivation | Derived from attempts |
| Access token hash | `learner_access_tokens.secret_hash` | QR / picture login | A hash, never the token |

**Not collected:** location, device identifiers, contacts, photographs,
biometrics, behavioural advertising signals, or any third-party tracking.

## 2. What is collected about a guardian or teacher

| Field | Table | Why |
| --- | --- | --- |
| Email address | `users.email` | The only credential — sign-in is by emailed link |
| Name (optional) | `users.name` | Display |
| Role | `users.role` | `parent`, `teacher`, `admin` |
| Step-up PIN **hash** | `users.step_up_pin_hash` | Adult gate. scrypt; the PIN itself is never stored |
| Lockout timestamp | `users.step_up_locked_until` | Throttling repeated PIN attempts |
| **IP address** | `magic_link_tokens.requested_from_ip` | Abuse limiting on sign-in requests |
| Sign-in token hash, expiry | `magic_link_tokens` | Short-lived; the token itself is never stored |

## 3. Consent records

`consent_events` is append-only. A consent is never edited; a change is a new row.

| Field | Why it is kept |
| --- | --- |
| `decision`, `recorded_at` | What was agreed and when |
| `policy_version`, `policy_sha256` | **Which exact text** was shown. The hash is computed server-side from the server's own copy, so a client cannot claim consent to text never displayed |
| `attested_name` | The name the guardian typed as their attestation |
| `verified_email`, `email_verified_at` | Which address was verified, and when the link was consumed |
| `second_step_sent` | Whether a confirming step was performed — **false** today, recorded honestly |
| `granted_by_user_id` | Who granted it |

## 4. What leaves the system

**One destination: Google Gemini**, for the Socratic coach.

| Sent | Not sent |
| --- | --- |
| The problem text, options, correct answer | Learner id |
| The child's submitted answer | Display name |
| The child's **free-text message** to the coach | Email address |
| Approximate age and tier | Any account identifier |

**No identifier accompanies the request.** `SocraticRequest` in `server/gemini.ts`
carries no learner id, name, email or user id — verified by reading the type and
the call site. The call is made **server-side**; the API key never reaches the
browser.

> **The free-text field is the exposure.** `SocraticCoachModal` lets the child
> type a question in their own words (`userMessage`). A child can type anything
> there, including their name. The field is necessary for the pedagogy and the
> risk cannot be designed away entirely, but it must be **disclosed**, and it is
> the reason §6 below is a finding rather than a note.

**Nothing else leaves.** No analytics provider, no advertising network, no error
telemetry, no tracking pixels. Email delivery (SMTP) carries the guardian's
address for sign-in links and nothing about the child.

## 5. Retention and deletion

| Data | Retention today |
| --- | --- |
| Sign-in tokens | Expire by `expires_at`; short-lived |
| Learner record | **Soft delete** via `learners.archived_at` — "a COPPA deletion request must not orphan a teacher's roster" |
| Attempts, mastery, ability, rewards | Cascade from the learner row on hard delete; retained while archived |
| Consent events | Append-only. Withdrawal adds a row; it does not erase history |
| Screen-time usage | Per learner per day; no expiry implemented |

🎯 **Gaps to close before a Safe Harbor application.** Stated as gaps rather than
glossed:

1. **No retention schedule.** Nothing expires attempts, usage rows or archived
   learners. COPPA requires retention only as long as reasonably necessary.
2. **No implemented erasure path.** `archived_at` exists; a verified
   parental deletion request has no procedure behind it. The legacy
   `/auth/coppa-purge` route was deleted in PR #20 because it was gated on a
   plaintext PIN comparison, and **nothing replaced it**.
3. **Withdrawal stops collection but does not delete.** That is a deliberate
   decision (recorded in E1b) and a defensible one — but it must be stated to
   parents, because "withdraw" reads as "erase" to most people.

## 6. 🔴 Finding — the disclosure does not mention the AI coach

The consent text parents agree to (`CONSENT_POLICY_VERSION = '2026-09-v1'`) says:

> "It is not used for advertising, and **it is not sold or shared with anyone
> else.**"

A child's typed message to the Socratic coach is sent to Google. There is a
defensible reading — Google is a **processor** acting on instruction, not a third
party receiving data for its own purposes, and no identifier is attached — but:

- The clause is **unqualified**. A parent reading it would not expect their
  child's words to reach another company under any framing.
- COPPA requires disclosing the operators to whom information is **disclosed**,
  processor or not.
- A Safe Harbor assessor will find this, and finding it themselves is worse than
  us having fixed it.

**Recommended fix: a new policy version, not an edit.** The machinery for this
already exists and was built for exactly this case:

- `CONSENT_POLICY_VERSION` bumps to `2026-09-v2` with a clause naming the AI
  coach, what is sent, and that no identifier accompanies it.
- Every existing consent becomes `superseded`, which **does not count as
  consent** — the gate in `server/learning/consentGate.ts` already enforces that.
- Under-13s whose guardians have not re-consented fall back to local-only
  practice and are told so. Nothing is recorded for them meanwhile.

That is the versioned-consent design doing its job on its first real test. It is
also a decision with a cost — every family must re-consent — so it is raised
here rather than taken unilaterally.

## 7. Access

| Who | Can reach |
| --- | --- |
| Guardian | Their own children only. Enforced by `learnerProcedure`; another family's child answers **`NOT_FOUND`**, never `FORBIDDEN`, so learners cannot be enumerated |
| Guardian, elevated | Consent, screen-time limits, analytics — behind step-up PIN (scrypt, with lockout) |
| Teacher | Their classroom roster. Deliberately **not** granted guardian powers |
| Admin | All learners. The only bypass, and it is the role's purpose |
| 🎯 Institutional admin | Does not exist yet. **Track B2**, and the highest-risk change on the roadmap |

## 8. Where it lives

MySQL 8.4, via Drizzle. One database; no replicas, no data warehouse, no
analytics store. **Transport and at-rest encryption are deployment concerns and
are not configured in this repository** — they belong to whatever hosts it, and
that host is itself a Track A decision.

---

## What this unblocks

| Track A item | Needs this document for |
| --- | --- |
| COPPA Safe Harbor application | The data inventory and retention schedule are core to the assessment |
| Data Protection Addendum | Subprocessor list (Google, the SMTP provider, the host), data categories, retention |
| Privacy policy | Plain-language version of §1–§5 |
| Hosting decision | §8 — encryption in transit and at rest become the host's responsibility and must be contracted |

**Subprocessors to declare:** Google (Gemini, Socratic coach), the SMTP provider
(sign-in links), and the hosting provider once chosen.
