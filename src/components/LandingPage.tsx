import React, { useState } from 'react';
import { NavigationTab, AgeTier, UserProfile, Role } from '../types';
import { AGE_TIER_META } from '../data/curriculumData';
import {
  Sparkles,
  ArrowRight,
  ShieldCheck,
  Award,
  Zap,
  BookOpen,
  LineChart,
  Users,
  WifiOff,
  PenTool,
  Clock,
  Volume2,
  ChevronRight,
  Star,
  Play,
  Layers,
  Compass,
  CheckCircle2,
  Cpu
} from 'lucide-react';
import { playClickSound, speakText } from '../utils/audio';

interface LandingPageProps {
  onNavigate: (tab: NavigationTab) => void;
  onSelectProfile: (profile: UserProfile) => void;
  onSelectAgeTier: (tier: AgeTier) => void;
  onOpenCategoryPage?: (tier: AgeTier) => void;
  onOpenAgePage?: (age: number) => void;
  profiles: UserProfile[];
  activeProfile: UserProfile;
}

export const LandingPage: React.FC<LandingPageProps> = ({
  onNavigate,
  onSelectProfile,
  onSelectAgeTier,
  onOpenCategoryPage,
  onOpenAgePage,
  profiles,
  activeProfile
}) => {
  const [selectedDemoTier, setSelectedDemoTier] = useState<AgeTier>('elementary');
  const [demoSlices, setDemoSlices] = useState(4);
  const [demoShaded, setDemoShaded] = useState(2);
  const [demoApples, setDemoApples] = useState(4);
  const [demoSlope, setDemoSlope] = useState(1.5);
  const [demoTangentX, setDemoTangentX] = useState(1);

  const handleStartLearning = (tier?: AgeTier) => {
    playClickSound();
    if (tier) {
      onSelectAgeTier(tier);
    }
    onNavigate('student');
  };

  const handleQuickProfileSelect = (p: UserProfile) => {
    playClickSound();
    onSelectProfile(p);
    if (p.role === 'parent') onNavigate('parent');
    else if (p.role === 'teacher') onNavigate('teacher');
    else onNavigate('student');
  };

  return (
    <div className="space-y-12 pb-12">
      {/* ===== HERO SECTION ===== */}
      <section className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-slate-900 via-indigo-950 to-slate-900 text-white p-8 sm:p-12 lg:p-16 border border-slate-800 shadow-2xl">
        {/* Subtle decorative background gradients */}
        <div className="absolute top-0 right-0 -mr-24 -mt-24 w-96 h-96 rounded-full bg-indigo-500/20 blur-3xl pointer-events-none" />
        <div className="absolute bottom-0 left-0 -ml-24 -mb-24 w-96 h-96 rounded-full bg-sky-500/15 blur-3xl pointer-events-none" />

        <div className="relative z-10 max-w-3xl">
          {/* Badge */}
          <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-indigo-500/20 border border-indigo-400/30 text-indigo-300 text-xs font-extrabold uppercase tracking-wider mb-6 shadow-inner">
            <Sparkles className="w-3.5 h-3.5 text-amber-400" />
            Dynamic Adaptive Math Ecosystem · Ages 3–18
          </div>

          <h1 className="text-3xl sm:text-5xl lg:text-6xl font-black tracking-tight leading-[1.15] text-white">
            The Mathematical Universe,{' '}
            <span className="bg-gradient-to-r from-sky-400 via-indigo-300 to-amber-300 bg-clip-text text-transparent">
              Perfected for Every Mind.
            </span>
          </h1>

          <p className="mt-5 text-sm sm:text-base lg:text-lg text-slate-300 font-normal leading-relaxed max-w-2xl">
            AcuityMath automatically calibrates difficulty to each learner’s unique cognitive pace.
            From sensory counting in preschool to dynamic calculus and linear algebra in high school,
            students thrive through tactile manipulatives, gamified milestones, and real-time guidance.
          </p>

          {/* Action CTAs */}
          <div className="mt-8 flex flex-wrap items-center gap-3.5">
            <button
              onClick={() => handleStartLearning(activeProfile.tier)}
              className="px-6 py-3.5 rounded-2xl bg-indigo-600 hover:bg-indigo-500 text-white font-extrabold text-sm transition shadow-lg shadow-indigo-600/30 flex items-center gap-2 cursor-pointer group"
            >
              <span>Launch Student Dashboard</span>
              <ArrowRight className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" />
            </button>

            <button
              onClick={() => {
                playClickSound();
                onNavigate('curriculum');
              }}
              className="px-6 py-3.5 rounded-2xl bg-white/10 hover:bg-white/15 text-white font-bold text-sm border border-white/20 transition flex items-center gap-2 cursor-pointer backdrop-blur-sm"
            >
              <BookOpen className="w-4 h-4 text-sky-400" />
              <span>Explore Curriculum (3–18)</span>
            </button>

            <button
              onClick={() => {
                playClickSound();
                onNavigate('parent');
              }}
              className="px-5 py-3.5 rounded-2xl bg-slate-800/80 hover:bg-slate-800 text-slate-300 hover:text-white font-semibold text-xs border border-slate-700 transition flex items-center gap-1.5 cursor-pointer"
            >
              <LineChart className="w-4 h-4 text-amber-400" />
              <span>Parent Portal</span>
            </button>
          </div>

          {/* Key Metrics Quick Strip */}
          <div className="mt-10 pt-8 border-t border-slate-800/80 grid grid-cols-2 sm:grid-cols-4 gap-4 text-slate-300">
            <div>
              <div className="text-2xl font-black text-white">4 Stages</div>
              <div className="text-xs text-slate-400 font-semibold mt-0.5">Ages 3 through 18</div>
            </div>
            <div>
              <div className="text-2xl font-black text-amber-400">10 Levels</div>
              <div className="text-xs text-slate-400 font-semibold mt-0.5">Adaptive ELO Engine</div>
            </div>
            <div>
              <div className="text-2xl font-black text-sky-400">5 Domains</div>
              <div className="text-xs text-slate-400 font-semibold mt-0.5">Live Mastery Meters</div>
            </div>
            <div>
              <div className="text-2xl font-black text-emerald-400">100% Offline</div>
              <div className="text-xs text-slate-400 font-semibold mt-0.5">Zero-Drop Local Queue</div>
            </div>
          </div>
        </div>
      </section>

      {/* ===== 4-STAGE LEARNING PATHWAY SECTION ===== */}
      <section className="space-y-6">
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-3">
          <div>
            <div className="flex items-center gap-2 text-xs font-extrabold uppercase tracking-wider text-indigo-600">
              <Compass className="w-4 h-4" />
              Continuous Stage Architecture
            </div>
            <h2 className="text-2xl sm:text-3xl font-black tracking-tight text-slate-900 mt-1">
              Engineered for Every Developmental Milestone
            </h2>
          </div>
          <p className="text-xs sm:text-sm text-slate-500 max-w-md">
            The platform morphs its user interface, cognitive rigor, and interactive manipulatives
            automatically as children mature.
          </p>
        </div>

        {/* 4 Cards Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5">
          {/* Stage 1: Early */}
          <div className="bg-white rounded-3xl p-6 border border-slate-200 shadow-sm hover:shadow-md hover:border-emerald-300 transition-all flex flex-col justify-between group">
            <div>
              <div className="flex items-center justify-between mb-4">
                <span className="w-12 h-12 rounded-2xl bg-emerald-50 text-emerald-600 flex items-center justify-center text-2xl shadow-inner">
                  🌱
                </span>
                <span className="text-[11px] font-extrabold px-2.5 py-1 rounded-full bg-emerald-100 text-emerald-800">
                  Ages 3–6
                </span>
              </div>

              <h3 className="text-lg font-black text-slate-900 group-hover:text-emerald-600 transition">
                Early Sprouts
              </h3>
              <p className="text-xs font-semibold text-slate-400 mt-0.5">
                Playful counting & sensory foundations
              </p>
              <p className="text-xs text-slate-600 mt-3 leading-relaxed">
                Large tactile buttons, audio narration, bouncy apple and star counters, pattern
                recognition, and vibrant positive-reinforcement confetti.
              </p>

              <div className="mt-4 pt-3 border-t border-slate-100 space-y-1.5 text-[11px] font-semibold text-slate-500">
                <div className="flex items-center gap-1.5">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" /> Tactile Stepper Counters
                </div>
                <div className="flex items-center gap-1.5">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" /> Speech-to-Audio Counting
                </div>
                <div className="flex items-center gap-1.5">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" /> Shape & Geometry Matching
                </div>
              </div>
            </div>

            <button
              onClick={() => {
                playClickSound();
                onOpenCategoryPage ? onOpenCategoryPage('early') : handleStartLearning('early');
              }}
              className="mt-6 w-full py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold transition flex items-center justify-center gap-1.5 cursor-pointer shadow-xs"
            >
              <span>Explore Early Sprouts</span>
              <ChevronRight className="w-3.5 h-3.5" />
            </button>

            <div className="mt-3 pt-3 border-t border-slate-100">
              <div className="text-[10px] font-extrabold uppercase tracking-wider text-slate-400 mb-1.5">
                Specific Ages:
              </div>
              <div className="flex items-center gap-1.5">
                {[3, 4, 5, 6].map(a => (
                  <button
                    key={a}
                    onClick={e => {
                      e.stopPropagation();
                      playClickSound();
                      onOpenAgePage ? onOpenAgePage(a) : onOpenCategoryPage?.('early');
                    }}
                    className="flex-1 py-1 rounded-lg bg-slate-100 hover:bg-emerald-100 hover:text-emerald-800 text-slate-700 text-xs font-bold transition cursor-pointer text-center"
                    title={`Age ${a} Page`}
                  >
                    Age {a}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Stage 2: Elementary */}
          <div className="bg-white rounded-3xl p-6 border border-slate-200 shadow-sm hover:shadow-md hover:border-sky-300 transition-all flex flex-col justify-between group">
            <div>
              <div className="flex items-center justify-between mb-4">
                <span className="w-12 h-12 rounded-2xl bg-sky-50 text-sky-600 flex items-center justify-center text-2xl shadow-inner">
                  🚀
                </span>
                <span className="text-[11px] font-extrabold px-2.5 py-1 rounded-full bg-sky-100 text-sky-800">
                  Ages 7–10
                </span>
              </div>

              <h3 className="text-lg font-black text-slate-900 group-hover:text-sky-600 transition">
                Math Navigators
              </h3>
              <p className="text-xs font-semibold text-slate-400 mt-0.5">
                Fractions, arithmetic quests & grids
              </p>
              <p className="text-xs text-slate-600 mt-3 leading-relaxed">
                Dynamic fraction pizza slicing, multiplication fact speed trials, decimal conversions,
                and milestone streak multipliers.
              </p>

              <div className="mt-4 pt-3 border-t border-slate-100 space-y-1.5 text-[11px] font-semibold text-slate-500">
                <div className="flex items-center gap-1.5">
                  <CheckCircle2 className="w-3.5 h-3.5 text-sky-500" /> Canvas Fraction Pizza Slices
                </div>
                <div className="flex items-center gap-1.5">
                  <CheckCircle2 className="w-3.5 h-3.5 text-sky-500" /> Rapid Multiplication Grids
                </div>
                <div className="flex items-center gap-1.5">
                  <CheckCircle2 className="w-3.5 h-3.5 text-sky-500" /> Percent & Decimal Equivalents
                </div>
              </div>
            </div>

            <button
              onClick={() => {
                playClickSound();
                onOpenCategoryPage ? onOpenCategoryPage('elementary') : handleStartLearning('elementary');
              }}
              className="mt-6 w-full py-2.5 rounded-xl bg-sky-600 hover:bg-sky-700 text-white text-xs font-bold transition flex items-center justify-center gap-1.5 cursor-pointer shadow-xs"
            >
              <span>Explore Math Navigators</span>
              <ChevronRight className="w-3.5 h-3.5" />
            </button>

            <div className="mt-3 pt-3 border-t border-slate-100">
              <div className="text-[10px] font-extrabold uppercase tracking-wider text-slate-400 mb-1.5">
                Specific Ages:
              </div>
              <div className="flex items-center gap-1.5">
                {[7, 8, 9, 10].map(a => (
                  <button
                    key={a}
                    onClick={e => {
                      e.stopPropagation();
                      playClickSound();
                      onOpenAgePage ? onOpenAgePage(a) : onOpenCategoryPage?.('elementary');
                    }}
                    className="flex-1 py-1 rounded-lg bg-slate-100 hover:bg-sky-100 hover:text-sky-800 text-slate-700 text-xs font-bold transition cursor-pointer text-center"
                    title={`Age ${a} Page`}
                  >
                    Age {a}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Stage 3: Middle */}
          <div className="bg-white rounded-3xl p-6 border border-slate-200 shadow-sm hover:shadow-md hover:border-indigo-300 transition-all flex flex-col justify-between group">
            <div>
              <div className="flex items-center justify-between mb-4">
                <span className="w-12 h-12 rounded-2xl bg-indigo-50 text-indigo-600 flex items-center justify-center text-2xl shadow-inner">
                  ⚡
                </span>
                <span className="text-[11px] font-extrabold px-2.5 py-1 rounded-full bg-indigo-100 text-indigo-800">
                  Ages 11–14
                </span>
              </div>

              <h3 className="text-lg font-black text-slate-900 group-hover:text-indigo-600 transition">
                Algebra Voyagers
              </h3>
              <p className="text-xs font-semibold text-slate-400 mt-0.5">
                Coordinate slopes & multi-step logic
              </p>
              <p className="text-xs text-slate-600 mt-3 leading-relaxed">
                Cartesian slope simulators ($y = mx + b$), real-time y-intercept evaluation, variable
                isolation, and proportional ratio challenges.
              </p>

              <div className="mt-4 pt-3 border-t border-slate-100 space-y-1.5 text-[11px] font-semibold text-slate-500">
                <div className="flex items-center gap-1.5">
                  <CheckCircle2 className="w-3.5 h-3.5 text-indigo-500" /> Interactive Cartesian Graph
                </div>
                <div className="flex items-center gap-1.5">
                  <CheckCircle2 className="w-3.5 h-3.5 text-indigo-500" /> Live Slope & Intercept Sliders
                </div>
                <div className="flex items-center gap-1.5">
                  <CheckCircle2 className="w-3.5 h-3.5 text-indigo-500" /> Multi-Step Linear Equations
                </div>
              </div>
            </div>

            <button
              onClick={() => {
                playClickSound();
                onOpenCategoryPage ? onOpenCategoryPage('middle') : handleStartLearning('middle');
              }}
              className="mt-6 w-full py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold transition flex items-center justify-center gap-1.5 cursor-pointer shadow-xs"
            >
              <span>Explore Algebra Voyagers</span>
              <ChevronRight className="w-3.5 h-3.5" />
            </button>

            <div className="mt-3 pt-3 border-t border-slate-100">
              <div className="text-[10px] font-extrabold uppercase tracking-wider text-slate-400 mb-1.5">
                Specific Ages:
              </div>
              <div className="flex items-center gap-1.5">
                {[11, 12, 13, 14].map(a => (
                  <button
                    key={a}
                    onClick={e => {
                      e.stopPropagation();
                      playClickSound();
                      onOpenAgePage ? onOpenAgePage(a) : onOpenCategoryPage?.('middle');
                    }}
                    className="flex-1 py-1 rounded-lg bg-slate-100 hover:bg-indigo-100 hover:text-indigo-800 text-slate-700 text-xs font-bold transition cursor-pointer text-center"
                    title={`Age ${a} Page`}
                  >
                    Age {a}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Stage 4: High */}
          <div className="bg-white rounded-3xl p-6 border border-slate-200 shadow-sm hover:shadow-md hover:border-purple-300 transition-all flex flex-col justify-between group">
            <div>
              <div className="flex items-center justify-between mb-4">
                <span className="w-12 h-12 rounded-2xl bg-purple-50 text-purple-600 flex items-center justify-center text-2xl shadow-inner">
                  🌌
                </span>
                <span className="text-[11px] font-extrabold px-2.5 py-1 rounded-full bg-purple-100 text-purple-800">
                  Ages 15–18
                </span>
              </div>

              <h3 className="text-lg font-black text-slate-900 group-hover:text-purple-600 transition">
                STEM Pioneers
              </h3>
              <p className="text-xs font-semibold text-slate-400 mt-0.5">
                Calculus derivatives & complex functions
              </p>
              <p className="text-xs text-slate-600 mt-3 leading-relaxed">
                Interactive tangent line inspectors for quadratic curves, stationary vertex calculations,
                and advanced mathematical modeling.
              </p>

              <div className="mt-4 pt-3 border-t border-slate-100 space-y-1.5 text-[11px] font-semibold text-slate-500">
                <div className="flex items-center gap-1.5">
                  <CheckCircle2 className="w-3.5 h-3.5 text-purple-500" /> Tangent Inspector Simulator
                </div>
                <div className="flex items-center gap-1.5">
                  <CheckCircle2 className="w-3.5 h-3.5 text-purple-500" /> Derivative Slope Visualizer
                </div>
                <div className="flex items-center gap-1.5">
                  <CheckCircle2 className="w-3.5 h-3.5 text-purple-500" /> Quadratic Polynomial Analysis
                </div>
              </div>
            </div>

            <button
              onClick={() => {
                playClickSound();
                onOpenCategoryPage ? onOpenCategoryPage('high') : handleStartLearning('high');
              }}
              className="mt-6 w-full py-2.5 rounded-xl bg-purple-600 hover:bg-purple-700 text-white text-xs font-bold transition flex items-center justify-center gap-1.5 cursor-pointer shadow-xs"
            >
              <span>Explore STEM Pioneers</span>
              <ChevronRight className="w-3.5 h-3.5" />
            </button>

            <div className="mt-3 pt-3 border-t border-slate-100">
              <div className="text-[10px] font-extrabold uppercase tracking-wider text-slate-400 mb-1.5">
                Specific Ages:
              </div>
              <div className="flex items-center gap-1.5">
                {[15, 16, 17, 18].map(a => (
                  <button
                    key={a}
                    onClick={e => {
                      e.stopPropagation();
                      playClickSound();
                      onOpenAgePage ? onOpenAgePage(a) : onOpenCategoryPage?.('high');
                    }}
                    className="flex-1 py-1 rounded-lg bg-slate-100 hover:bg-purple-100 hover:text-purple-800 text-slate-700 text-xs font-bold transition cursor-pointer text-center"
                    title={`Age ${a} Page`}
                  >
                    Age {a}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ===== INTERACTIVE MINI-LAB PREVIEW SANDBOX ===== */}
      <section className="bg-white rounded-3xl p-6 sm:p-8 border border-slate-200 shadow-sm space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-100 pb-4">
          <div>
            <div className="inline-flex items-center gap-1.5 text-xs font-extrabold uppercase tracking-wider text-indigo-600">
              <Zap className="w-4 h-4" />
              Live Interactive Sandbox
            </div>
            <h3 className="text-xl font-extrabold text-slate-900 mt-0.5">
              Experience the Manipulatives Right Now
            </h3>
            <p className="text-xs text-slate-500">
              Toggle across developmental stages to preview how hands-on tools bring abstract concepts to life.
            </p>
          </div>

          {/* Stage Selector Pills */}
          <div className="flex items-center bg-slate-100 p-1 rounded-2xl border border-slate-200 text-xs font-bold self-start sm:self-auto">
            <button
              onClick={() => setSelectedDemoTier('early')}
              className={`px-3 py-1.5 rounded-xl transition cursor-pointer ${
                selectedDemoTier === 'early' ? 'bg-white text-emerald-700 shadow-xs' : 'text-slate-600'
              }`}
            >
              Early (3–6)
            </button>
            <button
              onClick={() => setSelectedDemoTier('elementary')}
              className={`px-3 py-1.5 rounded-xl transition cursor-pointer ${
                selectedDemoTier === 'elementary' ? 'bg-white text-sky-700 shadow-xs' : 'text-slate-600'
              }`}
            >
              Elem (7–10)
            </button>
            <button
              onClick={() => setSelectedDemoTier('middle')}
              className={`px-3 py-1.5 rounded-xl transition cursor-pointer ${
                selectedDemoTier === 'middle' ? 'bg-white text-indigo-700 shadow-xs' : 'text-slate-600'
              }`}
            >
              Middle (11–14)
            </button>
            <button
              onClick={() => setSelectedDemoTier('high')}
              className={`px-3 py-1.5 rounded-xl transition cursor-pointer ${
                selectedDemoTier === 'high' ? 'bg-white text-purple-700 shadow-xs' : 'text-slate-600'
              }`}
            >
              High (15–18)
            </button>
          </div>
        </div>

        {/* Demo Content Box */}
        <div className="bg-slate-50 rounded-2xl p-6 border border-slate-200/80">
          {selectedDemoTier === 'early' && (
            <div className="flex flex-col items-center justify-center gap-4 text-center">
              <div className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                Preschool & Kindergarten Tactile Counter
              </div>
              <div className="flex flex-wrap items-center justify-center gap-3 text-3xl">
                {Array.from({ length: demoApples }).map((_, i) => (
                  <span key={i} className="animate-bounce" style={{ animationDelay: `${i * 100}ms` }}>
                    {i % 2 === 0 ? '🍎' : '⭐'}
                  </span>
                ))}
              </div>
              <div className="text-2xl font-black text-slate-900">{demoApples} items</div>
              <div className="flex items-center gap-3">
                <button
                  onClick={() => {
                    playClickSound();
                    setDemoApples(Math.max(1, demoApples - 1));
                  }}
                  className="w-10 h-10 rounded-full bg-white border border-slate-300 font-bold text-lg hover:bg-slate-100 cursor-pointer shadow-xs"
                >
                  −
                </button>
                <button
                  onClick={() => {
                    playClickSound();
                    setDemoApples(Math.min(10, demoApples + 1));
                    speakText(`Count ${demoApples + 1}`);
                  }}
                  className="w-10 h-10 rounded-full bg-white border border-slate-300 font-bold text-lg hover:bg-slate-100 cursor-pointer shadow-xs"
                >
                  +
                </button>
              </div>
              <p className="text-xs text-slate-400">
                Tap + to add apples and hear live audio counting pronunciation.
              </p>
            </div>
          )}

          {selectedDemoTier === 'elementary' && (
            <div className="flex flex-col sm:flex-row items-center justify-around gap-6 text-center sm:text-left">
              {/* Pizza Visual SVG */}
              <div className="w-36 h-36 rounded-full bg-amber-100 border-4 border-amber-600 relative flex items-center justify-center shadow-inner shrink-0">
                <div className="text-center font-black text-amber-900 text-lg">
                  {demoShaded} / {demoSlices}
                  <div className="text-[10px] text-amber-700 font-semibold">
                    {Math.round((demoShaded / demoSlices) * 100)}%
                  </div>
                </div>
              </div>

              <div className="space-y-3">
                <div className="text-sm font-bold text-slate-800">
                  Dynamic Fraction Pizza Slicer
                </div>
                <div className="flex flex-wrap gap-4 text-xs font-semibold text-slate-600">
                  <label className="flex items-center gap-2">
                    <span>Total Slices:</span>
                    <input
                      type="range"
                      min="2"
                      max="8"
                      value={demoSlices}
                      onChange={e => {
                        const val = Number(e.target.value);
                        setDemoSlices(val);
                        if (demoShaded > val) setDemoShaded(val);
                      }}
                      className="accent-sky-600"
                    />
                    <span className="font-mono font-bold text-slate-900">{demoSlices}</span>
                  </label>

                  <label className="flex items-center gap-2">
                    <span>Shaded Slices:</span>
                    <input
                      type="range"
                      min="1"
                      max={demoSlices}
                      value={demoShaded}
                      onChange={e => setDemoShaded(Number(e.target.value))}
                      className="accent-amber-500"
                    />
                    <span className="font-mono font-bold text-slate-900">{demoShaded}</span>
                  </label>
                </div>
                <div className="text-xs text-slate-500">
                  Fraction Value: <span className="font-bold text-sky-600">{demoShaded}/{demoSlices}</span> ={' '}
                  <span className="font-bold text-emerald-600">{Math.round((demoShaded / demoSlices) * 100)}%</span>
                </div>
              </div>
            </div>
          )}

          {selectedDemoTier === 'middle' && (
            <div className="flex flex-col sm:flex-row items-center justify-around gap-6 text-center sm:text-left">
              <div className="w-48 h-28 bg-white rounded-xl border border-slate-300 p-2 relative flex items-center justify-center shadow-xs shrink-0">
                <div className="absolute w-full h-[1px] bg-slate-300" />
                <div className="absolute h-full w-[1px] bg-slate-300" />
                <div
                  className="absolute w-36 h-[2px] bg-indigo-600 origin-center transition-transform"
                  style={{ transform: `rotate(${-Math.atan(demoSlope) * (180 / Math.PI)}deg)` }}
                />
              </div>

              <div className="space-y-3">
                <div className="text-sm font-bold text-slate-800">
                  Cartesian Linear Slope Simulator
                </div>
                <div className="flex items-center gap-3 text-xs font-semibold text-slate-600">
                  <span>Slope (m = {demoSlope}):</span>
                  <input
                    type="range"
                    min="-3"
                    max="3"
                    step="0.5"
                    value={demoSlope}
                    onChange={e => setDemoSlope(Number(e.target.value))}
                    className="accent-indigo-600"
                  />
                </div>
                <div className="text-xs font-mono font-bold text-indigo-700">
                  Function Equation: y = {demoSlope}x + 1
                </div>
              </div>
            </div>
          )}

          {selectedDemoTier === 'high' && (
            <div className="flex flex-col sm:flex-row items-center justify-around gap-6 text-center sm:text-left">
              <div className="w-48 h-28 bg-white rounded-xl border border-slate-300 p-2 relative flex items-center justify-center shadow-xs shrink-0">
                <div className="text-xs font-mono text-purple-700 font-extrabold">
                  f'(x) = 2x
                  <div className="text-[10px] text-slate-500 font-semibold mt-1">
                    Slope at x={demoTangentX} is {(2 * demoTangentX).toFixed(1)}
                  </div>
                </div>
              </div>

              <div className="space-y-3">
                <div className="text-sm font-bold text-slate-800">
                  Differential Calculus Tangent Inspector
                </div>
                <div className="flex items-center gap-3 text-xs font-semibold text-slate-600">
                  <span>Evaluation Point x:</span>
                  <input
                    type="range"
                    min="-3"
                    max="3"
                    step="0.5"
                    value={demoTangentX}
                    onChange={e => setDemoTangentX(Number(e.target.value))}
                    className="accent-purple-600"
                  />
                  <span className="font-mono font-bold text-slate-900">{demoTangentX}</span>
                </div>
                <div className="text-xs text-slate-500">
                  Instantaneous derivative rate of change evaluated dynamically.
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Jump-in button */}
        <div className="flex justify-end">
          <button
            onClick={() => handleStartLearning(selectedDemoTier)}
            className="px-5 py-2.5 rounded-xl bg-slate-900 hover:bg-indigo-600 text-white text-xs font-bold transition flex items-center gap-2 cursor-pointer shadow-xs"
          >
            <span>Launch Active Stage in Full Dashboard</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>
      </section>

      {/* ===== 6 PILLARS / FEATURES GRID ===== */}
      <section className="space-y-6">
        <div>
          <div className="flex items-center gap-2 text-xs font-extrabold uppercase tracking-wider text-indigo-600">
            <Cpu className="w-4 h-4" />
            Architectural Highlights
          </div>
          <h2 className="text-2xl sm:text-3xl font-black tracking-tight text-slate-900 mt-1">
            Why Educators, Parents & Students Rely on AcuityMath
          </h2>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {/* Feature 1 */}
          <div className="bg-white rounded-3xl p-6 border border-slate-200 shadow-sm space-y-3">
            <div className="w-10 h-10 rounded-2xl bg-indigo-50 text-indigo-600 flex items-center justify-center font-bold text-lg">
              <Zap className="w-5 h-5" />
            </div>
            <h4 className="text-base font-bold text-slate-900">Dynamic ELO Difficulty Engine</h4>
            <p className="text-xs text-slate-500 leading-relaxed">
              Continuously balances problem complexity across 10 progressive levels and 800–2400 ELO,
              preventing frustration and avoiding boredom.
            </p>
          </div>

          {/* Feature 2 */}
          <div className="bg-white rounded-3xl p-6 border border-slate-200 shadow-sm space-y-3">
            <div className="w-10 h-10 rounded-2xl bg-amber-50 text-amber-600 flex items-center justify-center font-bold text-lg">
              <Award className="w-5 h-5" />
            </div>
            <h4 className="text-base font-bold text-slate-900">Gamified Milestone Economy</h4>
            <p className="text-xs text-slate-500 leading-relaxed">
              Earn Star Coins, preserve daily streaks with streak freeze shields, and unlock historical
              mathematical companion avatars.
            </p>
          </div>

          {/* Feature 3 */}
          <div className="bg-white rounded-3xl p-6 border border-slate-200 shadow-sm space-y-3">
            <div className="w-10 h-10 rounded-2xl bg-sky-50 text-sky-600 flex items-center justify-center font-bold text-lg">
              <Clock className="w-5 h-5" />
            </div>
            <h4 className="text-base font-bold text-slate-900">Parental Safety & Screen Limits</h4>
            <p className="text-xs text-slate-500 leading-relaxed">
              Live countdown timers notify learners when time runs short. Parents set daily caps and
              generate printable progress report cards.
            </p>
          </div>

          {/* Feature 4 */}
          <div className="bg-white rounded-3xl p-6 border border-slate-200 shadow-sm space-y-3">
            <div className="w-10 h-10 rounded-2xl bg-purple-50 text-purple-600 flex items-center justify-center font-bold text-lg">
              <Users className="w-5 h-5" />
            </div>
            <h4 className="text-base font-bold text-slate-900">Teacher Assignment Command</h4>
            <p className="text-xs text-slate-500 leading-relaxed">
              Educators build tailored math tasks, set submission deadlines, and monitor individual
              accuracy velocity across classroom rosters.
            </p>
          </div>

          {/* Feature 5 */}
          <div className="bg-white rounded-3xl p-6 border border-slate-200 shadow-sm space-y-3">
            <div className="w-10 h-10 rounded-2xl bg-emerald-50 text-emerald-600 flex items-center justify-center font-bold text-lg">
              <WifiOff className="w-5 h-5" />
            </div>
            <h4 className="text-base font-bold text-slate-900">Zero-Drop Offline Synchronization</h4>
            <p className="text-xs text-slate-500 leading-relaxed">
              Work freely on road trips or remote areas. An indexed local action queue stores lesson
              completions and auto-syncs when online.
            </p>
          </div>

          {/* Feature 6 */}
          <div className="bg-white rounded-3xl p-6 border border-slate-200 shadow-sm space-y-3">
            <div className="w-10 h-10 rounded-2xl bg-rose-50 text-rose-600 flex items-center justify-center font-bold text-lg">
              <PenTool className="w-5 h-5" />
            </div>
            <h4 className="text-base font-bold text-slate-900">Digital Mathematical Scratchpad</h4>
            <p className="text-xs text-slate-500 leading-relaxed">
              Integrated canvas with grid toggle, symbol stamps ($\pi$, $\sqrt{}$, $\int$, $\sum$, $\infty$),
              pen, eraser, and instant PNG export.
            </p>
          </div>
        </div>
      </section>

      {/* ===== 1-CLICK PROFILE ACCESS SECTION ===== */}
      <section className="bg-white rounded-3xl p-6 sm:p-8 border border-slate-200 shadow-sm space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-3">
          <div>
            <h3 className="text-lg font-black text-slate-900 flex items-center gap-2">
              <ShieldCheck className="w-5 h-5 text-indigo-600" />
              Quick-Access Profiles
            </h3>
            <p className="text-xs text-slate-500">
              Switch immediately into any role or student tier with pre-calibrated history
            </p>
          </div>
          <span className="text-xs font-bold text-slate-400">
            Active: <strong className="text-slate-800">{activeProfile.name}</strong> ({activeProfile.role})
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3.5 pt-1">
          {profiles.map(p => {
            const isCurrent = p.id === activeProfile.id;
            return (
              <div
                key={p.id}
                onClick={() => handleQuickProfileSelect(p)}
                className={`p-4 rounded-2xl border transition cursor-pointer flex flex-col justify-between ${
                  isCurrent
                    ? 'border-indigo-600 bg-indigo-50/50 shadow-xs ring-1 ring-indigo-500'
                    : 'border-slate-200 bg-slate-50/50 hover:bg-white hover:shadow-xs'
                }`}
              >
                <div>
                  <div className="text-3xl mb-2">{p.avatar}</div>
                  <div className="text-xs font-black text-slate-900 truncate">{p.name}</div>
                  <div className="text-[10px] font-bold text-indigo-600 uppercase mt-0.5">
                    {p.role === 'student' ? `Age ${p.age} · Level ${p.dynamicLevel}` : p.role}
                  </div>
                </div>

                <div className="mt-3 pt-2 border-t border-slate-200/60 flex items-center justify-between text-[11px] font-bold text-slate-500">
                  <span>{p.role === 'student' ? `${p.eloRating} ELO` : 'Staff PIN'}</span>
                  <ArrowRight className="w-3.5 h-3.5 text-indigo-600" />
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* ===== BOTTOM CALL TO ACTION BANNER ===== */}
      <section className="rounded-3xl bg-indigo-600 text-white p-8 sm:p-10 flex flex-col sm:flex-row items-center justify-between gap-6 shadow-xl shadow-indigo-200">
        <div className="space-y-1 text-center sm:text-left">
          <h3 className="text-2xl font-black tracking-tight">
            Ready to Begin Your Mathematical Journey?
          </h3>
          <p className="text-xs sm:text-sm text-indigo-100 max-w-xl">
            Choose your age stage, customize daily goals, and experience adaptive mathematics built for the next generation of thinkers.
          </p>
        </div>

        <button
          onClick={() => handleStartLearning(activeProfile.tier)}
          className="px-6 py-3 rounded-2xl bg-white text-indigo-700 hover:bg-indigo-50 font-extrabold text-sm transition shadow-md cursor-pointer shrink-0"
        >
          Enter Dashboard Now
        </button>
      </section>
    </div>
  );
};
