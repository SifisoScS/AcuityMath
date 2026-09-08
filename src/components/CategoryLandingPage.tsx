import React from 'react';
import { AgeTier, NavigationTab, MathLesson, UserProfile } from '../types';
import { CATEGORY_DETAILS, AGE_PROFILES } from '../data/ageCurriculumData';
import {
  Sparkles,
  ArrowRight,
  CheckCircle2,
  Play,
  Clock,
  BookOpen,
  Award,
  Layers,
  ChevronRight,
  ShieldCheck,
  Compass,
  Cpu
} from 'lucide-react';
import { playClickSound } from '../utils/audio';

interface CategoryLandingPageProps {
  currentTier: AgeTier;
  onSelectTier: (tier: AgeTier) => void;
  onSelectAge: (age: number) => void;
  onNavigate: (tab: NavigationTab) => void;
  onSelectLesson: (lesson: MathLesson) => void;
  onStartLearning: (tier: AgeTier, age?: number) => void;
  lessons: MathLesson[];
  activeProfile: UserProfile;
}

export const CategoryLandingPage: React.FC<CategoryLandingPageProps> = ({
  currentTier,
  onSelectTier,
  onSelectAge,
  onNavigate,
  onSelectLesson,
  onStartLearning,
  lessons,
  activeProfile
}) => {
  const category = CATEGORY_DETAILS[currentTier] || CATEGORY_DETAILS['elementary'];
  const matchingLessons = lessons.filter(l => l.tier === currentTier);

  const allTiers: AgeTier[] = ['early', 'elementary', 'middle', 'high'];

  return (
    <div className="space-y-10 pb-12">
      {/* ===== CATEGORY SWITCHER TABS ===== */}
      <div className="bg-white p-2 sm:p-2.5 rounded-2xl border border-slate-200 shadow-xs flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
          {allTiers.map(tier => {
            const cat = CATEGORY_DETAILS[tier];
            const isActive = tier === currentTier;
            return (
              <button
                key={tier}
                onClick={() => {
                  playClickSound();
                  onSelectTier(tier);
                }}
                className={`px-3.5 py-2 rounded-xl text-xs font-extrabold transition flex items-center gap-2 cursor-pointer ${
                  isActive
                    ? 'bg-slate-900 text-white shadow-xs'
                    : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                }`}
              >
                <span>{cat.icon}</span>
                <span>{cat.title}</span>
                <span className={`text-[10px] px-1.5 py-0.5 rounded font-bold ${
                  isActive ? 'bg-slate-800 text-slate-300' : 'bg-slate-100 text-slate-500'
                }`}>
                  {cat.ageRange}
                </span>
              </button>
            );
          })}
        </div>

        <button
          onClick={() => {
            playClickSound();
            onNavigate('home');
          }}
          className="text-xs font-bold text-indigo-600 hover:text-indigo-800 px-3 py-1.5 cursor-pointer"
        >
          ← Back to All Categories
        </button>
      </div>

      {/* ===== CATEGORY HERO BANNER ===== */}
      <section className={`relative overflow-hidden rounded-3xl bg-gradient-to-br ${category.heroGradient} text-white p-8 sm:p-12 border border-slate-800 shadow-xl`}>
        <div className="relative z-10 max-w-3xl space-y-4">
          <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-white/10 border border-white/20 text-white text-xs font-black uppercase tracking-wider backdrop-blur-sm">
            <span className="text-base">{category.icon}</span>
            <span>{category.title} · {category.ageRange}</span>
          </div>

          <h1 className="text-3xl sm:text-5xl font-black tracking-tight leading-tight text-white">
            {category.headline}
          </h1>

          <p className="text-sm sm:text-base text-slate-300 leading-relaxed font-normal">
            {category.tagline} {category.subtitle}
          </p>

          <div className="pt-4 flex flex-wrap items-center gap-3">
            <button
              onClick={() => onStartLearning(currentTier)}
              className="px-6 py-3.5 rounded-2xl bg-indigo-600 hover:bg-indigo-500 text-white font-extrabold text-sm transition shadow-lg shadow-indigo-600/30 flex items-center gap-2 cursor-pointer"
            >
              <Play className="w-4 h-4 fill-white" />
              <span>Launch {category.title} Experience</span>
            </button>

            <button
              onClick={() => {
                playClickSound();
                onNavigate('curriculum');
              }}
              className="px-5 py-3.5 rounded-2xl bg-white/10 hover:bg-white/15 text-white font-bold text-xs border border-white/20 transition flex items-center gap-1.5 cursor-pointer backdrop-blur-sm"
            >
              <BookOpen className="w-4 h-4" />
              <span>View Full Stage Curriculum</span>
            </button>
          </div>
        </div>
      </section>

      {/* ===== 4 AGE-SPECIFIC PAGES DIRECTORY ===== */}
      <section className="space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3">
          <div>
            <div className="flex items-center gap-2 text-xs font-extrabold uppercase tracking-wider text-indigo-600">
              <Layers className="w-4 h-4" />
              Age-Specific Deep Dives
            </div>
            <h2 className="text-2xl font-black text-slate-900 tracking-tight mt-1">
              Select an Age to Explore its Tailored Curriculum & Manipulatives
            </h2>
          </div>
          <p className="text-xs text-slate-500 max-w-sm">
            Each specific year has distinct cognitive milestones, interactive manipulatives, and practice challenges.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5">
          {category.ages.map(ageNum => {
            const ageData = AGE_PROFILES[ageNum];
            if (!ageData) return null;

            return (
              <div
                key={ageNum}
                onClick={() => {
                  playClickSound();
                  onSelectAge(ageNum);
                }}
                className="bg-white rounded-3xl p-6 border border-slate-200 shadow-sm hover:shadow-md hover:border-indigo-300 transition-all cursor-pointer flex flex-col justify-between group"
              >
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <span className="w-12 h-12 rounded-2xl bg-indigo-50 text-indigo-600 font-black text-xl flex items-center justify-center shadow-inner group-hover:scale-105 transition-transform">
                      {ageNum}
                    </span>
                    <span className="text-[11px] font-extrabold px-2.5 py-1 rounded-full bg-slate-100 text-slate-700">
                      {ageData.gradeLevel}
                    </span>
                  </div>

                  <h3 className="text-base font-extrabold text-slate-900 group-hover:text-indigo-600 transition line-clamp-2">
                    {ageData.title}
                  </h3>

                  <p className="text-xs text-slate-500 mt-2 leading-relaxed line-clamp-3">
                    {ageData.subtitle}
                  </p>

                  <div className="mt-4 pt-3 border-t border-slate-100 space-y-1.5 text-[11px] font-semibold text-slate-600">
                    <div className="flex items-center gap-1.5">
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                      <span className="truncate">{ageData.milestones[0]}</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                      <span className="truncate">{ageData.milestones[1]}</span>
                    </div>
                  </div>
                </div>

                <div className="mt-6 pt-3 border-t border-slate-100 flex items-center justify-between text-xs font-bold text-indigo-600 group-hover:text-indigo-700">
                  <span>Open Age {ageNum} Page</span>
                  <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* ===== PEDAGOGY & METHODOLOGY ===== */}
      <section className="bg-white rounded-3xl p-6 sm:p-8 border border-slate-200 shadow-sm space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-100 pb-4">
          <div>
            <div className="inline-flex items-center gap-1.5 text-xs font-extrabold uppercase tracking-wider text-indigo-600">
              <Compass className="w-4 h-4" />
              Pedagogical Framework
            </div>
            <h3 className="text-xl font-extrabold text-slate-900 mt-0.5">
              {category.methodology}
            </h3>
          </div>
          <span className="text-xs font-bold text-slate-400">
            Validated by Cognitive Math Standards
          </span>
        </div>

        <p className="text-xs sm:text-sm text-slate-600 leading-relaxed max-w-4xl">
          {category.pedagogicalApproach}
        </p>

        {/* Core Domains */}
        <div className="space-y-2">
          <div className="text-xs font-extrabold uppercase tracking-wider text-slate-400">
            Key Mathematical Domains in this Category:
          </div>
          <div className="flex flex-wrap gap-2">
            {category.coreDomains.map((domain, i) => (
              <span
                key={i}
                className="px-3 py-1.5 rounded-xl bg-slate-100 border border-slate-200 text-slate-800 text-xs font-bold flex items-center gap-1.5"
              >
                <CheckCircle2 className="w-3.5 h-3.5 text-indigo-600" />
                <span>{domain}</span>
              </span>
            ))}
          </div>
        </div>

        {/* Developmental Goals */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-2">
          {category.developmentalGoals.map((goal, i) => (
            <div key={i} className="flex items-start gap-3 p-3.5 rounded-2xl bg-slate-50 border border-slate-200/80">
              <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" />
              <span className="text-xs font-semibold text-slate-700">{goal}</span>
            </div>
          ))}
        </div>
      </section>

      {/* ===== ARCHITECTURAL HIGHLIGHTS (Bento) ===== */}
      <section className="space-y-4">
        <div className="flex items-center gap-2 text-xs font-extrabold uppercase tracking-wider text-indigo-600">
          <Cpu className="w-4 h-4" />
          Category Features
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {category.keyFeatures.map((feat, i) => (
            <div key={i} className="bg-white rounded-3xl p-6 border border-slate-200 shadow-sm space-y-2">
              <h4 className="text-base font-extrabold text-slate-900 flex items-center gap-2">
                <span className="w-7 h-7 rounded-lg bg-indigo-50 text-indigo-600 flex items-center justify-center text-xs font-black">
                  {i + 1}
                </span>
                <span>{feat.title}</span>
              </h4>
              <p className="text-xs text-slate-500 leading-relaxed pl-9">
                {feat.desc}
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* ===== CURATED LESSONS IN THIS CATEGORY ===== */}
      <section className="bg-white rounded-3xl p-6 sm:p-8 border border-slate-200 shadow-sm space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-3">
          <div>
            <div className="inline-flex items-center gap-1.5 text-xs font-extrabold uppercase tracking-wider text-indigo-600">
              <BookOpen className="w-4 h-4" />
              Interactive Lesson Curriculum
            </div>
            <h3 className="text-lg font-black text-slate-900 mt-0.5">
              Available Lessons for {category.title}
            </h3>
          </div>
          <span className="text-xs font-bold text-slate-500">
            {matchingLessons.length} Interactive Lessons
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {matchingLessons.map(lesson => (
            <div
              key={lesson.id}
              className="p-5 rounded-2xl bg-slate-50 border border-slate-200 hover:bg-white hover:shadow-xs transition flex flex-col justify-between"
            >
              <div>
                <div className="flex items-center justify-between text-xs font-bold mb-2">
                  <span className="text-indigo-600 uppercase tracking-wider text-[10px]">
                    {lesson.topic}
                  </span>
                  <span className="px-2 py-0.5 rounded-full bg-white border border-slate-200 text-slate-600">
                    Lvl {lesson.difficultyLevel}
                  </span>
                </div>

                <h4 className="text-sm font-extrabold text-slate-900">
                  {lesson.title}
                </h4>

                <p className="text-xs text-slate-500 mt-1 leading-relaxed">
                  {lesson.description}
                </p>
              </div>

              <div className="mt-4 pt-3 border-t border-slate-200/80 flex items-center justify-between">
                <div className="flex items-center gap-3 text-xs font-semibold text-slate-500">
                  <span className="flex items-center gap-1">
                    <Clock className="w-3.5 h-3.5" />
                    {lesson.estimatedMinutes}m
                  </span>
                  <span className="text-amber-600 font-bold">+{lesson.xpReward} XP</span>
                </div>

                <button
                  onClick={() => onSelectLesson(lesson)}
                  className="px-3.5 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold transition flex items-center gap-1 cursor-pointer shadow-xs"
                >
                  <Play className="w-3 h-3 fill-white" />
                  <span>Launch Lesson</span>
                </button>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ===== FOOTER BANNER ===== */}
      <section className="rounded-3xl bg-slate-900 text-white p-8 sm:p-10 flex flex-col sm:flex-row items-center justify-between gap-6 shadow-lg">
        <div className="space-y-1 text-center sm:text-left">
          <h3 className="text-xl sm:text-2xl font-black tracking-tight">
            Ready to Accelerate in {category.title}?
          </h3>
          <p className="text-xs sm:text-sm text-slate-400 max-w-xl">
            Launch your personalized dashboard with adaptive problem sets calibrated to {category.ageRange}.
          </p>
        </div>

        <button
          onClick={() => onStartLearning(currentTier)}
          className="px-6 py-3 rounded-2xl bg-indigo-600 hover:bg-indigo-500 text-white font-extrabold text-xs transition shadow-md cursor-pointer shrink-0"
        >
          Enter Dashboard ({category.ageRange})
        </button>
      </section>
    </div>
  );
};
