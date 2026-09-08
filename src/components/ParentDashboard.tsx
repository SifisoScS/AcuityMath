import React, { useState } from 'react';
import { UserProfile, ParentAnalytics } from '../types';
import {
  Clock,
  Target,
  Sparkles,
  TrendingUp,
  Sliders,
  Printer,
  ChevronDown,
  CheckCircle2,
  Calendar,
  ShieldCheck
} from 'lucide-react';
import { playClickSound, playSuccessSound } from '../utils/audio';

interface ParentDashboardProps {
  students: UserProfile[];
  analyticsMap: Record<string, ParentAnalytics>;
  onUpdateScreenTime: (studentId: string, minutes: number) => void;
  onOpenCoppaModal?: () => void;
}

export const ParentDashboard: React.FC<ParentDashboardProps> = ({
  students,
  analyticsMap,
  onUpdateScreenTime,
  onOpenCoppaModal
}) => {
  const [selectedStudentId, setSelectedStudentId] = useState<string>(students[0]?.id || 'user-maya');
  const [showPrintReport, setShowPrintReport] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const currentStudent = students.find(s => s.id === selectedStudentId) || students[0];
  const analytics = analyticsMap[selectedStudentId] || analyticsMap['user-maya'];

  const [screenLimit, setScreenLimit] = useState(analytics?.screenTimeLimitMinutes || 45);

  const handleSaveScreenLimit = () => {
    onUpdateScreenTime(selectedStudentId, screenLimit);
    playSuccessSound();
    setToastMessage(`Screen time limit updated to ${screenLimit} mins/day for ${currentStudent.name}!`);
    setTimeout(() => setToastMessage(null), 3500);
  };

  return (
    <div className="space-y-6">
      {/* Toast */}
      {toastMessage && (
        <div className="p-3 bg-emerald-600 text-white rounded-xl text-sm font-bold shadow-lg flex items-center justify-between animate-in fade-in">
          <span>{toastMessage}</span>
          <button onClick={() => setToastMessage(null)} className="text-emerald-100 hover:text-white">✕</button>
        </div>
      )}

      {/* Top Banner & Student Selector */}
      <div className="bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 text-white rounded-3xl p-6 sm:p-8 shadow-xl border border-slate-800 flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div>
          <div className="flex items-center gap-2 text-xs uppercase font-bold text-indigo-400 tracking-wider mb-2">
            <TrendingUp className="w-4 h-4" />
            Parent Real-Time Analytics & Oversight
          </div>
          <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight">
            Family Learning Command Center
          </h1>
          <p className="text-xs sm:text-sm text-slate-300 mt-1 max-w-xl leading-relaxed">
            Monitor mastery velocity, screen time boundaries, and adaptive skill progression across your children.
          </p>
        </div>

        {/* Action Controls & Student Switcher */}
        <div className="flex flex-wrap items-center gap-2.5 self-start md:self-auto">
          {onOpenCoppaModal && (
            <button
              onClick={() => {
                playClickSound();
                onOpenCoppaModal();
              }}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-emerald-950/80 hover:bg-emerald-900/90 text-emerald-300 border border-emerald-600/50 text-xs font-bold transition cursor-pointer shadow-xs"
              title="Manage Verifiable Parental Consent & Child Data Safeguards"
            >
              <ShieldCheck className="w-4 h-4 text-emerald-400" />
              <span>COPPA & Privacy (VPC)</span>
            </button>
          )}

          {/* Student Switcher pill */}
          <div className="flex items-center gap-3 bg-slate-800/90 p-2 rounded-2xl border border-slate-700/80">
            <span className="text-xs font-semibold text-slate-400 pl-2">Child:</span>
            <div className="relative">
              <select
                value={selectedStudentId}
                onChange={e => {
                  playClickSound();
                  setSelectedStudentId(e.target.value);
                  const s = analyticsMap[e.target.value];
                  if (s) setScreenLimit(s.screenTimeLimitMinutes);
                }}
                className="appearance-none bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-sm py-2 pl-4 pr-9 rounded-xl border border-indigo-400 cursor-pointer transition focus:outline-none"
              >
                {students.map(s => (
                  <option key={s.id} value={s.id}>
                    {s.avatar} {s.name} (Age {s.age})
                  </option>
                ))}
              </select>
              <ChevronDown className="w-4 h-4 text-white absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            </div>
          </div>
        </div>
      </div>

      {/* Primary KPI Metric Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white p-5 rounded-3xl border border-slate-200 shadow-sm flex items-start justify-between">
          <div>
            <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Weekly Time Spent</span>
            <div className="text-2xl font-extrabold text-slate-900 mt-1 flex items-baseline gap-1.5">
              <span>{analytics.totalTimeMinutes}</span>
              <span className="text-xs font-medium text-slate-500">minutes</span>
            </div>
            <span className="text-[11px] font-semibold text-emerald-600 flex items-center gap-1 mt-2">
              <TrendingUp className="w-3.5 h-3.5" /> +18% vs last week
            </span>
          </div>
          <div className="w-12 h-12 rounded-2xl bg-indigo-50 text-indigo-600 flex items-center justify-center">
            <Clock className="w-6 h-6" />
          </div>
        </div>

        <div className="bg-white p-5 rounded-3xl border border-slate-200 shadow-sm flex items-start justify-between">
          <div>
            <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Accuracy Velocity</span>
            <div className="text-2xl font-extrabold text-slate-900 mt-1">
              {currentStudent.accuracyRate}%
            </div>
            <span className="text-[11px] font-semibold text-emerald-600 flex items-center gap-1 mt-2">
              <CheckCircle2 className="w-3.5 h-3.5" /> High retention
            </span>
          </div>
          <div className="w-12 h-12 rounded-2xl bg-emerald-50 text-emerald-600 flex items-center justify-center">
            <Target className="w-6 h-6" />
          </div>
        </div>

        <div className="bg-white p-5 rounded-3xl border border-slate-200 shadow-sm flex items-start justify-between">
          <div>
            <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Dynamic Level</span>
            <div className="text-2xl font-extrabold text-indigo-600 mt-1 flex items-baseline gap-2">
              <span>Lvl {currentStudent.dynamicLevel}</span>
              <span className="text-xs font-mono text-slate-400">{currentStudent.eloRating} ELO</span>
            </div>
            <span className="text-[11px] font-semibold text-slate-500 mt-2 block">
              Tier: <span className="capitalize font-bold text-slate-700">{currentStudent.tier}</span>
            </span>
          </div>
          <div className="w-12 h-12 rounded-2xl bg-purple-50 text-purple-600 flex items-center justify-center">
            <Sparkles className="w-6 h-6" />
          </div>
        </div>

        <div className="bg-white p-5 rounded-3xl border border-slate-200 shadow-sm flex items-start justify-between">
          <div>
            <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Daily Screen Limit</span>
            <div className="text-2xl font-extrabold text-slate-900 mt-1 flex items-baseline gap-1.5">
              <span>{screenLimit}</span>
              <span className="text-xs font-medium text-slate-500">mins/day</span>
            </div>
            <span className="text-[11px] font-semibold text-sky-600 flex items-center gap-1 mt-2">
              <Sliders className="w-3.5 h-3.5" /> Automated pause
            </span>
          </div>
          <div className="w-12 h-12 rounded-2xl bg-sky-50 text-sky-600 flex items-center justify-center">
            <Sliders className="w-6 h-6" />
          </div>
        </div>
      </div>

      {/* Middle Layout: Weekly Activity Graph + Mastery Radar */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Weekly Activity Bar Chart */}
        <div className="lg:col-span-7 bg-white p-6 rounded-3xl border border-slate-200 shadow-sm flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="text-base font-bold text-slate-800 flex items-center gap-2">
                  <Calendar className="w-4 h-4 text-indigo-600" />
                  Weekly Learning Engagement
                </h3>
                <p className="text-xs text-slate-500">Minutes practiced per day for {currentStudent.name}</p>
              </div>
              <button
                onClick={() => setShowPrintReport(true)}
                className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold flex items-center gap-1.5 transition cursor-pointer border border-slate-200"
              >
                <Printer className="w-3.5 h-3.5" />
                <span>Export Report Card</span>
              </button>
            </div>

            {/* Custom SVG Bar Chart */}
            <div className="h-44 flex items-end justify-between gap-2 pt-6 px-2">
              {analytics.weeklyActivity.map((dayData, idx) => {
                const maxMins = 80;
                const barHeightPct = Math.min(100, Math.round((dayData.minutes / maxMins) * 100));

                return (
                  <div key={idx} className="flex-1 flex flex-col items-center gap-2 h-full justify-end">
                    <span className="text-[10px] font-bold text-slate-500 font-mono">
                      {dayData.minutes}m
                    </span>
                    <div className="w-full max-w-[36px] bg-slate-100 rounded-xl h-full flex items-end overflow-hidden">
                      <div
                        className="w-full bg-gradient-to-t from-indigo-600 to-sky-400 rounded-xl transition-all duration-500 hover:brightness-110"
                        style={{ height: `${barHeightPct}%` }}
                        title={`${dayData.day}: ${dayData.minutes} mins (${dayData.accuracy}% accuracy)`}
                      />
                    </div>
                    <span className="text-xs font-bold text-slate-600">{dayData.day}</span>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="mt-4 pt-4 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500">
            <span>Daily average: <strong>{Math.round(analytics.totalTimeMinutes / 7)} mins/day</strong></span>
            <span>Completed questions this week: <strong>{analytics.weeklyActivity.reduce((acc, d) => acc + d.problemsSolved, 0)}</strong></span>
          </div>
        </div>

        {/* Concept Mastery Breakdown */}
        <div className="lg:col-span-5 bg-white p-6 rounded-3xl border border-slate-200 shadow-sm flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-base font-bold text-slate-800">Curriculum Mastery Breakdown</h3>
              <span className="text-xs bg-indigo-50 text-indigo-700 px-2 py-0.5 rounded-full font-bold">
                Adaptive
              </span>
            </div>
            <p className="text-xs text-slate-500 mb-4">Competency score across key mathematical domains</p>

            <div className="space-y-3.5">
              {analytics.masteryDomains.map((dom, i) => (
                <div key={i} className="space-y-1.5">
                  <div className="flex justify-between text-xs font-semibold">
                    <span className="text-slate-800">{dom.domain}</span>
                    <div className="flex items-center gap-2">
                      <span className="text-[11px] font-bold text-slate-400">{dom.level}</span>
                      <span className="font-mono font-bold text-slate-900">{dom.score}%</span>
                    </div>
                  </div>
                  <div className="w-full bg-slate-100 h-2.5 rounded-full overflow-hidden">
                    <div
                      className={`h-full ${dom.color} rounded-full transition-all duration-500`}
                      style={{ width: `${dom.score}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Action recommendation */}
          <div className="mt-5 p-3.5 bg-amber-50/80 border border-amber-200 rounded-2xl text-xs text-amber-950 flex items-start gap-2.5">
            <Sparkles className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
            <div>
              <span className="font-bold">Next Recommended Action: </span>
              <span>{analytics.recommendedAction}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Screen Time Boundaries & Growth Opportunities */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Screen Time Controls */}
        <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm">
          <div className="flex items-center gap-2 text-sm font-bold text-slate-800 mb-1">
            <Sliders className="w-4 h-4 text-indigo-600" />
            <span>Parental Screen Time Boundary</span>
          </div>
          <p className="text-xs text-slate-500 mb-4">
            Automatically lock or encourage breaks once daily learning time limit is achieved.
          </p>

          <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200 space-y-4">
            <div className="flex justify-between items-center">
              <span className="text-sm font-semibold text-slate-700">Daily Target Limit:</span>
              <span className="text-lg font-extrabold text-indigo-600 font-mono">{screenLimit} Minutes</span>
            </div>

            <input
              type="range"
              min="15"
              max="120"
              step="5"
              value={screenLimit}
              onChange={e => setScreenLimit(Number(e.target.value))}
              className="w-full accent-indigo-600 cursor-pointer"
            />

            <div className="flex justify-between text-[10px] text-slate-400 font-bold">
              <span>15 min (Gentle)</span>
              <span>45 min (Recommended)</span>
              <span>120 min (Advanced)</span>
            </div>

            <button
              onClick={handleSaveScreenLimit}
              className="w-full py-2.5 bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold rounded-xl transition cursor-pointer"
            >
              Update Limit for {currentStudent.name}
            </button>
          </div>
        </div>

        {/* Strengths & Targeted Growth Areas */}
        <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm flex flex-col justify-between">
          <div>
            <h3 className="text-sm font-bold text-slate-800 mb-1">Cognitive Strengths & Focus Points</h3>
            <p className="text-xs text-slate-500 mb-4">AI Diagnostic evaluation from recent problem sets</p>

            <div className="space-y-3">
              <div>
                <span className="text-xs font-bold text-emerald-800 uppercase tracking-wider block mb-1.5">
                  🌟 Demonstrated Strengths
                </span>
                <div className="flex flex-wrap gap-1.5">
                  {analytics.strengths.map((str, idx) => (
                    <span
                      key={idx}
                      className="px-2.5 py-1 bg-emerald-50 text-emerald-800 border border-emerald-200 text-xs font-semibold rounded-lg"
                    >
                      {str}
                    </span>
                  ))}
                </div>
              </div>

              <div className="pt-2">
                <span className="text-xs font-bold text-amber-800 uppercase tracking-wider block mb-1.5">
                  🎯 Focus Areas for Growth
                </span>
                <div className="flex flex-wrap gap-1.5">
                  {analytics.areasToImprove.map((area, idx) => (
                    <span
                      key={idx}
                      className="px-2.5 py-1 bg-amber-50 text-amber-900 border border-amber-200 text-xs font-semibold rounded-lg"
                    >
                      {area}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Printable Report Card Modal */}
      {showPrintReport && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/80 backdrop-blur-sm p-4">
          <div className="bg-white rounded-3xl p-6 sm:p-8 max-w-lg w-full shadow-2xl border border-slate-200 space-y-4">
            <div className="flex justify-between items-start border-b border-slate-200 pb-3">
              <div>
                <h3 className="text-lg font-extrabold text-slate-900">AcuityMath Weekly Progress Card</h3>
                <p className="text-xs text-slate-500">Student: {currentStudent.name} (Age {currentStudent.age})</p>
              </div>
              <button
                onClick={() => setShowPrintReport(false)}
                className="text-slate-400 hover:text-slate-600 font-bold"
              >
                ✕
              </button>
            </div>

            <div className="space-y-3 text-xs text-slate-700">
              <div className="flex justify-between py-1 border-b border-slate-100">
                <span className="font-semibold">Current Math Tier:</span>
                <span className="capitalize font-bold text-indigo-600">{currentStudent.tier}</span>
              </div>
              <div className="flex justify-between py-1 border-b border-slate-100">
                <span className="font-semibold">Dynamic Adaptive Rating:</span>
                <span className="font-bold">Level {currentStudent.dynamicLevel} ({currentStudent.eloRating} ELO)</span>
              </div>
              <div className="flex justify-between py-1 border-b border-slate-100">
                <span className="font-semibold">Weekly Study Time:</span>
                <span className="font-bold">{analytics.totalTimeMinutes} minutes</span>
              </div>
              <div className="flex justify-between py-1 border-b border-slate-100">
                <span className="font-semibold">Problem Accuracy:</span>
                <span className="font-bold text-emerald-600">{currentStudent.accuracyRate}%</span>
              </div>
              <div className="flex justify-between py-1 border-b border-slate-100">
                <span className="font-semibold">Daily Active Streak:</span>
                <span className="font-bold text-amber-600">{currentStudent.streakDays} Days 🔥</span>
              </div>
            </div>

            <div className="p-3 bg-slate-50 rounded-xl text-xs text-slate-600">
              <span className="font-bold">Instructor Assessment: </span>
              <span>{analytics.recommendedAction}</span>
            </div>

            <div className="flex gap-2 pt-2">
              <button
                onClick={() => {
                  window.print();
                }}
                className="flex-1 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs rounded-xl shadow-md transition cursor-pointer flex items-center justify-center gap-1.5"
              >
                <Printer className="w-3.5 h-3.5" />
                <span>Print Official Summary</span>
              </button>
              <button
                onClick={() => setShowPrintReport(false)}
                className="py-2.5 px-4 bg-slate-200 hover:bg-slate-300 text-slate-700 font-bold text-xs rounded-xl transition cursor-pointer"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
