import React, { useState } from 'react';
import { MathLesson, AgeTier } from '../types';
import { AGE_TIER_META } from '../data/curriculumData';
import {
  Sparkles,
  Clock,
  Target,
  Award,
  Play,
  Search,
  Filter,
  Layers,
  ArrowRight,
  BookOpen
} from 'lucide-react';
import { playClickSound } from '../utils/audio';

interface CurriculumViewProps {
  lessons: MathLesson[];
  onSelectLesson: (lesson: MathLesson) => void;
  currentStudentTier: AgeTier;
}

export const CurriculumView: React.FC<CurriculumViewProps> = ({
  lessons,
  onSelectLesson,
  currentStudentTier
}) => {
  const [selectedTier, setSelectedTier] = useState<AgeTier | 'all'>(currentStudentTier);
  const [searchQuery, setSearchQuery] = useState('');

  const tiers: { id: AgeTier | 'all'; label: string; ageRange: string }[] = [
    { id: 'all', label: 'All Curricula', ageRange: 'Ages 3–18' },
    { id: 'early', label: 'Early Sprouts', ageRange: '3–6' },
    { id: 'elementary', label: 'Math Navigators', ageRange: '7–10' },
    { id: 'middle', label: 'Algebra Voyagers', ageRange: '11–14' },
    { id: 'high', label: 'STEM Pioneers', ageRange: '15–18' }
  ];

  const filteredLessons = lessons.filter(lesson => {
    const matchesTier = selectedTier === 'all' || lesson.tier === selectedTier;
    const matchesQuery =
      lesson.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      lesson.topic.toLowerCase().includes(searchQuery.toLowerCase()) ||
      lesson.description.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesTier && matchesQuery;
  });

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 text-white rounded-3xl p-6 sm:p-8 shadow-xl border border-slate-800">
        <div className="max-w-2xl space-y-2">
          <div className="flex items-center gap-2 text-xs uppercase font-bold text-indigo-400 tracking-wider">
            <BookOpen className="w-4 h-4" />
            Comprehensive K–12 Math Curriculum
          </div>
          <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight">
            Curriculum Explorer Across All Four Stages
          </h1>
          <p className="text-xs sm:text-sm text-slate-300 leading-relaxed">
            From preschool sensory counting to university-level differential calculus, inspect lessons and launch interactive manipulatives at any stage.
          </p>
        </div>

        {/* Tier switcher pills */}
        <div className="flex flex-wrap gap-2 mt-6 pt-4 border-t border-slate-800">
          {tiers.map(t => (
            <button
              key={t.id}
              onClick={() => {
                playClickSound();
                setSelectedTier(t.id);
              }}
              className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition flex items-center gap-1.5 cursor-pointer border ${
                selectedTier === t.id
                  ? 'bg-indigo-600 text-white border-indigo-400 shadow-sm'
                  : 'bg-slate-800/80 text-slate-300 border-slate-700 hover:bg-slate-800 hover:text-white'
              }`}
            >
              <span>{t.label}</span>
              <span className="text-[10px] opacity-75 font-normal">({t.ageRange})</span>
            </button>
          ))}
        </div>
      </div>

      {/* Search and Filters Bar */}
      <div className="bg-white rounded-2xl p-4 border border-slate-200 shadow-sm flex flex-col sm:flex-row items-center justify-between gap-3">
        <div className="relative w-full sm:w-80">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Search lessons, topics, or formulas..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium focus:ring-2 focus:ring-indigo-500 focus:outline-none"
          />
        </div>

        <div className="text-xs font-semibold text-slate-500 flex items-center gap-1 self-end sm:self-center">
          <Layers className="w-4 h-4 text-indigo-600" />
          <span>Showing <strong>{filteredLessons.length}</strong> learning modules</span>
        </div>
      </div>

      {/* Lesson Modules Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
        {filteredLessons.map(lesson => {
          const tierMeta = AGE_TIER_META[lesson.tier];

          return (
            <div
              key={lesson.id}
              className="bg-white rounded-3xl border border-slate-200 p-5 shadow-sm hover:shadow-md hover:border-indigo-300 transition-all flex flex-col justify-between group"
            >
              <div>
                {/* Header badges */}
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-1.5">
                    <span className="text-base">{tierMeta.icon}</span>
                    <span className="text-[10px] font-extrabold uppercase tracking-wider px-2 py-0.5 rounded-full bg-slate-100 text-slate-700">
                      {lesson.topic}
                    </span>
                  </div>
                  <div className="flex items-center gap-1 text-xs font-extrabold text-amber-600">
                    <Sparkles className="w-3.5 h-3.5" />
                    <span>+{lesson.xpReward} XP</span>
                  </div>
                </div>

                <div className="text-[11px] font-bold text-indigo-600 mb-1">
                  {tierMeta.label} • {lesson.recommendedAge}
                </div>

                <h3 className="text-base font-bold text-slate-900 group-hover:text-indigo-600 transition leading-snug">
                  {lesson.title}
                </h3>
                <p className="text-xs text-slate-500 mt-1.5 leading-relaxed line-clamp-2">
                  {lesson.description}
                </p>

                {/* Lesson metadata badges */}
                <div className="flex items-center gap-3 text-xs text-slate-500 mt-4 pt-3 border-t border-slate-100">
                  <span className="flex items-center gap-1">
                    <Clock className="w-3.5 h-3.5" /> {lesson.estimatedMinutes}m
                  </span>
                  <span>•</span>
                  <span className="flex items-center gap-1">
                    <Target className="w-3.5 h-3.5" /> {lesson.problems.length} problems
                  </span>
                  <span>•</span>
                  <span className="flex items-center gap-1 font-bold text-yellow-600">
                    <Award className="w-3.5 h-3.5" /> +{lesson.coinReward} Coins
                  </span>
                </div>
              </div>

              {/* Action Button */}
              <button
                onClick={() => {
                  playClickSound();
                  onSelectLesson(lesson);
                }}
                className="mt-5 w-full py-2.5 rounded-xl bg-slate-900 hover:bg-indigo-600 text-white text-xs font-bold transition flex items-center justify-center gap-1.5 shadow-xs cursor-pointer group-hover:shadow-md group-hover:shadow-indigo-200"
              >
                <Play className="w-3.5 h-3.5 fill-white" />
                <span>Launch Interactive Lesson</span>
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
};
