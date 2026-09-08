# AcuityMath Comprehensive Prototype Audit & Production Readiness Report

**Target Subject:** AcuityMath Adaptive Learning Platform (Ages 3–18)  
**Evaluation Date:** September 7, 2026  
**Auditor:** Senior Full-Stack & EdTech Systems Architect  
**Audit Objective:** Rigorous, unbiased evaluation of the application's current prototype state against commercial production-grade standards.

---

## 1. Executive Summary & Prototype Maturity Score

The AcuityMath prototype is an **Advanced Functional Prototype (Late Alpha / Pre-Beta Design Stage)**. It demonstrates exceptional front-end user experience, thoughtful age-tiered pedagogical structure, smooth UI interactions, tactile mathematical manipulatives, and cohesive design ergonomics. 

However, from an infrastructure, security, data integrity, and compliance perspective, it relies heavily on **client-side state, browser `localStorage`, simulated synchronization, and unauthenticated role switching**. It is ready for user testing and stakeholder demonstrations, but cannot be deployed to real classrooms or homes without major backend and security engineering.

| Category | Current Prototype Rating | Target Production Standard | Readiness Gap |
| :--- | :---: | :---: | :---: |
| **UX & Visual Design** | 9.2 / 10 | 9.5 / 10 | Minor refinements |
| **Pedagogical UX & Tiering** | 8.8 / 10 | 9.5 / 10 | Needs deeper item bank |
| **Frontend Architecture** | 8.5 / 10 | 9.0 / 10 | Decoupling & bundle optimization |
| **Math Manipulatives & Canvas** | 8.0 / 10 | 9.2 / 10 | MathML / symbolic parser |
| **Data Persistence & Storage** | 3.5 / 10 | 9.5 / 10 | **Critical Gap** (Local vs Cloud DB) |
| **Authentication & RBAC** | 2.5 / 10 | 9.8 / 10 | **Critical Gap** (Mock PIN vs OAuth/JWT) |
| **Offline Architecture** | 4.0 / 10 | 9.0 / 10 | **Significant Gap** (Mock vs SW/IndexedDB) |
| **Regulatory Compliance (COPPA/FERPA)**| 2.0 / 10 | 10.0 / 10 | **Legal Blocker** |
| **Testing & CI/CD** | 3.0 / 10 | 9.0 / 10 | **Significant Gap** (0 unit/E2E tests) |
| **Overall Production Readiness** | **54%** | **100%** | **Phase 1 Alpha → Phase 2 MVP** |

---

## 2. Deep-Dive Dimension-by-Dimension Audit

### 2.1 Architecture & Infrastructure
* **Current Prototype State:**
  * Client-side Single Page Application (SPA) built with React 19, TypeScript 5.8, Tailwind CSS v4, and Vite 6.
  * Packaged with Express and `@google/genai` declared in `package.json`, but currently operating purely in the browser client runtime.
  * Static client asset bundling via Vite with zero remote API latency.
* **Production-Grade Standard:**
  * Decoupled full-stack architecture: React/Next.js/Vite frontend served over a CDN with a secure backend API layer (Node.js/Go/Python) orchestrating database queries, lesson state, AI evaluation, and telemetries.
  * Edge-cached assets with HTTP/3, Brotli compression, and dynamic code splitting by age-tier (to avoid downloading high-school calculus models to a 3-year-old’s tablet).
* **Gap & Risks:** The bundle currently loads all modules, curriculum definitions, and age data upfront. On low-end school Chromebooks or cellular connections, bundle size and hydration overhead will degrade cold start times.

---

### 2.2 Data Persistence, State & Database
* **Current Prototype State:**
  * Uses browser `localStorage` under `acuity_math_*` keys.
  * Profiles, screen time records, completed assignments, analytics maps, and rewards state reside entirely on the local client machine.
  * Clearing browser history or switching devices results in 100% data loss.
* **Production-Grade Standard:**
  * Cloud-native relational or document store (PostgreSQL via Supabase/Cloud SQL or Firebase Firestore).
  * ACID-compliant multi-tenant schema with Foreign Key constraints (`users`, `profiles`, `rosters`, `assignments`, `attempts`, `mastery_snapshots`).
  * Optimistic UI updates backed by WebSocket or Server-Sent Events (SSE) subscriptions for real-time classroom telemetry.
* **Gap & Risks:** No data durability, no cross-device continuity (a student cannot start on a school computer and finish at home), and high risk of local storage quota exhaustion (5MB browser limit).

---

