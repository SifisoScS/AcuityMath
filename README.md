# AcuityMath Adaptive Learning Platform

<p align="center">
  <img src="./public/banner.jpg" alt="AcuityMath Hero Banner" width="100%" style="border-radius: 16px; max-height: 420px; object-fit: cover;" />
</p>

<p align="center">
  <strong>AcuityMath</strong> is an age-adaptive K–12 mathematics learning platform powered by 3-Parameter Logistic (3PL) Item Response Theory, real-time Socratic AI tutoring, and interactive digital manipulatives.
</p>

<p align="center">
  <img src="https://img.shields.io/badge/TypeScript-007ACC?style=flat-square&logo=typescript&logoColor=white" alt="TypeScript" />
  <img src="https://img.shields.io/badge/React%2019-20232A?style=flat-square&logo=react&logoColor=61DAFB" alt="React" />
  <img src="https://img.shields.io/badge/Vite%206-646CFF?style=flat-square&logo=vite&logoColor=white" alt="Vite" />
  <img src="https://img.shields.io/badge/Tailwind_CSS%204-38B2AC?style=flat-square&logo=tailwind-css&logoColor=white" alt="Tailwind CSS" />
  <img src="https://img.shields.io/badge/tRPC%2011-2596BE?style=flat-square&logo=trpc&logoColor=white" alt="tRPC" />
  <img src="https://img.shields.io/badge/MySQL%208.4-4479A1?style=flat-square&logo=mysql&logoColor=white" alt="MySQL" />
  <a href="./ARCHITECTURE.md"><img src="https://img.shields.io/badge/Developer_Guide-ARCHITECTURE.md-darkviolet?style=flat-square&logo=markdown" alt="Architecture Guide" /></a>
</p>

---

## 📖 Complete Developer & AI Agent Blueprint

For the platform mission, pedagogical theory (CRA, ZPD, and the 3PL IRT
formulation), the Chromebook Web Worker offloading rationale, the multi-role
security model, and the container runtime facts, see the
**[AcuityMath System Blueprint & Engineering Handbook](./ARCHITECTURE.md)**.

**It is the specification, not a report on what runs today** — every section is
marked ✅ Built, 🟡 Partial or 🎯 Target, so intent and implementation can be told
apart without opening the code. Two companions:

- **[docs/ROADMAP.md](./docs/ROADMAP.md)** — the distance from here to that document, and the order of travel.
- **[docs/MIGRATION_STATUS.md](./docs/MIGRATION_STATUS.md)** — what has landed, the decisions that are settled, and the traps that cost time so they do not cost it twice.

---

## 🎯 One-Sentence Overview

> **AcuityMath is an age-adaptive K–12 mathematics learning platform powered by 3-Parameter Logistic (3PL) Item Response Theory, real-time Socratic AI tutoring, and interactive digital manipulatives.**

---

## 🏗️ System Architecture

A React single-page application, client-side psychometric Web Workers to keep the
main thread free on low-spec Chromebooks, and a tRPC API over MySQL.

```mermaid
flowchart TB
    subgraph Client ["Client Browser (Chromebook / Web / Tablet)"]
        UI["React 19 Single-Page Application"]
        Canvas["Interactive HTML5/SVG Manipulatives"]
        Worker["Web Worker (Background Thread)"]
        LocalCache["IndexedDB Offline Queue"]
    end

    subgraph Psychometrics ["Psychometric IRT Engine"]
        Worker -->|Async 3PL Estimation| IRTMath["Newton-Raphson MLE Theta Update"]
        Worker -->|ZPD targeting| ZPD["Zone of Proximal Development Calibration"]
    end

    subgraph Server ["Application Server (Express + Vite middleware)"]
        TRPC["tRPC Router — the application API"]
        Auth["Magic-link sessions, step-up PIN elevation"]
        Gate["Consent gate & server-measured screen time"]
        REST["Small REST surface (/api): health, consent 410, AI proxy"]
    end

    subgraph Data ["Data & AI"]
        Gemini["Google Gemini Socratic AI API"]
        MySQL["MySQL 8.4 via Drizzle ORM"]
    end

    UI <-->|Offloads IRT Math| Worker
    UI <-->|Touch & Drawing Events| Canvas
    UI <-->|Queues answers when offline| LocalCache
    UI <-->|Typed procedure calls| TRPC

    TRPC --> Auth
    TRPC --> Gate
    TRPC <-->|Learners, attempts, mastery, consent| MySQL
    REST <-->|Socratic hints & scaffolding| Gemini
```

---

## 🔬 3PL Item Response Theory (IRT) Adaptive Feedback Loop

Unlike static question banks, AcuityMath uses the **3-Parameter Logistic (3PL) IRT Model** to continuously calibrate student latent mathematical ability ($\theta$) in real time.

