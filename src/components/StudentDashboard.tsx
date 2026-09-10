import React, { useState, useEffect, useRef } from 'react';
import { UserProfile, MathLesson, TeacherAssignment, AgeTier, NavigationTab } from '../types';
import { AGE_TIER_META } from '../data/curriculumData';
import { AGE_PROFILES } from '../data/ageCurriculumData';
import { AGE_3_YEARLY_SESSIONS } from '../data/age3YearlyContent';
import {
  Sparkles,
  Flame,
  Award,
  Zap,
  Play,
  Calendar,
  CheckCircle2,
  Clock,
  Target,
  ArrowRight,
  TrendingUp,
  Volume2,
  AlertCircle,
  BookOpen,
  ChevronRight,
  Star,
  Check,
  ShieldCheck,
  Compass,
  Bot,
  Languages
} from 'lucide-react';
import { playClickSound, playSuccessSound, speakText, playLevelUpFanfare } from '../utils/audio';
import { fireConfettiBurst, fireMilestoneConfetti } from '../utils/confetti';
import { InfiniteAdaptiveModal } from './InfiniteAdaptiveModal';

interface StudentDashboardProps {
  user: UserProfile;
  lessons: MathLesson[];
  assignments: TeacherAssignment[];
  onSelectLesson: (lesson: MathLesson) => void;
  onOpenRewards: () => void;
  onUpdateDifficulty: (newLevel: number) => void;
  onUpdateUserProfile?: (updates: Partial<UserProfile>) => void;
  screenTimeMinutes?: number;
  screenTimeLimit?: number;
  onOpenScratchpad?: () => void;
  onOpenAgePage?: (age: number) => void;
  onNavigate?: (tab: NavigationTab) => void;
  onOpenPlacementQuest?: () => void;
  onOpenGlossary?: () => void;
}

