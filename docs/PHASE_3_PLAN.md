# AcuityMath — Phase 3 Execution Plan: Socratic AI Math Coach, Generative Problem Engine & IRT Adaptive Intelligence

**Document Version:** 1.0.0  
**Status:** LOCKED & ACTIVE  
**Target Horizon:** Phase 3 of Multi-Tier Architecture Roadmap  
**Primary Objective:** Transform AcuityMath from a finite set of curated lessons into an infinite, intelligent mathematical learning ecosystem. Integrate an AI-powered Socratic Math Coach (via server-side Gemini API), a dynamic generative problem engine with distractor misconception diagnostics, and a psychometric Item Response Theory (IRT / CAT) adaptive ability calibrator.

---

## 1. Executive Summary & Pedagogical Framework

The AcuityMath comprehensive audit identified two fundamental gaps in the learning engine:
1. **Item Bank Exhaustion:** Finite static questions limit mastery drills, re-takes, and automated parameter variations.
2. **Cognitive Feedback Depth:** Traditional binary right/wrong checks do not diagnose *why* a student stumbled or scaffold understanding without giving away the answer.

### Phase 3 Core Deliverables:
1. **Server-Side Socratic AI Math Coach (`/api/ai/socratic-coach`)**:
   - Built with Google Gemini API (`@google/genai` using model `gemini-3.8-flash`).
   - Socratic dialog mode: never gives away the final answer immediately; provides guided questioning, step 1 scaffolding, real-world analogies, and misconception explanations.
   - Age-adapted coaching tone:
     - *Early 3–5:* Warm, playful, conversational, uses concrete items (apples, stars, teddy bears).
     - *Elementary 6–10:* Encouraging, visual-breakdown, step-by-step arithmetic hints.
     - *Middle 11–13:* Inquisitive, algebraic strategy prompts, zero-pair and balance analogies.
     - *High 14–18:* Rigorous mathematical reasoning, conceptual derivations, and theorem checks.
   - Server-authoritative fallback engine providing instant high-quality Socratic hints even if the external API key is absent or offline.
2. **Infinite Generative Problem Bank Engine (`problemGenerator.ts`)**:
   - Parameterized algorithmic generators spanning all 4 tiers:
     - *Tier 1:* Counting bonds, pattern continuation, shape attributes, ten-frame compositions.
     - *Tier 2:* Multi-digit mental math, fraction equivalence, area/perimeter, multiplication arrays.
     - *Tier 3:* Two-step linear equations ($ax + b = c$), integer operations, ratios & percentages, coordinate distance.
     - *Tier 4:* Quadratic factoring, Pythagorean & trigonometric evaluation, polynomial derivatives.
   - Dynamic parameter randomization prevents rote memorization.
3. **Misconception Diagnostic Taxonomy**:
   - Every generated distractor is tied to a specific cognitive error code (e.g., `SIGN_ERROR`, `INVERTED_FRACTION`, `ORDER_OF_OPERATIONS`, `ADDITIVE_INSTEAD_OF_MULTIPLICATIVE`, `OFF_BY_ONE_COUNTING`).
   - Pinpoints the student's exact misunderstanding upon incorrect submissions.
4. **Item Response Theory (IRT) & CAT (Computer Adaptive Testing) Engine (`adaptiveEngine.ts`)**:
   - 3-Parameter Logistic (3PL) model modeling item discrimination ($a$), difficulty ($b$), and pseudo-guessing ($c$).
   - Real-time latent ability estimation ($\theta \in [-3.0, +3.0]$) with Standard Error of Measurement (SEM).
   - Dynamic next-item selection matching item difficulty $b$ to student ability $\theta$ for optimal zone of proximal development (ZPD).
5. **Interactive UI Integrations**:
   - **Socratic AI Coach Dialog & Drawer**: Integrated directly within `InteractiveLessonModal` and accessible from the math workspace.
   - **Infinite Adaptive Practice Mode**: New quick-launch mode on the Student Dashboard for endless calibrated problem solving.
   - **Teacher & Parent Diagnostic Mastery Panel**: Real-time display of IRT $\theta$ curve, diagnostic misconception frequencies, and targeted recommendations.
6. **Mathematical Typesetting & Accessible Formula Rendering**:
   - Visual fraction formatting ($ \frac{a}{b} $), exponents ($x^n$), roots ($\sqrt{n}$), and algebraic steps for clarity.