### 2.3 Authentication, Authorization & Child Safety Security
* **Current Prototype State:**
  * Profile switching is completely unauthenticated on the client (`ProfileSwitchModal`).
  * Parent/Teacher PIN is a hardcoded UI string (`●●●●` or static state `1234`).
  * Anyone in the browser can inspect local storage and elevate themselves to Parent or Teacher mode, modify screen limits, or clear student records.
* **Production-Grade Standard:**
  * Multi-tier identity management:
    * **Parents/Educators:** Email/password or OAuth (Google Workspace, Apple ID, Clever, ClassLink) with signed JWTs (HttpOnly, Secure, SameSite cookies).
    * **Students:** Picture passwords / QR badges for Ages 3–6; simple secure PINs or SSO for Ages 7–18.
  * Strict Role-Based Access Control (RBAC) enforced server-side.
  * **COPPA (Children’s Online Privacy Protection Act) & FERPA Compliance:** Explicit verifiable parental consent (VPC) before storing personally identifiable information (PII) for children under 13.
* **Gap & Risks:** **Critical Blocker.** Current architecture violates COPPA/FERPA if deployed publicly without real auth, audit logs, and parent consent workflows.

---

### 2.4 Curriculum Depth & Pedagogical Adaptive Engine
* **Current Prototype State:**
  * **Age 3 Curriculum:** Highly detailed, multi-seasonal, tactile, 4-session yearly roadmap (`age3YearlyContent.ts`).
  * **Ages 4–18 Curriculum:** High-level scaffolding with representative sample modules and diagnostic items across 4 tiers (`curriculumData.ts` and `ageCurriculumData.ts`).
  * **Adaptive Logic:** Basic heuristic Elo adjustment (+/- rating points per question) and dynamic difficulty level scaling (1–10).
* **Production-Grade Standard:**
  * **Item Response Theory (IRT) / Computer Adaptive Testing (CAT):** Mathematically rigorous question difficulty calibration based on discrimination and pseudo-guessing parameters.
  * **Item Bank:** Minimum 10,000+ curated, standards-aligned questions (Common Core, TEKS, UK National Curriculum, IB) with distractors designed to pinpoint specific misconceptions (e.g., misapplying reciprocal operations).
  * Generative problem templates with parameter randomization to prevent rote memorization and answer sharing.
* **Gap & Risks:** The current prototype has enough content to demonstrate UX and pedagogy, but would exhaust its question bank in 1–2 study sessions for students outside Age 3.

---

### 2.5 Math Engine, Interactive Manipulatives & Scratchpad
* **Current Prototype State:**
  * Custom tactile widgets built in React & HTML5 Canvas:
    * *Early Sprouts:* Interactive Apple counter with basket drag/tap.
    * *Elementary:* SVG interactive fraction pizza cutter.
    * *Middle School:* Canvas coordinate plane with interactive slope/intercept recalculation.
    * *High School:* Interactive tangent line slope calculus visualizer.
  * Canvas-based scratchpad supporting drawing, eraser, math symbol stamping, and local PNG export.
* **Production-Grade Standard:**
  * Integration with MathML / KaTeX / MathJax for beautiful, accessible typography of complex fractions, integrals, and matrices.
  * Computer Algebra System (CAS) parser (e.g., Math.js or SymPy backend) capable of evaluating student scratchpad work, recognizing equivalent algebraic expressions ($2x + 4$ vs $2(x+2)$), and offering intermediate hints.
  * WebGL/WebGPU acceleration for complex 3D geometry and calculus graphing.
* **Gap & Risks:** Current scratchpad is a graphical drawing canvas; it cannot parse student handwriting or mathematical notation into computational feedback.

---

### 2.6 Offline Architecture & Synchronization Engine
* **Current Prototype State:**
  * UI includes `OfflineSyncBanner`, network simulation toggle, pending action counter, and simulated cloud sync with a 1.2s timeout.
  * Sync logs are generated in memory and saved to `localStorage`.
* **Production-Grade Standard:**
  * **Progressive Web App (PWA):** Custom Service Worker caching core app shells, audio files, and lesson assets for 100% offline functionality.
  * **Storage:** Client-side `IndexedDB` (using Dexie or local Firestore persistence) capable of storing megabytes of session telemetry and sound assets.
  * **Sync Protocol:** Conflict-Free Replicated Data Types (CRDTs) or deterministic event-sourcing queue with automatic retry, exponential backoff, and idempotency keys to prevent duplicate XP or credit gains when reconnecting.
* **Gap & Risks:** If the user goes truly offline in the current app, audio synthesized via `window.speechSynthesis` may fail without pre-cached local voices, and external CDN resources will not load.

---