export const StudentDashboard: React.FC<StudentDashboardProps> = ({
  user,
  lessons,
  assignments,
  onSelectLesson,
  onOpenRewards,
  onUpdateDifficulty,
  onUpdateUserProfile,
  screenTimeMinutes = 18,
  screenTimeLimit = 35,
  onOpenScratchpad,
  onOpenAgePage,
  onNavigate,
  onOpenPlacementQuest,
  onOpenGlossary
}) => {
  /**
   * The server learner this profile practises as.
   *
   * Carried by the profile itself now. It used to be resolved by a bridge that
   * found or created a learner matching a demonstration profile — that bridge
   * existed because profiles were invented client-side and had no server
   * identity. They are server rows now, so the id is simply present, and absent
   * only for the placeholder shown to somebody who has not signed in.
   */
  const practiceLearnerId = user.learnerId ?? null;
  const activeTier: AgeTier = user.tier;
  const tierMeta = AGE_TIER_META[activeTier];

  // Infinite Adaptive CAT Practice modal
  const [showAdaptivePractice, setShowAdaptivePractice] = useState(false);

  // Infer user age from tier or default
  const userAge = user.tier === 'early' ? 3 : user.tier === 'elementary' ? 8 : user.tier === 'middle' ? 12 : 16;
  const ageProfile = AGE_PROFILES[userAge] || AGE_PROFILES[3];

  // Manipulative states
  // Early (3-6)
  const [appleCount, setAppleCount] = useState(3);

  // Elementary (7-10) - Fraction Pizza
  const [pizzaSlices, setPizzaSlices] = useState(4);
  const [pizzaShaded, setPizzaShaded] = useState(2);
  const pizzaCanvasRef = useRef<HTMLCanvasElement | null>(null);

  // Middle (11-14) - Coordinate Plane
  const [slopeM, setSlopeM] = useState(1);
  const [interceptB, setInterceptB] = useState(1);
  const coordCanvasRef = useRef<HTMLCanvasElement | null>(null);

  // High (15-18) - Tangent Inspector
  const [tangentX, setTangentX] = useState(1);
  const tangentCanvasRef = useRef<HTMLCanvasElement | null>(null);

  // Filter lessons for user's tier
  const tierLessons = lessons.filter(l => l.tier === activeTier);
  // Next recommended lesson is the first uncompleted or first matching lesson
  const recommendedLesson = tierLessons[0] || lessons[0];
  const upcomingLessons = tierLessons.slice(1, 4);

  // Student assignments
  const studentAssignments = assignments.filter(a => a.targetStudents.includes(user.id));

  // XP to next level formula
  const currentXpInLevel = user.xp % 500;
  const xpProgressPct = Math.min(100, Math.round((currentXpInLevel / 500) * 100));

  // Screen time & daily goal
  const dailyTargetMinutes = ageProfile.recommendedDailyMinutes || 20;
  const timeProgressPct = Math.min(100, Math.round((screenTimeMinutes / dailyTargetMinutes) * 100));

  // 5-Domain Mastery data
  const masteryData: Record<AgeTier, { label: string; score: number; color: string; status: string }[]> = {
    early: [
      { label: 'Number Sense (1–5)', score: 85, color: 'bg-indigo-600', status: 'Mastered' },
      { label: 'Shape & Geometry', score: 70, color: 'bg-emerald-500', status: 'On Track' },
      { label: 'Size Comparison', score: 80, color: 'bg-amber-500', status: 'Mastered' },
      { label: 'Spatial Awareness', score: 60, color: 'bg-sky-500', status: 'Developing' },
      { label: 'Pattern Rhythms', score: 65, color: 'bg-pink-500', status: 'Developing' }
    ],
    elementary: [
      { label: 'Number Sense & Regrouping', score: 82, color: 'bg-indigo-600', status: 'Mastered' },
      { label: 'Fractions & Equivalence', score: 72, color: 'bg-purple-600', status: 'On Track' },
      { label: 'Multiplication & Arrays', score: 78, color: 'bg-amber-500', status: 'Mastered' },
      { label: 'Geometry & Perimeter', score: 60, color: 'bg-emerald-500', status: 'Needs Practice' },
      { label: 'Word Problem Logic', score: 58, color: 'bg-pink-500', status: 'Developing' }
    ],
    middle: [
      { label: 'Rational Numbers & Integers', score: 75, color: 'bg-indigo-600', status: 'Mastered' },
      { label: 'Linear Equations & Graphs', score: 70, color: 'bg-amber-500', status: 'On Track' },
      { label: 'Proportional Reasoning', score: 65, color: 'bg-sky-500', status: 'Developing' },
      { label: 'Geometric Angles & Area', score: 72, color: 'bg-emerald-500', status: 'On Track' },
      { label: 'Data & Probability', score: 55, color: 'bg-pink-500', status: 'Needs Practice' }
    ],
    high: [
      { label: 'Algebraic Functions', score: 80, color: 'bg-indigo-600', status: 'Mastered' },
      { label: 'Quadratic & Polynomials', score: 72, color: 'bg-purple-600', status: 'On Track' },
      { label: 'Trigonometric Ratios', score: 65, color: 'bg-amber-500', status: 'Developing' },
      { label: 'Calculus Limits & Tangents', score: 68, color: 'bg-emerald-500', status: 'On Track' },
      { label: 'Statistical Inference', score: 60, color: 'bg-pink-500', status: 'Needs Practice' }
    ]
  };

  const currentMastery = masteryData[activeTier];

  // Week streak dots (Mon - Sun)
  const weekDays = [
    { day: 'M', completed: true },
    { day: 'T', completed: true },
    { day: 'W', completed: true },
    { day: 'T', completed: true },
    { day: 'F', completed: user.streakDays >= 5 },
    { day: 'S', completed: user.streakDays >= 6 },
    { day: 'S', completed: user.streakDays >= 7 }
  ];

  // Draw Pizza Canvas
  useEffect(() => {
    if (activeTier !== 'elementary') return;
    const canvas = pizzaCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const cx = 100;
    const cy = 100;
    const r = 85;
    ctx.clearRect(0, 0, 200, 200);

    for (let i = 0; i < pizzaSlices; i++) {
      const startAngle = (i / pizzaSlices) * 2 * Math.PI - Math.PI / 2;
      const endAngle = ((i + 1) / pizzaSlices) * 2 * Math.PI - Math.PI / 2;
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.arc(cx, cy, r, startAngle, endAngle);
      ctx.closePath();

      if (i < pizzaShaded) {
        ctx.fillStyle = '#f59e0b'; // shaded cheese
        ctx.fill();
        ctx.strokeStyle = '#b45309';
        ctx.lineWidth = 2;
        ctx.stroke();

        // Pepperoni dot
        const midAngle = (startAngle + endAngle) / 2;
        const dotR = r * 0.55;
        const px = cx + dotR * Math.cos(midAngle);
        const py = cy + dotR * Math.sin(midAngle);
        ctx.fillStyle = '#dc2626';
        ctx.beginPath();
        ctx.arc(px, py, 7, 0, 2 * Math.PI);
        ctx.fill();
      } else {
        ctx.fillStyle = '#fef3c7'; // plain dough
        ctx.fill();
        ctx.strokeStyle = '#d97706';
        ctx.lineWidth = 1.5;
        ctx.stroke();
      }
    }

    // Outer crust ring
    ctx.strokeStyle = '#92400e';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, 2 * Math.PI);
    ctx.stroke();
  }, [activeTier, pizzaSlices, pizzaShaded]);

  // Draw Coordinate Plane Canvas
  useEffect(() => {
    if (activeTier !== 'middle') return;
    const canvas = coordCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const w = canvas.width;
    const h = canvas.height;
    ctx.clearRect(0, 0, w, h);

    // Grid
    ctx.strokeStyle = '#e2e8f0';
    ctx.lineWidth = 1;
    for (let x = 0; x <= w; x += 20) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, h);
      ctx.stroke();
    }
    for (let y = 0; y <= h; y += 20) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(w, y);
      ctx.stroke();
    }

    // Axes
    ctx.strokeStyle = '#475569';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(0, h / 2);
    ctx.lineTo(w, h / 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(w / 2, 0);
    ctx.lineTo(w / 2, h);
    ctx.stroke();

    // Plot line y = mx + b
    const scale = 20;
    const x0 = -10;
    const x1 = 10;
    const y0 = slopeM * x0 + interceptB;
    const y1 = slopeM * x1 + interceptB;
    const px0 = w / 2 + x0 * scale;
    const py0 = h / 2 - y0 * scale;
    const px1 = w / 2 + x1 * scale;
    const py1 = h / 2 - y1 * scale;

    ctx.strokeStyle = '#4f46e5';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.moveTo(px0, py0);
    ctx.lineTo(px1, py1);
    ctx.stroke();

    // Y-intercept point dot
    ctx.fillStyle = '#ef4444';
    ctx.beginPath();
    ctx.arc(w / 2, h / 2 - interceptB * scale, 5, 0, 2 * Math.PI);
    ctx.fill();

    // Label
    ctx.fillStyle = '#1e293b';
    ctx.font = 'bold 12px sans-serif';
    ctx.fillText(`y = ${slopeM}x + ${interceptB}`, 12, 20);
  }, [activeTier, slopeM, interceptB]);

  // Draw Tangent Canvas
  useEffect(() => {
    if (activeTier !== 'high') return;
    const canvas = tangentCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const w = canvas.width;
    const h = canvas.height;
    ctx.clearRect(0, 0, w, h);

    // Grid
    ctx.strokeStyle = '#e2e8f0';
    ctx.lineWidth = 0.5;
    for (let x = 0; x <= w; x += 30) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, h);
      ctx.stroke();
    }
    for (let y = 0; y <= h; y += 30) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(w, y);
      ctx.stroke();
    }

    // Axes
    ctx.strokeStyle = '#334155';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(0, h / 2);
    ctx.lineTo(w, h / 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(w / 2, 0);
    ctx.lineTo(w / 2, h);
    ctx.stroke();

    // Curve f(x) = x^2
    const scale = 30;
    ctx.strokeStyle = '#9333ea';
    ctx.lineWidth = 2;
    ctx.beginPath();
    for (let xi = -3.5; xi <= 3.5; xi += 0.05) {
      const px = w / 2 + xi * scale;
      const py = h / 2 - (xi * xi) * scale / 2.5;
      if (xi === -3.5) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.stroke();

    // Tangent line
    const slope = 2 * tangentX;
    const y0 = tangentX * tangentX;
    const px0 = w / 2 + tangentX * scale;
    const py0 = h / 2 - y0 * scale / 2.5;

    const x1 = tangentX - 2.5;
    const x2 = tangentX + 2.5;
    const y1 = y0 + slope * (x1 - tangentX);
    const y2 = y0 + slope * (x2 - tangentX);
    const px1 = w / 2 + x1 * scale;
    const py1 = h / 2 - y1 * scale / 2.5;
    const px2 = w / 2 + x2 * scale;
    const py2 = h / 2 - y2 * scale / 2.5;

    ctx.strokeStyle = '#ef4444';
    ctx.lineWidth = 2;
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.moveTo(px1, py1);
    ctx.lineTo(px2, py2);
    ctx.stroke();
    ctx.setLineDash([]);

    // Point
    ctx.fillStyle = '#ef4444';
    ctx.beginPath();
    ctx.arc(px0, py0, 5, 0, 2 * Math.PI);
    ctx.fill();

    // Label
    ctx.fillStyle = '#1e293b';
    ctx.font = 'bold 12px sans-serif';
    ctx.fillText(`f(x) = x²`, 12, 18);
    ctx.fillStyle = '#ef4444';
    ctx.fillText(`f'(${tangentX.toFixed(1)}) = ${slope.toFixed(2)}`, 12, 34);
  }, [activeTier, tangentX]);

  // Manipulative handlers
  const handleAppleIncrement = () => {
    playClickSound();
    const next = Math.min(20, appleCount + 1);
    setAppleCount(next);
    speakText(`Count ${next}`);
    if (next % 5 === 0) {
      fireConfettiBurst();
      playSuccessSound();
    }
  };

  const handleAppleDecrement = () => {
    playClickSound();
    const next = Math.max(0, appleCount - 1);
    setAppleCount(next);
    speakText(`${next}`);
  };

  const handleCelebrate = () => {
    playLevelUpFanfare();
    fireMilestoneConfetti();
    speakText(`Great! You counted ${appleCount} items!`);
  };

  // Resume action
  const handleResumeLearning = () => {
    playClickSound();
    if (activeTier === 'early' && onOpenAgePage) {
      // For Age 3, direct to the 4-session yearly curriculum
      onOpenAgePage(3);
    } else if (recommendedLesson) {
      onSelectLesson(recommendedLesson);
    }
  };

  return (
    <div className="space-y-6" id="student-cockpit">
      {/* ==================================================== */}
      {/* 1. STUDENT HEADER & INSTANT RESUME COCKPIT           */}
      {/* ==================================================== */}
      <div className="bg-gradient-to-br from-indigo-900 via-slate-900 to-slate-950 text-white rounded-3xl p-6 sm:p-8 shadow-sm border border-slate-800 relative overflow-hidden">
        {/* Subtle decorative glow */}
        <div className="absolute top-0 right-0 w-96 h-96 bg-indigo-500/10 rounded-full blur-3xl pointer-events-none" />

        <div className="relative z-10 flex flex-col lg:flex-row lg:items-center justify-between gap-6">
          {/* Greeting & Identity */}
          <div className="space-y-3 max-w-2xl">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs font-black px-3 py-1 rounded-full bg-white/10 text-indigo-200 border border-white/10 flex items-center gap-1.5">
                <span>{user.avatar}</span>
                <span>{user.name}</span>
              </span>
              <span className="text-xs font-bold px-3 py-1 rounded-full bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
                {tierMeta.label} ({tierMeta.ageRange})
              </span>
              <span className="text-xs font-semibold px-3 py-1 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 flex items-center gap-1">
                <CheckCircle2 className="w-3.5 h-3.5" />
                Adaptive ELO Active
              </span>
            </div>

            <div>
              <h1 className="text-2xl sm:text-3xl font-black text-white tracking-tight">
                Welcome back, {user.name}!
              </h1>
              <p className="text-sm text-slate-300 mt-1 leading-relaxed">
                {activeTier === 'early'
                  ? 'Your next mission: Session 1 Autumn Apple Picker and tactile numbers 1 & 2.'
                  : `You are on a ${user.streakDays}-day streak! Continue your ${recommendedLesson?.title || 'daily math sprint'} to reach Level ${user.dynamicLevel + 1}.`}
              </p>
            </div>

            {/* Quick Action Button */}
            <div className="pt-2 flex flex-wrap items-center gap-3">
              <button
                onClick={handleResumeLearning}
                className="px-6 py-3 rounded-2xl bg-indigo-500 hover:bg-indigo-600 text-white font-black text-xs sm:text-sm transition flex items-center gap-2 shadow-md hover:shadow-indigo-500/30 cursor-pointer active:scale-98"
              >
                <Play className="w-4 h-4 fill-white" />
                <span>
                  {activeTier === 'early' ? "Continue Age 3 Yearly Session" : "Continue Today's Mission"}
                </span>
              </button>

              {activeTier === 'early' && (
                <button
                  onClick={() => {
                    playClickSound();
                    speakText("Welcome to Early Sprouts! Let's count apples and sing our counting song together!");
                  }}
                  className="p-3 rounded-2xl bg-white/10 hover:bg-white/20 text-white transition flex items-center justify-center cursor-pointer"
                  title="Hear greeting spoken aloud"
                >
                  <Volume2 className="w-4 h-4" />
                </button>
              )}

              {onOpenScratchpad && (
                <button
                  onClick={() => {
                    playClickSound();
                    onOpenScratchpad();
                  }}
                  className="px-4 py-3 rounded-2xl bg-white/10 hover:bg-white/15 text-slate-200 font-bold text-xs transition border border-white/10 flex items-center gap-1.5 cursor-pointer"
                >
                  <BookOpen className="w-3.5 h-3.5" />
                  <span>Math Scratchpad</span>
                </button>
              )}

              {onOpenPlacementQuest && (
                <button
                  onClick={() => {
                    playClickSound();
                    onOpenPlacementQuest();
                  }}
                  className={`px-4 py-3 rounded-2xl font-bold text-xs transition flex items-center gap-1.5 cursor-pointer shadow-sm ${
                    !user.diagnosticComplete
                      ? 'bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-400 hover:to-orange-400 text-white shadow-amber-500/30 animate-pulse'
                      : 'bg-white/10 hover:bg-white/15 text-slate-200 border border-white/10'
                  }`}
                  title="Take 7-Item Adaptive Diagnostic Benchmark"
                >
                  <Compass className="w-3.5 h-3.5" />
                  <span>{!user.diagnosticComplete ? 'Placement Quest (Pending)' : 'Placement Quest'}</span>
                </button>
              )}

              {onOpenGlossary && (
                <button
                  onClick={() => {
                    playClickSound();
                    onOpenGlossary();
                  }}
                  className="px-4 py-3 rounded-2xl bg-white/10 hover:bg-white/15 text-slate-200 font-bold text-xs transition border border-white/10 flex items-center gap-1.5 cursor-pointer"
                  title="Open Bilingual Math Glossary (EN/ES)"
                >
                  <Languages className="w-3.5 h-3.5 text-indigo-300" />
                  <span>Dual Vocab (EN/ES)</span>
                </button>
              )}
            </div>
          </div>

          {/* Habit & Momentum Quick Card */}
          <div className="bg-white/5 backdrop-blur-md rounded-2xl p-5 border border-white/10 flex flex-col gap-4 shrink-0 lg:w-80">
            {/* Daily Minutes Progress */}
            <div>
              <div className="flex items-center justify-between text-xs font-bold text-slate-300 mb-1.5">
                <span className="flex items-center gap-1.5">
                  <Clock className="w-3.5 h-3.5 text-indigo-400" />
                  Daily Time Goal
                </span>
                <span className="font-mono text-white">
                  {screenTimeMinutes} / {dailyTargetMinutes} min
                </span>
              </div>
              <div className="w-full bg-white/10 rounded-full h-2 overflow-hidden">
                <div
                  className="bg-indigo-400 h-full rounded-full transition-all duration-500"
                  style={{ width: `${timeProgressPct}%` }}
                />
              </div>
            </div>

            {/* Streak & Weekly Activity */}
            <div className="flex items-center justify-between pt-1 border-t border-white/10">
              <div>
                <div className="text-[10px] font-extrabold uppercase tracking-wider text-slate-400">
                  Daily Streak
                </div>
                <div className="flex items-center gap-1 text-lg font-black text-rose-400 mt-0.5">
                  <Flame className="w-4 h-4 fill-rose-400" />
                  <span>{user.streakDays} Days</span>
                </div>
              </div>

              {/* Day Dots */}
              <div className="flex items-center gap-1">
                {weekDays.map((wd, i) => (
                  <div
                    key={i}
                    className={`w-5 h-6 rounded-md flex flex-col items-center justify-center text-[9px] font-bold ${
                      wd.completed
                        ? 'bg-rose-500/30 text-rose-300 border border-rose-500/40'
                        : 'bg-white/5 text-slate-500'
                    }`}
                  >
                    <span>{wd.day}</span>
                    {wd.completed && <span className="w-1 h-1 rounded-full bg-rose-400 mt-0.5" />}
                  </div>
                ))}
              </div>
            </div>

            {/* XP Level Progress */}
            <div className="pt-1 border-t border-white/10 flex items-center justify-between text-xs font-semibold">
              <span className="text-slate-300">Level {user.dynamicLevel}</span>
              <span className="text-amber-300 font-bold">{currentXpInLevel} / 500 XP</span>
            </div>
          </div>
        </div>
      </div>

      {/* 1B. DIAGNOSTIC PLACEMENT STATUS BANNER */}
      {!user.diagnosticComplete ? (
        <div className="bg-gradient-to-r from-amber-500 via-orange-500 to-amber-600 text-white p-4 sm:p-5 rounded-3xl shadow-md shadow-orange-500/20 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3.5">
            <div className="p-3 bg-white/20 backdrop-blur-md rounded-2xl text-white shrink-0">
              <Compass className="w-6 h-6" />
            </div>
            <div className="space-y-0.5">
              <div className="flex items-center gap-2">
                <span className="px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-white/25 text-white">
                  Action Required
                </span>
                <span className="font-extrabold text-sm sm:text-base">
                  Initial Diagnostic Placement Pending
                </span>
              </div>
              <p className="text-xs text-orange-100 max-w-xl">
                Take the quick 7-item adaptive benchmark (5 min) to calibrate your mathematical starting level and seat you in your optimal learning zone.
              </p>
            </div>
          </div>

          <button
            onClick={() => {
              playClickSound();
              if (onOpenPlacementQuest) onOpenPlacementQuest();
            }}
            className="px-5 py-2.5 bg-white text-orange-900 hover:bg-orange-50 rounded-2xl font-black text-xs shadow-md transition cursor-pointer self-start sm:self-auto shrink-0 flex items-center gap-1.5 active:scale-95"
          >
            <span>Start Placement Quest</span>
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      ) : (
        <div className="bg-white px-5 py-3 rounded-2xl border border-slate-200 shadow-xs flex items-center justify-between gap-3 text-xs">
          <div className="flex items-center gap-2.5">
            <ShieldCheck className="w-4 h-4 text-emerald-600 shrink-0" />
            <span className="text-slate-600">
              Diagnostic Calibrated: <strong>Dynamic Level {user.dynamicLevel}</strong> • Initial Latent Ability (θ): <strong>{user.initialThetaScore !== undefined ? (user.initialThetaScore > 0 ? `+${user.initialThetaScore}` : user.initialThetaScore) : '+0.4'}</strong>
            </span>
          </div>
          {onOpenPlacementQuest && (
            <button
              onClick={() => {
                playClickSound();
                onOpenPlacementQuest();
              }}
              className="text-[11px] font-bold text-indigo-600 hover:text-indigo-800 hover:underline cursor-pointer shrink-0"
            >
              Recalibrate Placement
            </button>
          )}
        </div>
      )}

      {/* ==================================================== */}
      {/* 2. STATS OVERVIEW CARDS                              */}
      {/* ==================================================== */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* ELO Rating */}
        <div className="bg-white p-5 rounded-3xl border border-slate-200 shadow-sm flex items-start justify-between">
          <div>
            <div className="flex items-center gap-1.5 text-xs font-bold text-slate-400 uppercase tracking-wider">
              <Star className="w-3.5 h-3.5 text-amber-500 fill-amber-500" />
              <span>ELO Mastery</span>
            </div>
            <div className="text-2xl font-black text-slate-900 mt-1">
              {user.eloRating.toLocaleString()}
            </div>
            <span className="text-[11px] font-bold text-emerald-600 mt-1 block flex items-center gap-1">
              <TrendingUp className="w-3 h-3" />
              +32 rating this week
            </span>
          </div>
          <div className="w-10 h-10 rounded-2xl bg-amber-50 text-amber-600 flex items-center justify-center font-bold text-lg">
            ⭐
          </div>
        </div>

        {/* Daily Streak */}
        <div className="bg-white p-5 rounded-3xl border border-slate-200 shadow-sm flex items-start justify-between">
          <div>
            <div className="flex items-center gap-1.5 text-xs font-bold text-slate-400 uppercase tracking-wider">
              <Flame className="w-3.5 h-3.5 text-rose-500" />
              <span>Active Streak</span>
            </div>
            <div className="text-2xl font-black text-slate-900 mt-1">
              {user.streakDays} <span className="text-xs font-semibold text-slate-500">days</span>
            </div>
            <span className="text-[11px] font-bold text-rose-600 mt-1 block">
              🔥 Streak Shield Active
            </span>
          </div>
          <div className="w-10 h-10 rounded-2xl bg-rose-50 text-rose-600 flex items-center justify-center font-bold text-lg">
            🔥
          </div>
        </div>

        {/* Star Coins */}
        <div
          onClick={() => {
            playClickSound();
            onOpenRewards();
          }}
          className="bg-white p-5 rounded-3xl border border-slate-200 shadow-sm flex items-start justify-between cursor-pointer hover:border-amber-300 transition group"
        >
          <div>
            <div className="flex items-center gap-1.5 text-xs font-bold text-slate-400 uppercase tracking-wider">
              <Award className="w-3.5 h-3.5 text-amber-500" />
              <span>Star Coins</span>
            </div>
            <div className="text-2xl font-black text-slate-900 mt-1">
              {user.coins.toLocaleString()}
            </div>
            <span className="text-[11px] font-bold text-amber-600 mt-1 block group-hover:underline">
              Open Rewards Vault →
            </span>
          </div>
          <div className="w-10 h-10 rounded-2xl bg-amber-50 text-amber-600 flex items-center justify-center font-bold text-lg">
            🪙
          </div>
        </div>

        {/* Rank Level */}
        <div className="bg-white p-5 rounded-3xl border border-slate-200 shadow-sm flex items-start justify-between">
          <div>
            <div className="flex items-center gap-1.5 text-xs font-bold text-slate-400 uppercase tracking-wider">
              <Zap className="w-3.5 h-3.5 text-indigo-500" />
              <span>Rank Level</span>
            </div>
            <div className="text-2xl font-black text-slate-900 mt-1">
              Level {user.dynamicLevel}
            </div>
            <span className="text-[11px] font-bold text-slate-500 mt-1 block">
              {500 - currentXpInLevel} XP to Level {user.dynamicLevel + 1}
            </span>
          </div>
          <div className="w-10 h-10 rounded-2xl bg-indigo-50 text-indigo-600 flex items-center justify-center font-bold text-lg">
            🏆
          </div>
        </div>
      </div>

      {/* ==================================================== */}
      {/* 3. TEACHER ASSIGNED MISSIONS (IF ANY)                */}
      {/* ==================================================== */}
      {studentAssignments.length > 0 && (
        <div className="bg-gradient-to-br from-indigo-50/80 to-purple-50/80 rounded-3xl p-5 sm:p-6 border border-indigo-200 shadow-xs space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Calendar className="w-4 h-4 text-indigo-600" />
              <h3 className="text-sm font-black text-slate-900">
                Pending Educator Quests ({studentAssignments.length})
              </h3>
            </div>
            <span className="text-xs font-bold text-indigo-700 bg-white px-2.5 py-0.5 rounded-full border border-indigo-200">
              Assigned Tasks
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {studentAssignments.map(asg => (
              <div
                key={asg.id}
                className="bg-white p-4 rounded-2xl border border-indigo-200 shadow-xs flex items-center justify-between gap-4"
              >
                <div>
                  <span className="text-[10px] font-extrabold uppercase px-2 py-0.5 rounded bg-indigo-100 text-indigo-800">
                    Due {asg.dueDate}
                  </span>
                  <h4 className="text-sm font-bold text-slate-900 mt-1">{asg.title}</h4>
                  <p className="text-xs text-slate-500 mt-0.5 line-clamp-1">{asg.customInstructions}</p>
                </div>

                <button
                  onClick={() => {
                    playClickSound();
                    if (tierLessons[0]) onSelectLesson(tierLessons[0]);
                  }}
                  className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold transition shadow-xs shrink-0 flex items-center gap-1 cursor-pointer"
                >
                  <Play className="w-3.5 h-3.5 fill-white" />
                  <span>Start Task</span>
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ==================================================== */}
      {/* 3.5. INFINITE ADAPTIVE AI PRACTICE BANNER (PHASE 3)  */}
      {/* ==================================================== */}
      <div className="bg-linear-to-r from-slate-900 via-indigo-950 to-purple-950 rounded-3xl p-5 sm:p-6 text-white border border-indigo-900/50 shadow-md flex flex-col md:flex-row items-start md:items-center justify-between gap-5">
        <div className="space-y-1.5 max-w-xl">
          <div className="flex items-center gap-2">
            <span className="px-2.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 text-[10px] font-extrabold uppercase tracking-wider flex items-center gap-1">
              <Zap className="w-3 h-3 text-emerald-400" /> Phase 3 Live
            </span>
            <span className="px-2.5 py-0.5 rounded-full bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 text-[10px] font-extrabold uppercase tracking-wider">
              IRT • 3PL Adaptive Calibrator
            </span>
          </div>
          <h3 className="text-lg sm:text-xl font-black text-white">
            Infinite Adaptive Math Practice & Socratic AI Coach
          </h3>
          <p className="text-xs sm:text-sm text-slate-300 leading-relaxed">
            Practice an endless stream of personalized questions automatically calibrated to your exact ability (Level {user.dynamicLevel} • {user.eloRating} ELO). Receive instant Socratic clues and diagnostic misconception feedback.
          </p>
        </div>

        <div className="flex items-center gap-2.5 w-full md:w-auto shrink-0">
          <button
            onClick={() => {
              playClickSound();
              setShowAdaptivePractice(true);
            }}
            className="flex-1 md:flex-initial px-5 py-3 rounded-2xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs sm:text-sm transition flex items-center justify-center gap-2 shadow-lg shadow-indigo-600/30 cursor-pointer"
          >
            <Bot className="w-4 h-4 text-amber-300" />
            <span>Start Adaptive Practice →</span>
          </button>
        </div>
      </div>

      {/* ==================================================== */}
      {/* 4. TWO-COLUMN OPERATIONAL COCKPIT:                   */}
      {/*    Left: Interactive Practice Lab                    */}
      {/*    Right: Real-time 5-Domain Mastery Analytics       */}
      {/* ==================================================== */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Column: Interactive Practice Lab (7 cols) */}
        <div className="lg:col-span-7 bg-white rounded-3xl p-6 border border-slate-200 shadow-sm space-y-4 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div>
                <div className="flex items-center gap-1.5 text-xs font-extrabold uppercase tracking-wider text-indigo-600">
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>Daily Interactive Lab</span>
                </div>
                <h3 className="text-base font-black text-slate-900 mt-0.5">
                  {activeTier === 'early' && 'Tactile Counter & Counting Speech'}
                  {activeTier === 'elementary' && 'Visual Fraction Pizza Explorer'}
                  {activeTier === 'middle' && 'Coordinate Slope & Linear Grapher'}
                  {activeTier === 'high' && 'Calculus Tangent & Derivative Inspector'}
                </h3>
              </div>

              <div className="flex items-center gap-2">
                <span className="text-xs font-bold px-2.5 py-1 bg-slate-100 text-slate-700 rounded-full hidden sm:inline">
                  {tierMeta.label}
                </span>
                {onNavigate && (
                  <button
                    onClick={() => {
                      playClickSound();
                      onNavigate('labs');
                    }}
                    className="px-3 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold transition flex items-center gap-1.5 cursor-pointer shadow-xs"
                  >
                    <Compass className="w-3.5 h-3.5" />
                    <span>All 7 Math Labs →</span>
                  </button>
                )}
              </div>
            </div>

            {/* Early (3-6) Counter */}
            {activeTier === 'early' && (
              <div className="bg-slate-50 rounded-2xl p-6 border border-slate-200 mt-4 flex flex-col items-center justify-center gap-5">
                <div className="flex flex-wrap items-center justify-center gap-3 min-h-[60px] max-w-xl">
                  {Array.from({ length: Math.min(appleCount, 20) }).map((_, i) => (
                    <button
                      key={i}
                      onClick={() => {
                        playClickSound();
                        speakText(`${i + 1}`);
                      }}
                      className="text-4xl hover:scale-125 transition-transform cursor-pointer select-none"
                      title={`Count ${i + 1}`}
                    >
                      {i % 2 === 0 ? '🍎' : '⭐'}
                    </button>
                  ))}
                </div>

                <div className="flex flex-col items-center gap-3">
                  <div className="text-3xl font-black text-slate-900">{appleCount}</div>
                  <div className="flex items-center gap-3">
                    <button
                      onClick={handleAppleDecrement}
                      className="w-12 h-10 rounded-full border border-slate-300 bg-white hover:bg-slate-100 flex items-center justify-center text-xl font-black transition cursor-pointer shadow-xs"
                      title="Subtract 1"
                    >
                      −
                    </button>
                    <button
                      onClick={handleAppleIncrement}
                      className="w-12 h-10 rounded-full border border-slate-300 bg-white hover:bg-slate-100 flex items-center justify-center text-xl font-black transition cursor-pointer shadow-xs"
                      title="Add 1"
                    >
                      +
                    </button>
                  </div>
                  <button
                    onClick={handleCelebrate}
                    className="px-5 py-2 rounded-full bg-amber-500 hover:bg-amber-600 text-white text-xs font-bold transition shadow-xs cursor-pointer"
                  >
                    Celebrate Count! 🎉
                  </button>
                </div>
              </div>
            )}

            {/* Elementary (7-10) Pizza */}
            {activeTier === 'elementary' && (
              <div className="bg-slate-50 rounded-2xl p-6 border border-slate-200 mt-4 flex flex-col sm:flex-row items-center justify-around gap-5">
                <canvas
                  ref={pizzaCanvasRef}
                  width={200}
                  height={200}
                  className="rounded-full shadow-xs bg-white border border-slate-200"
                />
                <div className="space-y-4 text-center sm:text-left">
                  <div className="text-2xl font-black text-indigo-700">
                    {pizzaShaded} / {pizzaSlices} = {(pizzaShaded / pizzaSlices).toFixed(2)}
                  </div>
                  <div className="space-y-2 text-xs font-bold text-slate-600">
                    <div className="flex items-center gap-2">
                      <span>Total Slices:</span>
                      <button
                        onClick={() => {
                          playClickSound();
                          setPizzaSlices(Math.max(2, pizzaSlices - 1));
                          setPizzaShaded(Math.min(pizzaShaded, pizzaSlices - 1));
                        }}
                        className="px-2 py-0.5 bg-white border rounded"
                      >
                        -
                      </button>
                      <span className="font-mono w-4 text-center">{pizzaSlices}</span>
                      <button
                        onClick={() => {
                          playClickSound();
                          setPizzaSlices(Math.min(12, pizzaSlices + 1));
                        }}
                        className="px-2 py-0.5 bg-white border rounded"
                      >
                        +
                      </button>
                    </div>

                    <div className="flex items-center gap-2">
                      <span>Shaded Slices:</span>
                      <button
                        onClick={() => {
                          playClickSound();
                          setPizzaShaded(Math.max(0, pizzaShaded - 1));
                        }}
                        className="px-2 py-0.5 bg-white border rounded"
                      >
                        -
                      </button>
                      <span className="font-mono w-4 text-center">{pizzaShaded}</span>
                      <button
                        onClick={() => {
                          playClickSound();
                          setPizzaShaded(Math.min(pizzaSlices, pizzaShaded + 1));
                        }}
                        className="px-2 py-0.5 bg-white border rounded"
                      >
                        +
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Middle (11-14) Coordinate Plane */}
            {activeTier === 'middle' && (
              <div className="bg-slate-50 rounded-2xl p-6 border border-slate-200 mt-4 flex flex-col items-center justify-center gap-4">
                <canvas
                  ref={coordCanvasRef}
                  width={340}
                  height={200}
                  className="w-full max-w-sm h-auto bg-white rounded-xl border border-slate-200 shadow-xs"
                />
                <div className="flex items-center gap-4 text-xs font-bold text-slate-700">
                  <label className="flex items-center gap-2">
                    <span>Slope m:</span>
                    <input
                      type="range"
                      min="-3"
                      max="3"
                      step="0.5"
                      value={slopeM}
                      onChange={e => setSlopeM(Number(e.target.value))}
                      className="w-24 accent-indigo-600"
                    />
                    <span className="font-mono">{slopeM}</span>
                  </label>
                  <label className="flex items-center gap-2">
                    <span>Intercept b:</span>
                    <input
                      type="range"
                      min="-4"
                      max="4"
                      step="1"
                      value={interceptB}
                      onChange={e => setInterceptB(Number(e.target.value))}
                      className="w-24 accent-indigo-600"
                    />
                    <span className="font-mono">{interceptB}</span>
                  </label>
                </div>
              </div>
            )}

            {/* High (15-18) Tangent Inspector */}
            {activeTier === 'high' && (
              <div className="bg-slate-50 rounded-2xl p-6 border border-slate-200 mt-4 flex flex-col items-center justify-center gap-4">
                <canvas
                  ref={tangentCanvasRef}
                  width={360}
                  height={200}
                  className="w-full max-w-sm h-auto bg-white rounded-xl border border-slate-200 shadow-xs"
                />
                <div className="flex items-center gap-4 text-xs font-bold text-slate-700">
                  <label className="flex items-center gap-2">
                    <span>Point x ({tangentX.toFixed(1)}):</span>
                    <input
                      type="range"
                      min="-3"
                      max="3"
                      step="0.2"
                      value={tangentX}
                      onChange={e => setTangentX(Number(e.target.value))}
                      className="w-32 accent-purple-600"
                    />
                  </label>
                  <span className="text-xs font-mono font-bold text-purple-700">
                    f'(x) = {(2 * tangentX).toFixed(2)}
                  </span>
                </div>
              </div>
            )}
          </div>

          <div className="pt-3 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500">
            <span>Dynamic math laboratory adapting to your stage</span>
            {activeTier === 'early' && onOpenAgePage && (
              <button
                onClick={() => onOpenAgePage(3)}
                className="text-xs font-bold text-indigo-600 hover:text-indigo-800 flex items-center gap-1 cursor-pointer"
              >
                <span>View Full Age 3 (4 Sessions)</span>
                <ChevronRight className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>

        {/* Right Column: 5-Domain Mastery Analytics (5 cols) */}
        <div className="lg:col-span-5 bg-white rounded-3xl p-6 border border-slate-200 shadow-sm space-y-4 flex flex-col justify-between">
          <div className="space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div>
                <div className="flex items-center gap-1.5 text-xs font-extrabold uppercase tracking-wider text-indigo-600">
                  <Target className="w-3.5 h-3.5" />
                  <span>Adaptive Mastery Matrix</span>
                </div>
                <h3 className="text-base font-black text-slate-900 mt-0.5">
                  5 Core Math Domains
                </h3>
              </div>

              <span className="text-[11px] font-extrabold px-2 py-0.5 bg-indigo-50 text-indigo-700 rounded-md border border-indigo-200">
                Live ELO
              </span>
            </div>

            <div className="space-y-3">
              {currentMastery.map((item, idx) => (
                <div key={idx} className="space-y-1">
                  <div className="flex justify-between items-center text-xs font-bold">
                    <span className="text-slate-800">{item.label}</span>
                    <div className="flex items-center gap-2">
                      <span className={`text-[10px] px-1.5 py-0.2 rounded font-extrabold ${
                        item.status === 'Mastered'
                          ? 'bg-emerald-100 text-emerald-800'
                          : item.status === 'On Track'
                          ? 'bg-indigo-100 text-indigo-800'
                          : 'bg-amber-100 text-amber-800'
                      }`}>
                        {item.status}
                      </span>
                      <span className="font-mono text-slate-900">{item.score}%</span>
                    </div>
                  </div>
                  <div className="w-full bg-slate-100 h-2 rounded-full overflow-hidden">
                    <div
                      className={`h-full ${item.color} rounded-full transition-all duration-500`}
                      style={{ width: `${item.score}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>

            {/* Diagnostic Skill Alert */}
            <div className="p-3.5 rounded-2xl bg-amber-50/70 border border-amber-200/80 text-xs text-amber-900 leading-relaxed flex items-start gap-2.5">
              <AlertCircle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
              <div>
                <span className="font-bold block">Targeted Practice Insight:</span>
                Your highest fluency is in <strong className="underline font-extrabold">{currentMastery[0].label}</strong>. Spending 5 minutes on <strong className="font-extrabold">{currentMastery[currentMastery.length - 1].label}</strong> will boost your ELO!
              </div>
            </div>
          </div>

          <div className="pt-3 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500">
            <span>Evaluated across 40+ dynamic trials</span>
            {onNavigate && (
              <button
                onClick={() => onNavigate('curriculum')}
                className="font-bold text-indigo-600 hover:text-indigo-800 cursor-pointer"
              >
                Curriculum Map →
              </button>
            )}
          </div>
        </div>
      </div>

      {/* ==================================================== */}
      {/* 5. UP NEXT IN YOUR LEARNING PATH                     */}
      {/* ==================================================== */}
      <div className="bg-white rounded-3xl p-6 sm:p-8 border border-slate-200 shadow-sm space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-100 pb-4">
          <div>
            <div className="inline-flex items-center gap-1.5 text-xs font-extrabold uppercase tracking-wider text-indigo-600">
              <Compass className="w-3.5 h-3.5" />
              <span>Up Next For You</span>
            </div>
            <h3 className="text-xl font-black text-slate-900 mt-0.5">
              Curated Next Step Modules
            </h3>
            <p className="text-xs text-slate-500">
              Recommended lessons directly tailored to your tier and current mastery level
            </p>
          </div>

          {onNavigate && (
            <button
              onClick={() => onNavigate('curriculum')}
              className="self-start sm:self-auto text-xs font-bold text-indigo-600 hover:text-indigo-800 flex items-center gap-1 cursor-pointer"
            >
              <span>View All {tierLessons.length} Modules in Curriculum</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {tierLessons.slice(0, 3).map((lesson, idx) => (
            <div
              key={lesson.id}
              className="p-5 rounded-2xl border border-slate-200 bg-slate-50/50 hover:bg-white hover:border-indigo-300 hover:shadow-md transition-all flex flex-col justify-between gap-4 group"
            >
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-extrabold uppercase px-2 py-0.5 rounded bg-white border border-slate-200 text-slate-700">
                    Step {idx + 1} · {lesson.topic}
                  </span>
                  <span className="text-xs font-bold text-amber-600 flex items-center gap-1">
                    <Sparkles className="w-3 h-3" />
                    +{lesson.xpReward} XP
                  </span>
                </div>

                <h4 className="text-sm font-black text-slate-900 group-hover:text-indigo-600 transition">
                  {lesson.title}
                </h4>
                <p className="text-xs text-slate-500 line-clamp-2 leading-relaxed font-medium">
                  {lesson.description}
                </p>

                <div className="flex items-center gap-2 text-[11px] text-slate-500 pt-2 border-t border-slate-200/60">
                  <span className="flex items-center gap-1">
                    <Clock className="w-3 h-3" /> {lesson.estimatedMinutes}m
                  </span>
                  <span>•</span>
                  <span>{lesson.problems.length} problems</span>
                  <span>•</span>
                  <span className="text-amber-600 font-bold">+{lesson.coinReward} Coins</span>
                </div>
              </div>

              <button
                onClick={() => {
                  playClickSound();
                  onSelectLesson(lesson);
                }}
                className="w-full py-2.5 rounded-xl bg-slate-900 group-hover:bg-indigo-600 text-white text-xs font-bold transition flex items-center justify-center gap-1.5 shadow-xs cursor-pointer"
              >
                <Play className="w-3.5 h-3.5 fill-white" />
                <span>Launch Lesson</span>
              </button>
            </div>
          ))}
        </div>
      </div>

      {/* Infinite Adaptive Practice Modal (Phase 3) */}
      {showAdaptivePractice && (
        <InfiniteAdaptiveModal
          user={user}
          learnerId={practiceLearnerId}
          onClose={() => setShowAdaptivePractice(false)}
          onUpdateUserProfile={onUpdateUserProfile || (() => {})}
          onOpenGlossary={onOpenGlossary}
        />
      )}
    </div>
  );
};
