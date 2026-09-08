# AcuityMath — Phase 2 Execution Plan: Interactive Virtual Math Manipulatives & Conceptual Labs

**Document Version:** 1.0.0  
**Status:** LOCKED & ACTIVE  
**Target Horizon:** Phase 2 of Multi-Tier Architecture Roadmap  
**Primary Objective:** Transition AcuityMath from standard static problem-solving into a deeply tactile, visual, and exploratory math laboratory spanning Ages 3 through 18. Deliver responsive, high-performance interactive virtual manipulatives tailored to each developmental tier.

---

## 1. Executive Summary & Pedagogical Framework

Abstract mathematical thinking develops best through the **CRA (Concrete ➔ Representational ➔ Abstract)** sequence. 
Phase 2 empowers learners with direct manipulation tools that bridge physical play, spatial intuition, and algebraic precision.

### Phase 2 Core Deliverables:
1. **Universal Math Labs Workspace (`ManipulativesHub`)**:
   - A dedicated interactive lab interface in the main navigation.
   - Tier-filtered selector allowing students, parents, and teachers to explore age-appropriate tools or cross-train across tiers.
   - Built-in "Guided Challenge Mode" with target numbers, self-checking prompts, and exploratory free-play modes.
2. **Tier 1: Early Childhood Labs (Ages 3–5)**:
   - **Interactive Ten-Frame Token Counter**: 2×5 grid with drag-and-drop counters (stars, counters, apples), dual-color token sets for addition partitions, and live subitizing audio feedback.
   - **Rapid Subitizing Dot Flash**: Perceptual dot matrices (1–10) with adjustable flash speeds (100ms–1000ms) to foster rapid numerical estimation without finger-counting.
   - **Shape Pattern Train**: Repeating sequence builder (AB, AAB, ABC) with draggable tactile geometric shapes.
3. **Tier 2: Elementary Labs (Ages 6–10)**:
   - **Fraction Pizza & Strip Visualizer**: Live multi-layer circular and rectangular fraction comparisons (halves through twelfths) with instant equivalence visual overlay (e.g., $1/2 \equiv 2/4 \equiv 3/6$).
   - **Base-10 Place Value Blocks**: Interactive Units (1s), Rods (10s), Flats (100s), and Thousands Cubes with drag-and-drop composing, regrouping ("trade 10 units for 1 rod"), and expanded form notations ($347 = 300 + 40 + 7$).
4. **Tier 3: Middle School Labs (Ages 11–13)**:
   - **Interactive 4-Quadrant Coordinate Plane & Linear Grapher**: Draggable points, slope triangle visualizer ($m = \frac{\Delta y}{\Delta x}$), and live parameter sliders for $y = mx + b$.
   - **Negative Number Balance Scale**: Physics-inspired zero-pair balance model where positive and negative chips cancel each other out ($(+1) + (-1) = 0$).
5. **Tier 4: High School Labs (Ages 14–18)**:
   - **Interactive Trigonometric Unit Circle**: 360°/2π radian interactive circle with draggable ray, real-time projections for $\sin \theta$, $\cos \theta$, $\tan \theta$, and exact values for special angles ($\frac{\pi}{6}, \frac{\pi}{4}, \frac{\pi}{3}, \frac{\pi}{2}$).
   - **Calculus Derivative Tangent-Line Visualizer**: Dynamic function curves with a draggable point and moving secant line showing the limiting slope $h \to 0 \implies f'(x)$.
6. **Platform Integration & Accessibility**:
   - Direct launch capability from individual lessons and the Scratchpad modal.
   - WCAG-compliant high-contrast mode and keyboard/touch navigation.
   - Sound effects via Web Audio API for tactile feedback.

---

## 2. Technical Architecture

```
┌────────────────────────────────────────────────────────────────────────┐
│                        AcuityMath Navigation                           │
│  [ Home ]  [ Student ]  [ Math Labs (Phase 2) ]  [ Scratchpad ] ...     │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │
                                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│                    ManipulativesHub (Lab Container)                    │
│  ┌──────────────────────────────────────────────────────────────────┐  │
│  │ Tier Filter: [ Early 3-5 ] [ Elem 6-10 ] [ Mid 11-13 ] [ High ]  │  │
│  └──────────────────────────────────────────────────────────────────┘  │
│                                   │                                    │
│        ┌──────────────────────────┼──────────────────────────┐         │
│        ▼                          ▼                          ▼         │
│  ┌──────────────┐          ┌──────────────┐          ┌──────────────┐  │
│  │ Ten-Frame    │          │ Fraction Bar │          │ Unit Circle  │  │
│  │ Counter Lab  │          │ & Pizza Lab  │          │ Explorer Lab │  │
│  └──────────────┘          └──────────────┘          └──────────────┘  │
│        ▼                          ▼                          ▼         │
│  ┌──────────────┐          ┌──────────────┐          ┌──────────────┐  │
│  │ Subitizing   │          │ Base-10      │          │ Linear       │  │
│  │ Dot Flash    │          │ Blocks Lab   │          │ Grapher      │  │
│  └──────────────┘          └──────────────┘          └──────────────┘  │
└────────────────────────────────────────────────────────────────────────┘
```

---

## 3. Implementation Plan & Execution Phases

### Step 2.1: Types & Navigation Expansion
- Add `'labs'` to `NavigationTab` type in `src/types.ts`.
- Define manipulative configuration types, state interfaces, and challenge structures in `src/types/manipulatives.ts`.

### Step 2.2: Tier 1 Manipulatives (`EarlyMathLabs.tsx`)
- **TenFrameLab**: 10-frame interactive grid, dual counter sets (Red & Yellow), one-touch fill to number, sound-enabled audio count.
- **SubitizingLab**: Flash cards with 1–10 dots in random/dice/ten-frame patterns, timer slider, reveal button, and multiple choice challenge.

### Step 2.3: Tier 2 Manipulatives (`ElementaryMathLabs.tsx`)
- **FractionVisualizerLab**: Circular Pizza/Pie and Rectangular Bar models, side-by-side fraction comparator, equivalence matcher, and fraction arithmetic demonstration ($1/3 + 1/3 = 2/3$).
- **BaseTenBlocksLab**: Interactive playmat with Units, Rods, Flats, Thousands, regrouping trade button, live decimal/expanded form display.

### Step 2.4: Tier 3 & Tier 4 Manipulatives (`SecondaryMathLabs.tsx`)
- **CoordinateGrapherLab**: SVG interactive Cartesian grid, point snapping, slope calculator, line plotter $y = mx + b$.
- **UnitCircleLab**: Interactive circle with angle slider (0°–360° and 0–2π), triangle projection showing $\sin \theta$ (vertical green), $\cos \theta$ (horizontal blue), and exact radicals.

### Step 2.5: Main Hub & System Integration
- Create `src/components/manipulatives/ManipulativesHub.tsx` hosting all labs with tier tabs, full-screen expansion, guided tasks, and sound.
- Integrate into `src/App.tsx` sidebar navigation, mobile menu, and direct launch links.
- Verify production compilation and dev server responsiveness.

---

## 4. Verification & Quality Gates
- Type checking: Zero TypeScript compilation errors (`tsc --noEmit`).
- Responsiveness: Responsive on mobile viewports (minimum touch target 44px) and full-width desktop monitors.
- Performance: 60fps interaction on SVG/Canvas elements without re-render thrashing.
- Accessibility: Text-to-Speech support and distinct high-contrast color palettes.
