import React, { useState } from 'react';
import { AgeTier, UserProfile, NavigationTab, MathLesson } from '../types';
import { AGE_PROFILES, CATEGORY_DETAILS } from '../data/ageCurriculumData';
import { AGE_TIER_META } from '../data/curriculumData';
import { Age3YearlyCurriculum } from './Age3YearlyCurriculum';
import {
  ArrowLeft,
  ArrowRight,
  Sparkles,
  CheckCircle2,
  HelpCircle,
  Play,
  Volume2,
  Clock,
  BookOpen,
  Award,
  PenTool,
  ShieldCheck,
  ChevronRight,
  RotateCcw,
  Target,
  GraduationCap
} from 'lucide-react';
import { playClickSound, playSuccessSound, speakText } from '../utils/audio';

interface AgeSpecificPageProps {
  age: number;
  onSelectAge: (age: number) => void;
  onSelectCategory: (tier: AgeTier) => void;
  onNavigate: (tab: NavigationTab) => void;
  onStartLearning: (tier: AgeTier, age: number) => void;
  activeProfile: UserProfile;
  lessons: MathLesson[];
}

export const AgeSpecificPage: React.FC<AgeSpecificPageProps> = ({
  age,
  onSelectAge,
  onSelectCategory,
  onNavigate,
  onStartLearning,
  activeProfile,
  lessons
}) => {
  const profileData = AGE_PROFILES[age] || AGE_PROFILES[8];
  const categoryMeta = CATEGORY_DETAILS[profileData.tier];

  // Interactive challenge state
  const [selectedOption, setSelectedOption] = useState<number | null>(null);
  const [hasSubmitted, setHasSubmitted] = useState(false);
  const [showHint, setShowHint] = useState(false);

  // Age 3 dedicated view mode (4-session yearly curriculum vs overview)
  const [age3ViewMode, setAge3ViewMode] = useState<'yearly' | 'overview'>('yearly');

  // Local interactive playground states
  const [applesCount, setApplesCount] = useState(3);
  const [pizzaSlices, setPizzaSlices] = useState(4);
  const [pizzaShaded, setPizzaShaded] = useState(2);
  const [slopeM, setSlopeM] = useState(1.5);
  const [interceptB, setInterceptB] = useState(1);
  const [tangentX, setTangentX] = useState(1);
  const [tenFrameDots, setTenFrameDots] = useState(6);
  const [integerPos, setIntegerPos] = useState(4);
  const [integerNeg, setIntegerNeg] = useState(2);
  const [quadA, setQuadA] = useState(1);
  const [quadB, setQuadB] = useState(-4);
  const [quadC, setQuadC] = useState(3);
  const [trigTheta, setTrigTheta] = useState(45);
  const [limitApproach, setLimitApproach] = useState(2.9);

  // Reset challenge on age change
  const handleAnswerSelect = (index: number) => {
    playClickSound();
    setSelectedOption(index);
    setHasSubmitted(true);
    if (index === profileData.sampleChallenge.correctIndex) {
      playSuccessSound();
    }
  };

  const handleResetChallenge = () => {
    playClickSound();
    setSelectedOption(null);
    setHasSubmitted(false);
    setShowHint(false);
  };

  // Filter lessons matching this tier
  const matchingLessons = lessons.filter(l => l.tier === profileData.tier);

  return (
    <div className="space-y-8 pb-12">
      {/* ===== BREADCRUMB & AGE STEPPER BAR ===== */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white p-4 rounded-2xl border border-slate-200 shadow-xs">
        <div className="flex items-center gap-2 text-xs font-bold text-slate-500">
          <button
            onClick={() => {
              playClickSound();
              onNavigate('home');
            }}
            className="hover:text-indigo-600 transition cursor-pointer"
          >
            Home
          </button>
          <span>/</span>
          <button
            onClick={() => {
              playClickSound();
              onSelectCategory(profileData.tier);
            }}
            className="hover:text-indigo-600 transition cursor-pointer flex items-center gap-1"
          >
            <span>{categoryMeta.icon}</span>
            <span>{categoryMeta.title}</span>
          </button>
          <span>/</span>
          <span className="text-slate-900 font-extrabold">Age {age}</span>
        </div>

        {/* Horizontal Age Selector Bar */}
        <div className="flex items-center overflow-x-auto pb-1 md:pb-0 gap-1 text-xs font-bold scrollbar-thin">
          {Array.from({ length: 16 }, (_, i) => i + 3).map(a => {
            const isSelected = a === age;
            const aData = AGE_PROFILES[a];
            return (
              <button
                key={a}
                onClick={() => {
                  playClickSound();
                  onSelectAge(a);
                  handleResetChallenge();
                }}
                className={`px-2.5 py-1.5 rounded-xl transition shrink-0 cursor-pointer ${
                  isSelected
                    ? 'bg-indigo-600 text-white shadow-xs font-extrabold'
                    : 'bg-slate-100 hover:bg-slate-200 text-slate-600'
                }`}
                title={`${aData?.title || `Age ${a}`}`}
              >
                {a}
              </button>
            );
          })}
        </div>
      </div>

      {/* ===== HERO BANNER ===== */}
      <section className={`rounded-3xl p-6 sm:p-10 border shadow-sm ${categoryMeta.lightBg} ${categoryMeta.borderClass}`}>
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
          <div className="space-y-3 max-w-3xl">
            <div className="flex flex-wrap items-center gap-2">
              <span className={`text-xs font-extrabold px-3 py-1 rounded-full border ${categoryMeta.badgeClass} flex items-center gap-1.5`}>
                <span>{categoryMeta.icon}</span>
                <span>{categoryMeta.title}</span>
              </span>
              <span className="text-xs font-bold px-3 py-1 rounded-full bg-white border border-slate-200 text-slate-700">
                🎓 {profileData.gradeLevel}
              </span>
              <span className="text-xs font-bold px-3 py-1 rounded-full bg-white border border-slate-200 text-slate-700 flex items-center gap-1">
                <Clock className="w-3.5 h-3.5 text-indigo-500" />
                {profileData.recommendedDailyMinutes} min / day
              </span>
            </div>

            <h1 className="text-2xl sm:text-4xl font-black text-slate-900 tracking-tight">
              {profileData.title}
            </h1>

            <p className="text-sm sm:text-base text-slate-600 leading-relaxed font-normal">
              {profileData.subtitle}
            </p>

            <div className="p-4 bg-white/90 backdrop-blur-sm rounded-2xl border border-slate-200/80 text-xs text-slate-700 leading-relaxed">
              <strong className="text-slate-900 block mb-1">🧠 Developmental Cognitive Focus:</strong>
              {profileData.cognitiveFocus}
            </div>
          </div>

          {/* Quick Action Box */}
          <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-sm flex flex-col gap-3 shrink-0 lg:w-72">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center font-black text-xl shadow-inner">
                {age}
              </div>
              <div>
                <div className="text-xs font-extrabold text-slate-900">Age {age} Curriculum</div>
                <div className="text-[11px] text-slate-500 font-semibold">{matchingLessons.length} Tailored Lessons</div>
              </div>
            </div>

            <button
              onClick={() => onStartLearning(profileData.tier, age)}
              className="w-full py-3 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-extrabold transition flex items-center justify-center gap-2 cursor-pointer shadow-sm"
            >
              <Play className="w-4 h-4 fill-white" />
              <span>Start Age {age} Learning Session</span>
            </button>

            <div className="flex items-center justify-between text-[11px] text-slate-400 font-semibold px-1">
              <span>Adaptive ELO Ready</span>
              <span>•</span>
              <span>Offline Synced</span>
            </div>
          </div>
        </div>
      </section>

      {/* ===== AGE 3 YEARLY CURRICULUM SWITCHER (WEEKS 1–48) ===== */}
      {age === 3 && (
        <div className="bg-white p-2.5 rounded-2xl border border-amber-200 shadow-xs flex flex-col sm:flex-row items-center justify-between gap-3">
          <div className="flex items-center gap-1.5 w-full sm:w-auto">
            <button
              onClick={() => {
                playClickSound();
                setAge3ViewMode('yearly');
              }}
              className={`flex-1 sm:flex-initial py-2 px-4 rounded-xl text-xs font-black transition cursor-pointer flex items-center justify-center gap-2 ${
                age3ViewMode === 'yearly'
                  ? 'bg-amber-600 text-white shadow-xs'
                  : 'text-slate-600 hover:bg-amber-50 hover:text-amber-900'
              }`}
            >
              <span>🍂 ❄️ 🌱 ☀️</span>
              <span>4-Session Yearly Curriculum (Weeks 1–48)</span>
            </button>

            <button
              onClick={() => {
                playClickSound();
                setAge3ViewMode('overview');
              }}
              className={`flex-1 sm:flex-initial py-2 px-4 rounded-xl text-xs font-bold transition cursor-pointer flex items-center justify-center gap-2 ${
                age3ViewMode === 'overview'
                  ? 'bg-slate-900 text-white shadow-xs'
                  : 'text-slate-600 hover:bg-slate-100'
              }`}
            >
              <span>Single Lesson Playground</span>
            </button>
          </div>

          <div className="text-[11px] text-amber-800 font-bold px-3 py-1 bg-amber-50 rounded-xl border border-amber-200/80">
            {age3ViewMode === 'yearly' ? 'Exploring 4 Seasonal Terms' : 'Showing Standard Overview'}
          </div>
        </div>
      )}

      {/* ===== AGE 3 DEDICATED 4-SESSION YEARLY CURRICULUM ===== */}
      {age === 3 && age3ViewMode === 'yearly' ? (
        <Age3YearlyCurriculum onStartLesson={() => onStartLearning(profileData.tier, age)} />
      ) : (
        <>
          {/* ===== AGE-SPECIFIC INTERACTIVE PLAYGROUND ===== */}
          <section className="bg-white rounded-3xl p-6 sm:p-8 border border-slate-200 shadow-sm space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-4">
          <div>
            <div className="inline-flex items-center gap-1.5 text-xs font-extrabold uppercase tracking-wider text-indigo-600">
              <Sparkles className="w-4 h-4" />
              Hands-On Age {age} Manipulative
            </div>
            <h2 className="text-xl font-extrabold text-slate-900 mt-0.5">
              {profileData.interactiveTitle}
            </h2>
            <p className="text-xs text-slate-500 mt-1">
              {profileData.interactiveInstructions}
            </p>
          </div>

          <button
            onClick={() => {
              playClickSound();
              speakText(`${profileData.interactiveTitle}. ${profileData.interactiveInstructions}`);
            }}
            className="self-start sm:self-auto p-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-600 transition cursor-pointer"
            title="Read instructions aloud"
          >
            <Volume2 className="w-4 h-4" />
          </button>
        </div>

        {/* Dynamic Tool Rendering depending on age */}
        <div className="bg-slate-50 rounded-2xl p-6 border border-slate-200/80">
          {/* Age 3 or 4: Tactile Item & Shape Counter */}
          {(age === 3 || age === 4) && (
            <div className="flex flex-col items-center justify-center gap-4 text-center">
              <div className="text-3xl sm:text-4xl flex flex-wrap items-center justify-center gap-3">
                {Array.from({ length: applesCount }).map((_, i) => (
                  <span
                    key={i}
                    onClick={() => {
                      playClickSound();
                      speakText(`Item ${i + 1}`);
                    }}
                    className="cursor-pointer hover:scale-110 transition-transform select-none"
                    title={`Tap item ${i + 1}`}
                  >
                    {age === 3 ? (i % 2 === 0 ? '🍎' : '⭐') : (i % 3 === 0 ? '🔺' : i % 3 === 1 ? '🟦' : '🟡')}
                  </span>
                ))}
              </div>
              <div className="text-2xl font-black text-slate-900">
                Count: {applesCount} {age === 3 ? 'Items' : 'Geometric Shapes'}
              </div>
              <div className="flex items-center gap-3">
                <button
                  onClick={() => {
                    playClickSound();
                    setApplesCount(Math.max(1, applesCount - 1));
                  }}
                  className="w-11 h-11 rounded-2xl bg-white border border-slate-300 font-bold text-xl hover:bg-slate-100 cursor-pointer shadow-xs"
                >
                  −
                </button>
                <button
                  onClick={() => {
                    playClickSound();
                    const next = Math.min(10, applesCount + 1);
                    setApplesCount(next);
                    speakText(`Total is ${next}`);
                  }}
                  className="w-11 h-11 rounded-2xl bg-white border border-slate-300 font-bold text-xl hover:bg-slate-100 cursor-pointer shadow-xs"
                >
                  +
                </button>
              </div>
              <span className="text-xs text-slate-400">
                Tap items to hear audio speech counting.
              </span>
            </div>
          )}

          {/* Age 5 or 6: Ten-Frame Builder */}
          {(age === 5 || age === 6) && (
            <div className="flex flex-col items-center justify-center gap-4 text-center">
              <div className="text-xs font-extrabold uppercase tracking-wider text-slate-400">
                Visual Ten-Frame Structure
              </div>
              <div className="grid grid-cols-5 gap-2.5 bg-white p-4 rounded-2xl border-2 border-slate-300 shadow-inner">
                {Array.from({ length: 10 }).map((_, i) => {
                  const filled = i < tenFrameDots;
                  return (
                    <div
                      key={i}
                      onClick={() => {
                        playClickSound();
                        setTenFrameDots(i + 1);
                        speakText(`${i + 1} dots in frame. ${10 - (i + 1)} empty.`);
                      }}
                      className={`w-12 h-12 rounded-xl flex items-center justify-center font-bold text-lg border-2 cursor-pointer transition ${
                        filled
                          ? 'bg-indigo-600 border-indigo-700 text-white shadow-xs'
                          : 'bg-slate-50 border-dashed border-slate-300 text-slate-300 hover:bg-slate-100'
                      }`}
                    >
                      {filled ? '●' : ''}
                    </div>
                  );
                })}
              </div>
              <div className="text-sm font-bold text-slate-800">
                <span className="text-indigo-600 font-black">{tenFrameDots} filled</span> +{' '}
                <span className="text-amber-600 font-black">{10 - tenFrameDots} empty</span> = 10 total
              </div>
              <input
                type="range"
                min="0"
                max="10"
                value={tenFrameDots}
                onChange={e => setTenFrameDots(Number(e.target.value))}
                className="accent-indigo-600 w-48"
              />
            </div>
          )}

          {/* Age 7, 8, 9, 10: Fraction Pizza & Multiplication Array */}
          {age >= 7 && age <= 10 && (
            <div className="flex flex-col sm:flex-row items-center justify-around gap-6">
              <div className="w-40 h-40 rounded-full bg-amber-100 border-4 border-amber-600 relative flex items-center justify-center shadow-inner shrink-0">
                <div className="text-center font-black text-amber-900 text-lg">
                  {pizzaShaded} / {pizzaSlices}
                  <div className="text-[11px] text-amber-700 font-semibold">
                    {Math.round((pizzaShaded / pizzaSlices) * 100)}%
                  </div>
                </div>
              </div>

              <div className="space-y-3 text-center sm:text-left">
                <div className="text-sm font-bold text-slate-800">
                  Interactive Fraction Pizza Model
                </div>
                <div className="flex flex-wrap gap-4 text-xs font-semibold text-slate-600">
                  <label className="flex items-center gap-2">
                    <span>Total Slices:</span>
                    <input
                      type="range"
                      min="2"
                      max="10"
                      value={pizzaSlices}
                      onChange={e => {
                        const val = Number(e.target.value);
                        setPizzaSlices(val);
                        if (pizzaShaded > val) setPizzaShaded(val);
                      }}
                      className="accent-sky-600"
                    />
                    <span className="font-mono font-bold text-slate-900">{pizzaSlices}</span>
                  </label>

                  <label className="flex items-center gap-2">
                    <span>Shaded:</span>
                    <input
                      type="range"
                      min="1"
                      max={pizzaSlices}
                      value={pizzaShaded}
                      onChange={e => setPizzaShaded(Number(e.target.value))}
                      className="accent-amber-500"
                    />
                    <span className="font-mono font-bold text-slate-900">{pizzaShaded}</span>
                  </label>
                </div>

                <div className="text-xs text-slate-500">
                  Fraction Value: <span className="font-extrabold text-sky-600">{pizzaShaded}/{pizzaSlices}</span> ={' '}
                  <span className="font-extrabold text-emerald-600">{Math.round((pizzaShaded / pizzaSlices) * 100)}%</span>
                </div>
              </div>
            </div>
          )}

          {/* Age 11: Zero-Pair Integer Balance */}
          {age === 11 && (
            <div className="flex flex-col items-center justify-center gap-4 text-center">
              <div className="text-xs font-extrabold uppercase tracking-wider text-slate-400">
                Zero-Pair Integer Cancellation Simulator
              </div>
              <div className="flex items-center gap-6">
                <div>
                  <div className="text-xs font-bold text-emerald-600 mb-1">Positives (+{integerPos})</div>
                  <div className="flex flex-wrap gap-1.5 justify-center max-w-[120px]">
                    {Array.from({ length: integerPos }).map((_, i) => (
                      <span key={i} className="w-7 h-7 rounded-full bg-emerald-100 text-emerald-700 font-bold flex items-center justify-center text-xs">
                        +1
                      </span>
                    ))}
                  </div>
                </div>

                <div className="text-slate-300 font-bold text-xl">vs</div>

                <div>
                  <div className="text-xs font-bold text-rose-600 mb-1">Negatives (-{integerNeg})</div>
                  <div className="flex flex-wrap gap-1.5 justify-center max-w-[120px]">
                    {Array.from({ length: integerNeg }).map((_, i) => (
                      <span key={i} className="w-7 h-7 rounded-full bg-rose-100 text-rose-700 font-bold flex items-center justify-center text-xs">
                        -1
                      </span>
                    ))}
                  </div>
                </div>
              </div>

              <div className="text-sm font-extrabold text-slate-900">
                Net Result: {integerPos - integerNeg >= 0 ? `+${integerPos - integerNeg}` : `${integerPos - integerNeg}`}
              </div>

              <div className="flex gap-4 text-xs font-semibold">
                <button
                  onClick={() => setIntegerPos(p => Math.min(8, p + 1))}
                  className="px-3 py-1 rounded-xl bg-emerald-600 text-white cursor-pointer"
                >
                  Add +1 Positive
                </button>
                <button
                  onClick={() => setIntegerNeg(n => Math.min(8, n + 1))}
                  className="px-3 py-1 rounded-xl bg-rose-600 text-white cursor-pointer"
                >
                  Add -1 Negative
                </button>
              </div>
            </div>
          )}

          {/* Age 12, 13, 14: Linear Equations & Slopes */}
          {age >= 12 && age <= 14 && (
            <div className="flex flex-col sm:flex-row items-center justify-around gap-6">
              <div className="w-48 h-32 bg-white rounded-xl border border-slate-300 p-2 relative flex items-center justify-center shadow-xs shrink-0">
                <div className="absolute w-full h-[1px] bg-slate-300" />
                <div className="absolute h-full w-[1px] bg-slate-300" />
                <div
                  className="absolute w-36 h-[2px] bg-indigo-600 origin-center transition-transform"
                  style={{
                    transform: `translateY(${-interceptB * 8}px) rotate(${-Math.atan(slopeM) * (180 / Math.PI)}deg)`
                  }}
                />
              </div>

              <div className="space-y-3 text-center sm:text-left">
                <div className="text-sm font-bold text-slate-800">
                  Slope-Intercept Equation: <span className="font-mono text-indigo-600">y = {slopeM}x + {interceptB}</span>
                </div>
                <div className="flex flex-wrap gap-4 text-xs font-semibold text-slate-600">
                  <label className="flex items-center gap-2">
                    <span>Slope m ({slopeM}):</span>
                    <input
                      type="range"
                      min="-3"
                      max="3"
                      step="0.5"
                      value={slopeM}
                      onChange={e => setSlopeM(Number(e.target.value))}
                      className="accent-indigo-600"
                    />
                  </label>

                  <label className="flex items-center gap-2">
                    <span>Y-Intercept b ({interceptB}):</span>
                    <input
                      type="range"
                      min="-3"
                      max="3"
                      step="1"
                      value={interceptB}
                      onChange={e => setInterceptB(Number(e.target.value))}
                      className="accent-sky-600"
                    />
                  </label>
                </div>
                <div className="text-xs text-slate-500">
                  Steepness: {Math.abs(slopeM) > 1 ? 'Steep slope' : slopeM === 0 ? 'Flat horizontal' : 'Gentle slope'}
                </div>
              </div>
            </div>
          )}

          {/* Age 15: Parabolic Quadratic Explorer */}
          {age === 15 && (
            <div className="flex flex-col sm:flex-row items-center justify-around gap-6">
              <div className="w-48 h-32 bg-white rounded-xl border border-slate-300 p-2 relative flex items-center justify-center shadow-xs shrink-0 text-center">
                <div className="font-mono text-xs text-purple-700 font-extrabold">
                  y = {quadA}x² + {quadB}x + {quadC}
                  <div className="text-[10px] text-slate-500 font-semibold mt-1">
                    Vertex: x = {(-quadB / (2 * quadA)).toFixed(1)}
                  </div>
                </div>
              </div>

              <div className="space-y-2 text-xs font-semibold text-slate-600">
                <div className="flex items-center gap-2">
                  <span>a: {quadA}</span>
                  <input
                    type="range"
                    min="-2"
                    max="2"
                    step="1"
                    value={quadA === 0 ? 1 : quadA}
                    onChange={e => setQuadA(Number(e.target.value) || 1)}
                    className="accent-purple-600"
                  />
                </div>
                <div className="flex items-center gap-2">
                  <span>b: {quadB}</span>
                  <input
                    type="range"
                    min="-6"
                    max="6"
                    step="1"
                    value={quadB}
                    onChange={e => setQuadB(Number(e.target.value))}
                    className="accent-indigo-600"
                  />
                </div>
                <div className="text-xs text-slate-500">
                  Curvature: {quadA > 0 ? 'Opens upward (U-shaped)' : 'Opens downward (inverted)'}
                </div>
              </div>
            </div>
          )}

          {/* Age 16: Trigonometry Wave */}
          {age === 16 && (
            <div className="flex flex-col sm:flex-row items-center justify-around gap-6">
              <div className="w-36 h-36 rounded-full border-2 border-indigo-400 relative flex items-center justify-center bg-white shadow-xs">
                <div className="absolute w-full h-[1px] bg-slate-200" />
                <div className="absolute h-full w-[1px] bg-slate-200" />
                <div
                  className="absolute w-16 h-[2px] bg-indigo-600 origin-left"
                  style={{ transform: `rotate(${-trigTheta}deg)` }}
                />
                <div className="text-center text-xs font-mono font-bold text-indigo-700">
                  θ = {trigTheta}°
                </div>
              </div>

              <div className="space-y-3 text-center sm:text-left text-xs font-semibold text-slate-600">
                <div>Angle θ Slider:</div>
                <input
                  type="range"
                  min="0"
                  max="360"
                  value={trigTheta}
                  onChange={e => setTrigTheta(Number(e.target.value))}
                  className="accent-indigo-600 w-48"
                />
                <div className="font-mono text-slate-800 space-y-0.5">
                  <div>sin({trigTheta}°) = {Math.sin((trigTheta * Math.PI) / 180).toFixed(3)}</div>
                  <div>cos({trigTheta}°) = {Math.cos((trigTheta * Math.PI) / 180).toFixed(3)}</div>
                </div>
              </div>
            </div>
          )}

          {/* Age 17: Limit Zoomer */}
          {age === 17 && (
            <div className="flex flex-col items-center justify-center gap-3 text-center">
              <div className="font-mono text-sm font-extrabold text-purple-800">
                f(x) = (x² - 9) / (x - 3)
              </div>
              <div className="text-xs text-slate-500">
                Direct plug-in x = 3 yields indeterminate 0/0. Zoom in close:
              </div>
              <div className="flex items-center gap-3 text-xs font-semibold">
                <span>Approach x:</span>
                <input
                  type="range"
                  min="2.5"
                  max="3.5"
                  step="0.05"
                  value={limitApproach}
                  onChange={e => setLimitApproach(Number(e.target.value))}
                  className="accent-purple-600 w-48"
                />
                <span className="font-mono font-bold">{limitApproach.toFixed(2)}</span>
              </div>
              <div className="text-sm font-mono font-bold text-emerald-700">
                f({limitApproach.toFixed(2)}) ≈ {(limitApproach + 3).toFixed(2)} → Limiting Value = 6.00
              </div>
            </div>
          )}

          {/* Age 18: Derivative Tangent Inspector */}
          {age === 18 && (
            <div className="flex flex-col sm:flex-row items-center justify-around gap-6">
              <div className="w-48 h-32 bg-white rounded-xl border border-slate-300 p-2 relative flex items-center justify-center shadow-xs shrink-0 text-center">
                <div className="font-mono text-xs text-purple-700 font-extrabold">
                  f'(x) = 2x
                  <div className="text-[10px] text-slate-500 font-semibold mt-1">
                    At x = {tangentX}, Instantaneous Slope = {(2 * tangentX).toFixed(1)}
                  </div>
                </div>
              </div>

              <div className="space-y-3 text-center sm:text-left text-xs font-semibold text-slate-600">
                <div>Inspection Coordinate x:</div>
                <input
                  type="range"
                  min="-3"
                  max="3"
                  step="0.5"
                  value={tangentX}
                  onChange={e => setTangentX(Number(e.target.value))}
                  className="accent-purple-600 w-48"
                />
                <div className="text-xs text-slate-500">
                  Rate of change is positive when curve rises, 0 at vertex, and negative when falling.
                </div>
              </div>
            </div>
          )}
        </div>
      </section>

      {/* ===== MILESTONES & COMPETENCIES MATRIX ===== */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Milestones */}
        <div className="bg-white rounded-3xl p-6 border border-slate-200 shadow-sm space-y-4">
          <div className="flex items-center gap-2 text-xs font-extrabold uppercase tracking-wider text-indigo-600">
            <Target className="w-4 h-4" />
            Age {age} Developmental Milestones
          </div>
          <h3 className="text-lg font-black text-slate-900">
            Expected Mathematical Fluencies
          </h3>

          <div className="space-y-2.5 pt-1">
            {profileData.milestones.map((m, idx) => (
              <div key={idx} className="flex items-start gap-3 p-3 rounded-2xl bg-slate-50 border border-slate-200/80">
                <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" />
                <span className="text-xs font-semibold text-slate-700">{m}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Competencies */}
        <div className="bg-white rounded-3xl p-6 border border-slate-200 shadow-sm space-y-4">
          <div className="flex items-center gap-2 text-xs font-extrabold uppercase tracking-wider text-indigo-600">
            <GraduationCap className="w-4 h-4" />
            Core Competency Standards
          </div>
          <h3 className="text-lg font-black text-slate-900">
            Curricular Mastery Metrics
          </h3>

          <div className="space-y-3 pt-1">
            {profileData.competencies.map((c, idx) => (
              <div key={idx} className="p-3.5 rounded-2xl bg-slate-50 border border-slate-200/80 space-y-1">
                <div className="flex items-center justify-between text-xs font-bold">
                  <span className="text-slate-900">{c.name}</span>
                  <span className="text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded-md text-[11px] font-extrabold">
                    {c.target}
                  </span>
                </div>
                <p className="text-[11px] text-slate-500 font-medium">{c.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ===== INTERACTIVE KNOWLEDGE CHECK ===== */}
      <section className="bg-white rounded-3xl p-6 sm:p-8 border border-slate-200 shadow-sm space-y-5">
        <div className="flex items-center justify-between border-b border-slate-100 pb-3">
          <div>
            <div className="inline-flex items-center gap-1.5 text-xs font-extrabold uppercase tracking-wider text-indigo-600">
              <Award className="w-4 h-4" />
              Age {age} Benchmark Challenge
            </div>
            <h3 className="text-lg font-black text-slate-900 mt-0.5">
              Quick Diagnostic Assessment
            </h3>
          </div>

          {hasSubmitted && (
            <button
              onClick={handleResetChallenge}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-xs font-bold text-slate-600 transition cursor-pointer"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Try Again</span>
            </button>
          )}
        </div>

        <div className="bg-slate-50 p-5 rounded-2xl border border-slate-200/80 space-y-4">
          <p className="text-sm sm:text-base font-extrabold text-slate-900">
            {profileData.sampleChallenge.question}
          </p>

          {/* Options */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {profileData.sampleChallenge.options.map((opt, i) => {
              const isSelected = selectedOption === i;
              const isCorrect = i === profileData.sampleChallenge.correctIndex;
              let btnClass = 'bg-white border-slate-200 text-slate-700 hover:border-indigo-400 hover:bg-indigo-50/50';

              if (hasSubmitted) {
                if (isCorrect) {
                  btnClass = 'bg-emerald-500 text-white border-emerald-600 shadow-sm font-black';
                } else if (isSelected && !isCorrect) {
                  btnClass = 'bg-rose-500 text-white border-rose-600 shadow-sm font-black';
                } else {
                  btnClass = 'bg-white/50 text-slate-400 border-slate-200 opacity-60';
                }
              } else if (isSelected) {
                btnClass = 'bg-indigo-600 text-white border-indigo-700 shadow-sm font-black';
              }

              return (
                <button
                  key={i}
                  disabled={hasSubmitted}
                  onClick={() => handleAnswerSelect(i)}
                  className={`p-3.5 rounded-xl border text-xs sm:text-sm font-bold transition flex items-center justify-between cursor-pointer ${btnClass}`}
                >
                  <span>{opt}</span>
                  {hasSubmitted && isCorrect && <CheckCircle2 className="w-4 h-4 text-white" />}
                </button>
              );
            })}
          </div>

          {/* Explanation & Hint */}
          {hasSubmitted && (
            <div
              className={`p-4 rounded-xl border text-xs font-semibold leading-relaxed ${
                selectedOption === profileData.sampleChallenge.correctIndex
                  ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
                  : 'bg-amber-50 border-amber-200 text-amber-900'
              }`}
            >
              <div className="font-extrabold mb-1">
                {selectedOption === profileData.sampleChallenge.correctIndex ? '🎉 Excellent Solution!' : '💡 Learning Opportunity:'}
              </div>
              <div>{profileData.sampleChallenge.explanation}</div>
            </div>
          )}

          {!hasSubmitted && (
            <div className="flex items-center justify-between pt-1">
              <button
                onClick={() => setShowHint(prev => !prev)}
                className="text-xs font-bold text-indigo-600 hover:text-indigo-800 flex items-center gap-1 cursor-pointer"
              >
                <HelpCircle className="w-3.5 h-3.5" />
                <span>{showHint ? 'Hide Hint' : 'Show Hint'}</span>
              </button>
              {showHint && (
                <span className="text-xs text-slate-500 italic bg-white px-3 py-1 rounded-lg border border-slate-200">
                  {profileData.sampleChallenge.hint}
                </span>
              )}
            </div>
          )}
        </div>
      </section>

      {/* ===== PARENT & TEACHER GUIDANCE TOOLKIT ===== */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Parent Guide */}
        <div className="bg-white rounded-3xl p-6 border border-slate-200 shadow-sm space-y-2">
          <div className="flex items-center gap-2 text-xs font-extrabold uppercase tracking-wider text-amber-600">
            <ShieldCheck className="w-4 h-4" />
            Parent Support Guide for Age {age}
          </div>
          <h4 className="text-base font-black text-slate-900">How to Encourage at Home</h4>
          <p className="text-xs text-slate-600 leading-relaxed">
            {profileData.parentGuidance}
          </p>
        </div>

        {/* Educator Notes */}
        <div className="bg-white rounded-3xl p-6 border border-slate-200 shadow-sm space-y-2">
          <div className="flex items-center gap-2 text-xs font-extrabold uppercase tracking-wider text-sky-600">
            <BookOpen className="w-4 h-4" />
            Classroom & Pedagogical Notes
          </div>
          <h4 className="text-base font-black text-slate-900">Curriculum Strategy</h4>
          <p className="text-xs text-slate-600 leading-relaxed">
            {profileData.educatorNotes}
          </p>
        </div>
      </div>
      </>
      )}

      {/* ===== NAVIGATION STEPPER BUTTONS ===== */}
      <div className="flex items-center justify-between pt-4 border-t border-slate-200">
        {age > 3 ? (
          <button
            onClick={() => {
              playClickSound();
              onSelectAge(age - 1);
              handleResetChallenge();
            }}
            className="px-4 py-2.5 rounded-xl bg-white border border-slate-200 hover:bg-slate-100 text-xs font-bold text-slate-700 transition flex items-center gap-1.5 cursor-pointer shadow-xs"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>Age {age - 1}: {AGE_PROFILES[age - 1]?.gradeLevel}</span>
          </button>
        ) : (
          <div />
        )}

        {age < 18 && (
          <button
            onClick={() => {
              playClickSound();
              onSelectAge(age + 1);
              handleResetChallenge();
            }}
            className="px-4 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-xs font-bold text-white transition flex items-center gap-1.5 cursor-pointer shadow-xs"
          >
            <span>Age {age + 1}: {AGE_PROFILES[age + 1]?.gradeLevel}</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        )}
      </div>
    </div>
  );
};