---

## 2. Technical Architecture (Phase 3)

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                      Client Layer (React 19 + TypeScript)                   │
│                                                                             │
│  ┌───────────────────────┐  ┌───────────────────────┐  ┌──────────────────┐ │
│  │ InteractiveLessonModal│  │ InfiniteAdaptiveModal │  │ Teacher/Parent   │ │
│  │ (Lessons + AI Coach)  │  │ (Infinite Generative) │  │ IRT Diagnostics  │ │
│  └───────────┬───────────┘  └───────────┬───────────┘  └────────┬─────────┘ │
│              │                          │                       │           │
│              ▼                          ▼                       ▼           │
│  ┌────────────────────────────────────────────────────────────────────────┐ │
│  │  Client Services: IRT Ability Engine (3PL) + Adaptive Generator        │ │
│  └──────────────────────────────────┬─────────────────────────────────────┘ │
└─────────────────────────────────────┼───────────────────────────────────────┘
                                      │ HTTPS POST /api/ai/socratic-coach
                                      ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                   Server API Layer (Node.js / Express)                      │
│                                                                             │
│  ┌─────────────────────────┐           ┌──────────────────────────────────┐ │
│  │  /api/ai/socratic-coach │──────────▶│  Google Gen AI SDK               │ │
│  │  Endpoint Controller    │           │  (@google/genai)                 │ │
│  └───────────┬─────────────┘           │  Model: gemini-3.8-flash         │ │
│              │                         └──────────────────────────────────┘ │
│              ▼ (Fallback / Offline)                                         │
│  ┌─────────────────────────────────────┐                                    │
│  │ Heuristic Pedagogical Rule Engine   │                                    │
│  │ (Tier-Specific Socratic Heuristics) │                                    │
│  └─────────────────────────────────────┘                                    │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 3. Implementation Steps

### Step 3.1: Server-Side Gemini Socratic Coach Endpoint
- Create `/server/gemini.ts` initializing `@google/genai` lazily with `process.env.GEMINI_API_KEY`.
- Build `/api/ai/socratic-coach` in `/server/api.ts` with structured prompt engineering instructing Gemini to act as a supportive Socratic tutor who asks guiding questions, provides real-world analogies, and avoids simply giving the answer.
- Implement robust local algorithmic fallback if `GEMINI_API_KEY` is not provided.

### Step 3.2: IRT Engine & Generative Problem Bank
- Create `/src/services/adaptiveEngine.ts` implementing 3PL IRT logic ($\theta$ updates, information functions, SEM, confidence intervals).
- Create `/src/services/problemGenerator.ts` generating parameterized problems with distractor misconception tags across all 4 age tiers.

### Step 3.3: Socratic AI Coach Component (`SocraticCoachModal.tsx`)
- Build a dedicated, child-safe Socratic assistant UI with one-click prompts ("Guide me on Step 1", "Why is my answer wrong?", "Explain with an everyday analogy", "Give me a practice hint").
- Integrate speech audio readout and formula rendering.

### Step 3.4: Integrate into InteractiveLessonModal & Student Experience
- Add the "Ask AI Coach" button to `InteractiveLessonModal`.
- On incorrect answers, automatically trigger diagnostic misconception insights with the option to ask the AI coach for clarification.
- Update student's latent ability ($\theta$) upon each answer.

### Step 3.5: Infinite Adaptive Practice Hub
- Add "Infinite Adaptive Practice" to the Student Dashboard so students can practice an unlimited stream of dynamically generated, IRT-calibrated questions.

### Step 3.6: Educator & Guardian Diagnostic View
- Expand `TeacherDashboard.tsx` and `ParentDashboard.tsx` with an IRT Mastery & Misconception Breakdown card.

---

## 4. Quality Gates & Verification
1. **Compilation & Types:** `tsc --noEmit` and `npm run build` must succeed with zero errors.
2. **Server-Side Safety:** No `GEMINI_API_KEY` is exposed to the client; all AI calls are routed through `/api/ai/*`.
3. **Graceful Fallbacks:** Full functionality even without an API key configured.
4. **Design Discipline:** Adhere to mathematical typography, responsive touch targets, and high-contrast color standards.