$$P(X_i = 1 \mid \theta) = c_i + \frac{1 - c_i}{1 + e^{-D \cdot a_i(\theta - b_i)}}$$

Where:
- $\theta$: Student latent ability ($-\infty < \theta < +\infty$, typically mapped from $-3.0$ to $+3.0$)
- $a_i$: Item discrimination parameter
- $b_i$: Item difficulty parameter
- $c_i$: Pseudo-guessing lower asymptote
- $D = 1.702$: Normal ogive scaling constant

Correctness and mastery are decided **server-side**, inside the transaction that
records the attempt. The browser also evaluates the answer so feedback is
immediate; that is a rendering concern, and the server's answer is the one that
counts.

```mermaid
sequenceDiagram
    autonumber
    actor Student as Student (Learner)
    participant UI as Interactive Math Problem
    participant Worker as Background Web Worker
    participant Server as tRPC practice router

    Student->>UI: Selects or inputs problem solution
    UI->>Worker: postMessage(CALCULATE_3PL, { currentTheta, itemParams, isCorrect })
    Worker-->>UI: Provisional ability profile (main thread unblocked)
    UI->>Server: practice.submit(answer, clientId)
    Server-->>UI: Verdict, explanation, new mastery and ability
    UI-->>Student: Displays the marked answer and the next challenge
```

---

## 👥 Role-Based Workflow & Security Model

```mermaid
graph LR
    subgraph Roles ["User Personas"]
        S["Student (Ages 3-18)"]
        T["Teacher / Faculty"]
        P["Parent / Guardian"]
    end

    subgraph Features ["Platform Capabilities"]
        S -->|Accesses| S_Feat["7-Item Placement Quest<br/>Interactive Manipulatives<br/>Bilingual Vocab Highlighting<br/>Infinite Adaptive Practice"]
        T -->|Controls| T_Feat["Assignments with entitlement checks<br/>Roster progress from real attempts<br/>Classroom interventions"]
        P -->|Supervises| P_Feat["PIN-Protected Dashboard<br/>Enforced Screen Time Limits<br/>COPPA Parental Consent<br/>Printable QR Badge Cards"]
    end
```

A district administrator role exists in the data model, but **the district and LMS
surfaces are not reachable** — see *Not built* below.

---

## 🌟 Key Features

### 1. Pedagogical Scaffolding Across 4 Developmental Tiers
- 🌱 **Early Sprouts (Ages 3–5):** Tactile ten-frames, interactive apple counters, color-coded pattern blocks, and full speech audio narration.
- 🔍 **Elementary Explorers (Ages 6–10):** Dynamic fraction pizza visualizer with animated slices, base-ten place-value blocks, and step-by-step arithmetic.
- 🧭 **Middle School Navigators (Ages 11–13):** Dynamic Cartesian coordinate system with live linear equation graphing ($y = mx + b$) and algebraic balance scales.
- 🎓 **High School Scholars (Ages 14–18):** Real-time differential calculus tangent visualizer for $f(x) = x^2$ with live derivative slope calculation $f'(x) = 2x$, trigonometric unit circle, and matrices.

### 2. Socratic AI Tutor & In-Problem Bilingual Scaffolding
- **Guiding, Not Spoiling:** Multi-turn conversational guidance powered by Google Gemini that breaks complex problems into intuitive mental steps without giving away answers. When the API is unreachable it falls back to a deterministic engine and **labels the reply as a fallback** rather than passing it off as the coach.
- **Dual-Language Highlighting (English ⟷ Español):** Real-time lexical analysis underlines academic math vocabulary in problem prompts. Tapping any word displays dual-language definitions, cognates, and native text-to-speech audio pronunciation.
- **Integrated Bilingual Glossary:** Searchable compendium of mathematical vocabulary terms categorized across arithmetic, geometry, algebra, and calculus.

### 3. Verified Content, and a Generator for the Gaps
- **63 concepts, 1,132 authored problems, 572 hints** in the database. Every authored answer is checked by a two-part integrity gate — a structural pass and a symbolic pass using SymPy — which runs in CI and fails the build.
- **The generator covers what the corpus does not**, at runtime, for ages the authored set does not reach.
- **Known gap:** ages 6–10 are thin and **age 7 has no authored problems at all**. See `docs/MIGRATION_STATUS.md`.

### 4. Child-Safety Controls That Are Enforced
- **Parental consent is recorded and enforced.** Consent is a row in `consent_events` with a server-computed hash of the exact disclosure text shown. For under-13s **without** consent, practice still works — questions are generated in the browser and nothing leaves the device — and the child is told so.
- **Screen-time limits are measured by the server.** The beat carries no duration: the server measures the interval itself, because a counter the client increments is one the child it restricts can decline to increment.
- **Step-up PIN elevation** (scrypt, with lockout) guards anything that touches a child's records.