### 2.7 Accessibility (a11y) & Universal Design
* **Current Prototype State:**
  * Quick toggles for High-Contrast Mode, Dyslexic-Friendly Typography (`font-fredoka`), and Text-to-Speech (TTS) via Web Speech API.
  * Independent scrolling structure ensuring the navigation sidebar never shifts during content browsing.
  * Visual feedback with sound synthesis fallback (`playSuccessSound`, `playClickSound`).
* **Production-Grade Standard:**
  * Full **WCAG 2.1 Level AAA** compliance for educational software:
    * All interactive canvas elements must have ARIA-fallback DOM trees for blind/visually impaired students using screen readers (JAWS, NVDA, VoiceOver).
    * Focus rings, complete keyboard navigation across all manipulatives (arrow keys for moving graph nodes or apple counters).
    * Professionally recorded native voiceovers for young learners (Ages 3–6) rather than mechanical browser TTS synthesizers.
* **Gap & Risks:** Web Speech API voices differ drastically between iOS, Android, and Windows, often sounding robotic or mispronouncing mathematical symbols (e.g., reading `f(x)` as "f parenthesis x").

---

### 2.8 Automated Testing, Observability & Error Handling
* **Current Prototype State:**
  * TypeScript type-checking (`tsc --noEmit`) and Vite compilation.
  * No unit tests, component test suites, or end-to-end (E2E) automation.
* **Production-Grade Standard:**
  * Unit test suite (Vitest) covering Elo algorithms, scoring formulas, and timer logic (>85% coverage).
  * Integration and component testing (React Testing Library) for manipulatives.
  * E2E test suites (Playwright/Cypress) simulating complete student lesson runs, parent limit locks, and offline reconnect flows.
  * Error tracking and telemetry (Sentry/Datadog) with privacy filtering (scrubbing child data).
* **Gap & Risks:** Any refactor of complex state in `App.tsx` risks silent regressions in student analytics, streak counters, or lesson completion scoring.

---

## 3. Comparative Architecture Matrix: Prototype vs. Production

| Engineering Layer | Prototype (Current) | Production-Ready Target | Effort to Bridge |
| :--- | :--- | :--- | :---: |
| **Frontend Framework** | React 19 + Vite (Client SPA) | React 19 / Next.js SSR + Static Edge CDN | Low-Medium (2 wks) |
| **Data Storage** | Browser `localStorage` (5MB cap) | PostgreSQL / Firestore with Realtime Streams | High (4 wks) |
| **User Identity** | Client profile selector + Mock PIN | OAuth 2.0 / JWT / Clever SSO + COPPA Parental Auth | High (4 wks) |
| **Offline Engine** | In-memory simulated queue | Service Worker Cache + IndexedDB + Idempotent Sync | Medium (3 wks) |
| **Curriculum Content** | Age 3 deep content + ~25 sample lessons | 10,000+ item bank with dynamic parameter generation | High (Content Team) |
| **Math Evaluation** | Multiple-choice string equality | Symbolic Computer Algebra System (CAS) + LaTeX | High (6 wks) |
| **Voice / Speech** | Browser `window.speechSynthesis` | Pre-recorded studio voiceovers + Cloud Neural TTS | Medium (3 wks) |
| **Screen Time Enforcement** | Client badge + CSS alert state | Hard OS-level / Account-level session locks | Low-Medium (1 wk) |
| **CI/CD & Testing** | Linter (`tsc --noEmit`) | Vitest + Playwright E2E + Automated Deployments | Medium (2 wks) |

---

## 4. Prioritized Production Transition Roadmap

```
[ Phase 1: Security & Cloud Core ] ───▶ [ Phase 2: Offline & Engine ] ───▶ [ Phase 3: Content Scale ] ───▶ [ Phase 4: Enterprise/LMS ]
  • Cloud Database (Firestore/PG)        • Service Worker PWA               • 10,000+ Problem Bank           • Google Classroom & Clever SSO
  • Real Auth & Parental COPPA           • IndexedDB Replay Queue           • LaTeX / KaTeX rendering        • LTI 1.3 LMS Integration
  • Server-Side RBAC Enforcement         • Studio Voice Audio Assets        • Dynamic IRT Adaptive Alg.      • District Admin Dashboard
```

---

## 5. Auditor's Conclusion

**AcuityMath is an exceptionally crafted front-end prototype.** The design system, age-tier scaffolding, responsive layout isolation, and execution-oriented Student Dashboard demonstrate elite product intuition and user empathy. 

Its current stage accomplishes **100% of its goal as a functional prototype**: validating the vision, interaction design, and pedagogical philosophy. The path to production does not require redesigning the user interface; rather, it requires wrapping this UI around enterprise cloud persistence, COPPA-grade security, and a deep, curriculum-aligned question engine.