---

## 🚧 Not built

Stated plainly, because an earlier version of this README claimed these as
shipped features.

- **No LTI 1.3, OIDC or OneRoster integration.** There is no such code in the
  repository. The onboarding wizard renders a configuration form; it is not
  connected to anything.
- **No LMS grade passback or roster sync** — not to Canvas, Schoology, Google
  Classroom, Clever, Blackboard, D2L, PowerSchool, Infinite Campus or Skyward.
- **No district analytics, CSV efficacy export or compliance briefings.** Those
  surfaces exist as unrouted code and are unreachable from the application.
- **No compliance certification of any kind.** The product implements parental
  consent and role-based access control; it has not been certified under COPPA
  Safe Harbor, and no FERPA attestation has been made.
- **No at-rest encryption, and TLS is not configured here** — it is expected to
  terminate at whatever fronts the app in a real deployment.

Whether the institutional direction is taken at all is an open decision, recorded
in `docs/MIGRATION_STATUS.md`.

---

## 📂 Project Structure

```
acuitymath/
├── server.ts                     # Express host, Vite middleware in development
├── drizzle/
│   ├── schema.ts                 # MySQL schema (Drizzle)
│   ├── migrations/               # Generated, applied in order
│   └── writers.test.ts           # Asserts every table has a writer
├── server/
│   ├── trpc/routers.ts           # The application API
│   ├── auth/                     # Magic links, sessions, step-up PIN (scrypt)
│   ├── learning/                 # Attempts, mastery, rewards, consent, screen time
│   ├── curriculum/               # Corpus import and age banding
│   ├── api.ts                    # Small REST surface: health, consent 410, AI proxy
│   └── gemini.ts                 # Socratic coach proxy
├── scripts/
│   ├── audit-generator.ts        # Content integrity gate (structural + SymPy)
│   └── seed-curriculum.ts        # Corpus import
└── src/
    ├── App.tsx                   # Main orchestrator component
    ├── components/               # Views and modals
    ├── hooks/                    # Typed tRPC-backed state (practice, consent, screen time)
    ├── offline/                  # IndexedDB queue and reconciler
    ├── services/
    │   ├── adaptiveEngine.ts     # 3PL IRT mathematical engine
    │   └── problemGenerator.ts   # Algorithmic problem generation
    └── workers/adaptiveWorker.ts # Background psychometrics worker thread
```

---

## 🚀 Getting Started

### Prerequisites
- **Node.js 22** — what CI runs; no `engines` range is declared
- **pnpm** — this project uses pnpm, not npm (`packageManager` is pinned in `package.json`)
- **Docker**, for MySQL. There is no local-file fallback: a silent one would present an empty database as a working install.
- **Python with SymPy**, for the content integrity gate

### Installation

```bash
git clone https://github.com/SifisoScS/AcuityMath.git
cd AcuityMath
pnpm install
```

### Database

Port 3307 deliberately, so it does not collide with a local MySQL on 3306.

```bash
docker run -d --name acuitymath-mysql \
  -e MYSQL_ROOT_PASSWORD=root -e MYSQL_DATABASE=acuitymath \
  -p 3307:3306 mysql:8.4

cp .env.example .env      # then set DATABASE_URL and JWT_SECRET
pnpm db:migrate
pnpm db:seed              # the authored corpus
pnpm db:seed:demo         # a demonstration family, with consent recorded
```

### Development

```bash
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000).

### Tests

```bash
pnpm test                 # integration suites skip without DATABASE_URL
pnpm audit:generator      # content integrity gate
pnpm lint                 # tsc --noEmit
```

A green `pnpm test` with no `DATABASE_URL` is **not** full coverage — the
integration suites skip themselves. See *Getting running again* in
`docs/MIGRATION_STATUS.md`.

---

## 🔒 Security & Student Privacy

- **Parental consent** is recorded in an append-only ledger against the exact
  policy version and a server-computed hash of the text shown. Consent under a
  superseded policy version does not count as consent.
- **Recording is gated on it.** An under-13 without consent can practise; their
  work is not written down, and the server refuses the write rather than
  accepting it and discarding it silently.
- **Role-based access control is enforced server-side.** Reaching another
  family's child answers `NOT_FOUND` rather than `FORBIDDEN`, so the platform's
  learners cannot be enumerated.
- **Step-up elevation** uses scrypt with lockout; PINs are never compared in
  plaintext.
- **Screen-time limits** are measured and enforced by the server.

Transport security is a deployment concern and is **not configured in this
repository**. No at-rest encryption is implemented.

---

## 📄 License

**Not yet licensed.** There is no `LICENSE` file and no `license` field in
`package.json`. An earlier version of this README stated MIT and pointed at a
file that does not exist; until a licence is chosen and added, all rights are
reserved by default.
