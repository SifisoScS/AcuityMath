import React, { useState } from 'react';
import {
  Sparkles,
  Volume2,
  VolumeX,
  CheckCircle2,
  Calendar,
  BookOpen,
  Award,
  Music,
  HeartHandshake,
  RotateCcw,
  Play,
  Check,
  Star
} from 'lucide-react';
import {
  AGE_3_YEARLY_SESSIONS,
  Age3SessionData,
  Age3SessionUnit
} from '../data/age3YearlyContent';
import {
  playClickSound,
  playSuccessSound,
  playErrorSound,
  playLevelUpFanfare,
  speakText,
  stopSpeaking
} from '../utils/audio';

interface Age3YearlyCurriculumProps {
  onStartLesson?: () => void;
}

export const Age3YearlyCurriculum: React.FC<Age3YearlyCurriculumProps> = ({
  onStartLesson
}) => {
  const [activeSessionNumber, setActiveSessionNumber] = useState<1 | 2 | 3 | 4>(1);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [activeUnitId, setActiveUnitId] = useState<string>('s1-u1');

  // Challenge state
  const [selectedOption, setSelectedOption] = useState<number | null>(null);
  const [hasSubmitted, setHasSubmitted] = useState(false);
  const [showHint, setShowHint] = useState(false);

  // Completed sessions tracking
  const [completedSessions, setCompletedSessions] = useState<number[]>([1]);

  // Interactive Mini-Games States
  // Session 1: Apples picker
  const [pickedApples, setPickedApples] = useState<number[]>([]);
  // Session 2: Shapes sorted
  const [sortedCircles, setSortedCircles] = useState<number>(0);
  const [sortedSquares, setSortedSquares] = useState<number>(0);
  // Session 3: Pattern sequence
  const [patternItems, setPatternItems] = useState<('pink' | 'yellow')[]>(['pink', 'yellow', 'pink']);
  const [patternSolved, setPatternSolved] = useState(false);
  // Session 4: High Five Stars
  const [collectedStars, setCollectedStars] = useState<number[]>([]);

  const session: Age3SessionData =
    AGE_3_YEARLY_SESSIONS.find(s => s.sessionNumber === activeSessionNumber) ||
    AGE_3_YEARLY_SESSIONS[0];

  const handleSelectSession = (num: 1 | 2 | 3 | 4) => {
    stopSpeaking();
    setIsSpeaking(false);
    playClickSound();
    setActiveSessionNumber(num);
    const target = AGE_3_YEARLY_SESSIONS.find(s => s.sessionNumber === num);
    if (target && target.units.length > 0) {
      setActiveUnitId(target.units[0].id);
    }
    // reset challenge
    setSelectedOption(null);
    setHasSubmitted(false);
    setShowHint(false);
  };

  // Speak session overview
  const handleSpeakOverview = () => {
    if (isSpeaking) {
      stopSpeaking();
      setIsSpeaking(false);
      return;
    }
    playClickSound();
    setIsSpeaking(true);
    const textToSpeak = `${session.termTitle}. ${session.subtitle}. Cognitive Milestone: ${session.cognitiveMilestone}`;
    speakText(textToSpeak, () => setIsSpeaking(false));
  };

  // Speak nursery song
  const handleSingSong = () => {
    playClickSound();
    stopSpeaking();
    setIsSpeaking(true);
    const songText = `${session.rhymeSong.title}. ${session.rhymeSong.lyrics.join(' ')}`;
    speakText(songText, () => setIsSpeaking(false));
  };

  // Challenge selection
  const handleAnswerChallenge = (index: number) => {
    playClickSound();
    setSelectedOption(index);
    setHasSubmitted(true);
    if (index === session.quickChallenge.correctIndex) {
      playSuccessSound();
      speakText(session.quickChallenge.explanation);
      if (!completedSessions.includes(activeSessionNumber)) {
        setCompletedSessions(prev => [...prev, activeSessionNumber]);
        playLevelUpFanfare();
      }
    } else {
      playErrorSound();
    }
  };

  const handleResetChallenge = () => {
    playClickSound();
    setSelectedOption(null);
    setHasSubmitted(false);
    setShowHint(false);
  };

  // Mini-Game 1: Apple Picker
  const handleToggleApple = (appleId: number) => {
    playClickSound();
    setPickedApples(prev => {
      let updated: number[];
      if (prev.includes(appleId)) {
        updated = prev.filter(id => id !== appleId);
      } else {
        updated = [...prev, appleId];
      }
      if (updated.length === 1) {
        speakText('One apple in the basket!');
      } else if (updated.length === 2) {
        playSuccessSound();
        speakText('Two apples in the basket! One, two! Wonderful!');
      }
      return updated;
    });
  };

  // Mini-Game 2: Shape Sorter
  const handleAddCircle = () => {
    playClickSound();
    if (sortedCircles < 3) {
      const next = sortedCircles + 1;
      setSortedCircles(next);
      speakText(`Circle ${next}! Round like a ball!`);
      if (next === 3) playSuccessSound();
    }
  };

  const handleAddSquare = () => {
    playClickSound();
    if (sortedSquares < 3) {
      const next = sortedSquares + 1;
      setSortedSquares(next);
      speakText(`Square ${next}! Flat sides and corners!`);
      if (next === 3) playSuccessSound();
    }
  };

  // Mini-Game 3: Pattern Maker
  const handleChoosePatternItem = (color: 'pink' | 'yellow') => {
    playClickSound();
    if (patternSolved) return;
    if (color === 'yellow') {
      setPatternItems(prev => [...prev, 'yellow']);
      setPatternSolved(true);
      playSuccessSound();
      speakText('Hooray! Pink, Yellow, Pink, Yellow! Pattern completed!');
    } else {
      playErrorSound();
      speakText('Try again! Look at the pattern: Pink, then Yellow!');
    }
  };

  const handleResetPattern = () => {
    playClickSound();
    setPatternItems(['pink', 'yellow', 'pink']);
    setPatternSolved(false);
  };

  // Mini-Game 4: High Five Stars
  const handleTapStar = (starNum: number) => {
    playClickSound();
    if (!collectedStars.includes(starNum)) {
      const next = [...collectedStars, starNum];
      setCollectedStars(next);
      speakText(`Star ${starNum}!`);
      if (next.length === 5) {
        playLevelUpFanfare();
        speakText('High Five! You caught all 5 shining stars! 1, 2, 3, 4, 5!');
      }
    }
  };

  const handleResetStars = () => {
    playClickSound();
    setCollectedStars([]);
  };

  return (
    <div className="space-y-8" id="age3-yearly-curriculum">
      {/* ==================================================== */}
      {/* TITLE & YEAR OVERVIEW BANNER                        */}
      {/* ==================================================== */}
      <div className="bg-gradient-to-r from-amber-500/10 via-orange-500/5 to-amber-500/10 p-6 sm:p-8 rounded-3xl border border-amber-200 shadow-sm relative overflow-hidden">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 relative z-10">
          <div className="space-y-2 max-w-2xl">
            <div className="inline-flex items-center gap-2 px-3.5 py-1 rounded-full bg-amber-100 border border-amber-300 text-amber-900 text-xs font-black uppercase tracking-wider">
              <span>🌱</span>
              <span>Preschool Age 3 · 4-Session Yearly Curriculum</span>
            </div>
            <h2 className="text-2xl sm:text-3xl font-black text-slate-900 tracking-tight">
              A Full Year of Early Mathematical Wonders
            </h2>
            <p className="text-sm text-slate-600 leading-relaxed">
              Structured into <strong>4 progressive seasonal sessions</strong> spanning the entire 48-week developmental year. Designed around sensory touch, auditory speech repetition, cheerful rhymes, and zero-penalty positive reinforcement.
            </p>
          </div>

          <div className="bg-white p-4 rounded-2xl border border-amber-200 shadow-xs flex flex-col gap-2 shrink-0">
            <div className="flex items-center justify-between gap-4 text-xs font-bold text-slate-500">
              <span>Yearly Progress:</span>
              <span className="text-amber-700 font-extrabold">{completedSessions.length} of 4 Sessions</span>
            </div>
            <div className="w-full bg-slate-100 rounded-full h-2.5 overflow-hidden">
              <div
                className="bg-amber-500 h-full rounded-full transition-all duration-500"
                style={{ width: `${(completedSessions.length / 4) * 100}%` }}
              />
            </div>
            <div className="flex items-center gap-1.5 pt-1">
              {[1, 2, 3, 4].map(sNum => (
                <div
                  key={sNum}
                  className={`w-7 h-7 rounded-lg flex items-center justify-center text-xs font-black transition ${
                    completedSessions.includes(sNum)
                      ? 'bg-amber-500 text-white shadow-xs'
                      : 'bg-slate-100 text-slate-400'
                  }`}
                  title={`Session ${sNum} ${completedSessions.includes(sNum) ? 'Completed' : 'Pending'}`}
                >
                  {completedSessions.includes(sNum) ? '★' : sNum}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* ==================================================== */}
      {/* 4-SESSION SELECTOR TABS                             */}
      {/* ==================================================== */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        {AGE_3_YEARLY_SESSIONS.map(s => {
          const isActive = s.sessionNumber === activeSessionNumber;
          const isDone = completedSessions.includes(s.sessionNumber);

          return (
            <button
              key={s.sessionNumber}
              onClick={() => handleSelectSession(s.sessionNumber)}
              className={`p-4 rounded-2xl border text-left transition relative cursor-pointer flex flex-col justify-between gap-3 ${
                isActive
                  ? `${s.colorTheme.light} ${s.colorTheme.border} ring-2 ring-indigo-500 shadow-sm`
                  : 'bg-white border-slate-200 hover:border-slate-300 hover:bg-slate-50/50 shadow-2xs'
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="text-2xl">{s.icon}</span>
                <div className="flex items-center gap-1">
                  {isDone && (
                    <span className="px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 text-[10px] font-black flex items-center gap-0.5">
                      <Check className="w-3 h-3" />
                      Done
                    </span>
                  )}
                  <span className={`text-[10px] font-extrabold uppercase px-2 py-0.5 rounded-md ${s.colorTheme.badge}`}>
                    {s.season}
                  </span>
                </div>
              </div>

              <div>
                <div className="text-[11px] font-extrabold uppercase tracking-wider text-slate-400">
                  Session {s.sessionNumber} · {s.duration.split(' ')[0]}
                </div>
                <h3 className="text-sm font-black text-slate-900 line-clamp-1 mt-0.5">
                  {s.termTitle.replace(`Session ${s.sessionNumber}: `, '')}
                </h3>
                <p className="text-xs text-slate-500 line-clamp-2 mt-1 font-medium">
                  {s.subtitle}
                </p>
              </div>

              <div className="pt-2 border-t border-slate-100 flex items-center justify-between text-[11px] font-bold">
                <span className={isActive ? s.colorTheme.accent : 'text-slate-500'}>
                  {s.units.length} Core Units
                </span>
                <span className="text-slate-400">→</span>
              </div>
            </button>
          );
        })}
      </div>

      {/* ==================================================== */}
      {/* ACTIVE SESSION DETAILS HEADER                       */}
      {/* ==================================================== */}
      <section className={`rounded-3xl p-6 sm:p-8 border shadow-sm ${session.colorTheme.light} ${session.colorTheme.border}`}>
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
          <div className="space-y-3 max-w-3xl">
            <div className="flex flex-wrap items-center gap-2">
              <span className={`text-xs font-black px-3 py-1 rounded-full border ${session.colorTheme.badge} flex items-center gap-1.5`}>
                <span>{session.icon}</span>
                <span>{session.termTitle}</span>
              </span>
              <span className="text-xs font-bold px-3 py-1 rounded-full bg-white border border-slate-200 text-slate-700 flex items-center gap-1">
                <Calendar className="w-3.5 h-3.5 text-indigo-500" />
                {session.duration}
              </span>
            </div>

            <h3 className="text-2xl sm:text-3xl font-black text-slate-900 tracking-tight">
              {session.subtitle}
            </h3>

            <div className="p-4 bg-white/90 backdrop-blur-sm rounded-2xl border border-slate-200/80 text-xs text-slate-700 leading-relaxed">
              <strong className="text-slate-900 block mb-1">🧠 Developmental Cognitive Focus:</strong>
              {session.cognitiveMilestone}
            </div>
          </div>

          {/* Quick Action Controls */}
          <div className="flex flex-col gap-2 shrink-0 sm:w-64">
            <button
              onClick={handleSpeakOverview}
              className="w-full py-2.5 px-4 rounded-xl bg-white hover:bg-slate-50 text-slate-800 text-xs font-bold transition flex items-center justify-center gap-2 border border-slate-200 shadow-xs cursor-pointer"
            >
              {isSpeaking ? (
                <>
                  <VolumeX className="w-4 h-4 text-rose-500 animate-pulse" />
                  <span>Stop Audio</span>
                </>
              ) : (
                <>
                  <Volume2 className="w-4 h-4 text-indigo-600" />
                  <span>Listen to Session</span>
                </>
              )}
            </button>

            {onStartLesson && (
              <button
                onClick={onStartLesson}
                className="w-full py-2.5 px-4 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-black transition flex items-center justify-center gap-2 shadow-xs cursor-pointer"
              >
                <Play className="w-4 h-4 fill-current" />
                <span>Launch Interactive Lesson</span>
              </button>
            )}
          </div>
        </div>
      </section>

      {/* ==================================================== */}
      {/* CORE OBJECTIVES CHECKLIST MATRIX                    */}
      {/* ==================================================== */}
      <div className="bg-white rounded-3xl p-6 border border-slate-200 shadow-sm space-y-4">
        <div className="flex items-center gap-2 text-xs font-extrabold uppercase tracking-wider text-indigo-600">
          <Award className="w-4 h-4" />
          Session {session.sessionNumber} Milestones
        </div>
        <h3 className="text-lg font-black text-slate-900">
          Target Fluencies for this 12-Week Period
        </h3>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
          {session.coreObjectives.map((obj, i) => (
            <div key={i} className="flex items-start gap-3 p-3.5 rounded-2xl bg-slate-50 border border-slate-200/80">
              <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" />
              <span className="text-xs font-bold text-slate-700">{obj}</span>
            </div>
          ))}
        </div>
      </div>

      {/* ==================================================== */}
      {/* 4 PROGRESSIVE UNITS FOR THIS SESSION                */}
      {/* ==================================================== */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <div className="flex items-center gap-2 text-xs font-extrabold uppercase tracking-wider text-indigo-600">
              <BookOpen className="w-4 h-4" />
              Session {session.sessionNumber} Roadmap
            </div>
            <h3 className="text-lg font-black text-slate-900 mt-0.5">
              4 Step-by-Step Toddler Units
            </h3>
          </div>
          <span className="text-xs text-slate-500 font-semibold">
            3 weeks per unit
          </span>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
          {session.units.map((unit: Age3SessionUnit, uIdx: number) => {
            const isUnitActive = unit.id === activeUnitId;

            return (
              <div
                key={unit.id}
                onClick={() => setActiveUnitId(unit.id)}
                className={`p-5 rounded-3xl border transition flex flex-col justify-between gap-4 cursor-pointer ${
                  isUnitActive
                    ? 'bg-white border-indigo-400 ring-2 ring-indigo-500/20 shadow-md'
                    : 'bg-white border-slate-200 hover:border-slate-300 hover:bg-slate-50/50 shadow-2xs'
                }`}
              >
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-extrabold uppercase px-2.5 py-1 rounded-full bg-slate-100 text-slate-600">
                      Unit {uIdx + 1} · {unit.weeks}
                    </span>
                    <span className="w-6 h-6 rounded-full bg-indigo-50 text-indigo-600 font-black text-xs flex items-center justify-center">
                      {uIdx + 1}
                    </span>
                  </div>

                  <div>
                    <h4 className="text-sm font-black text-slate-900 leading-tight">
                      {unit.title}
                    </h4>
                    <p className="text-xs text-slate-500 font-medium mt-1">
                      {unit.focus}
                    </p>
                  </div>

                  {/* Activities Checklist */}
                  <div className="space-y-1.5 pt-2 border-t border-slate-100">
                    <div className="text-[10px] font-extrabold uppercase tracking-wider text-slate-400">
                      Hands-On Play:
                    </div>
                    {unit.activities.map((act, aIdx) => (
                      <div key={aIdx} className="text-xs font-semibold text-slate-700 flex items-start gap-1.5">
                        <span className="text-indigo-500 font-bold">•</span>
                        <span>{act}</span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Vocabulary & Tip */}
                <div className="space-y-2 pt-2 border-t border-slate-100">
                  <div className="flex flex-wrap gap-1">
                    {unit.vocabulary.map((vocab, vIdx) => (
                      <span
                        key={vIdx}
                        className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-amber-50 text-amber-800 border border-amber-200"
                      >
                        {vocab}
                      </span>
                    ))}
                  </div>

                  <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-200 text-[11px] text-slate-600 leading-relaxed font-medium">
                    <strong className="text-slate-800 block text-[10px] uppercase font-black mb-0.5">
                      💡 Daily Math Routine:
                    </strong>
                    {unit.everydayMathTip}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* ==================================================== */}
      {/* PLAYABLE INTERACTIVE MINI-GAME FOR THIS SESSION     */}
      {/* ==================================================== */}
      <section className="bg-white rounded-3xl p-6 sm:p-8 border border-slate-200 shadow-sm space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-100 pb-4">
          <div className="space-y-1">
            <div className="inline-flex items-center gap-1.5 text-xs font-extrabold uppercase tracking-wider text-indigo-600">
              <Sparkles className="w-4 h-4 text-amber-500" />
              Session {session.sessionNumber} Interactive Playground
            </div>
            <h3 className="text-xl font-black text-slate-900">
              {session.handsOnGame.name}
            </h3>
            <p className="text-xs text-slate-500 font-medium">
              {session.handsOnGame.instructions}
            </p>
          </div>

          <button
            onClick={() => speakText(session.handsOnGame.instructions)}
            className="self-start sm:self-center px-3 py-1.5 rounded-xl bg-indigo-50 hover:bg-indigo-100 text-indigo-700 text-xs font-bold transition flex items-center gap-1.5 cursor-pointer"
          >
            <Volume2 className="w-3.5 h-3.5" />
            <span>Hear Game Rules</span>
          </button>
        </div>

        {/* --- GAME 1: APPLE PICKER (Session 1) --- */}
        {session.sessionNumber === 1 && (
          <div className="bg-amber-50/60 p-6 rounded-2xl border border-amber-200 space-y-6">
            <div className="text-center space-y-1">
              <div className="text-xs font-black uppercase tracking-wider text-amber-900">
                Apples in Basket: {pickedApples.length} / 2
              </div>
              <p className="text-xs text-amber-800">
                Tap the apples on the tree to pick them into the basket!
              </p>
            </div>

            <div className="flex items-center justify-center gap-6">
              {/* Apple Tree Branch */}
              <div className="flex items-center gap-4 bg-white/90 p-4 rounded-2xl border border-amber-200 shadow-xs">
                {[1, 2].map(appleId => {
                  const isPicked = pickedApples.includes(appleId);
                  return (
                    <button
                      key={appleId}
                      onClick={() => handleToggleApple(appleId)}
                      className={`w-16 h-16 rounded-2xl transition transform active:scale-95 cursor-pointer flex flex-col items-center justify-center gap-1 font-black ${
                        isPicked
                          ? 'bg-slate-100 border border-slate-200 opacity-40 scale-90'
                          : 'bg-rose-500 hover:bg-rose-600 text-white shadow-md hover:scale-105'
                      }`}
                    >
                      <span className="text-2xl">🍎</span>
                      <span className="text-[10px]">{isPicked ? 'Picked' : `Apple ${appleId}`}</span>
                    </button>
                  );
                })}
              </div>

              <div className="text-xl font-black text-amber-600">➔</div>

              {/* Basket */}
              <div className="w-48 p-4 rounded-2xl bg-amber-200/80 border-2 border-dashed border-amber-400 flex flex-col items-center justify-center gap-2 min-h-[90px]">
                <div className="text-xs font-black text-amber-900">🧺 Fruit Basket</div>
                <div className="flex items-center gap-2">
                  {pickedApples.length === 0 ? (
                    <span className="text-xs text-amber-700 italic">Empty (0)</span>
                  ) : (
                    pickedApples.map(id => (
                      <span key={id} className="text-3xl animate-bounce">
                        🍎
                      </span>
                    ))
                  )}
                </div>
              </div>
            </div>

            <div className="text-center">
              {pickedApples.length === 2 ? (
                <div className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-emerald-100 text-emerald-900 border border-emerald-300 text-xs font-black">
                  <span>🎉 Wonderful! You picked 1, and 2 apples!</span>
                </div>
              ) : (
                <span className="text-xs text-slate-500">Pick two apples to fill the basket.</span>
              )}
            </div>
          </div>
        )}

        {/* --- GAME 2: SHAPE SORTER (Session 2) --- */}
        {session.sessionNumber === 2 && (
          <div className="bg-sky-50/60 p-6 rounded-2xl border border-sky-200 space-y-6">
            <div className="text-center space-y-1">
              <div className="text-xs font-black uppercase tracking-wider text-sky-900">
                Circle Cookies: {sortedCircles}/3 · Square Crackers: {sortedSquares}/3
              </div>
              <p className="text-xs text-sky-800">
                Tap to feed circles (they roll!) and squares (flat sides!) to polar bear.
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {/* Circles Box */}
              <div className="bg-white p-5 rounded-2xl border border-sky-200 shadow-xs text-center space-y-3">
                <div className="text-xs font-black text-sky-900">⚪ Round Circle Cookies</div>
                <div className="flex items-center justify-center gap-2 h-12">
                  {Array.from({ length: sortedCircles }).map((_, i) => (
                    <span key={i} className="text-3xl">🍪</span>
                  ))}
                  {sortedCircles === 0 && <span className="text-xs text-slate-400 italic">None yet</span>}
                </div>
                <button
                  onClick={handleAddCircle}
                  disabled={sortedCircles >= 3}
                  className="w-full py-2 rounded-xl bg-sky-600 hover:bg-sky-700 disabled:opacity-50 text-white text-xs font-bold transition cursor-pointer"
                >
                  {sortedCircles >= 3 ? '✓ 3 Circles Complete!' : '+ Add Round Cookie'}
                </button>
              </div>

              {/* Squares Box */}
              <div className="bg-white p-5 rounded-2xl border border-sky-200 shadow-xs text-center space-y-3">
                <div className="text-xs font-black text-sky-900">⏹️ Four-Sided Square Crackers</div>
                <div className="flex items-center justify-center gap-2 h-12">
                  {Array.from({ length: sortedSquares }).map((_, i) => (
                    <span key={i} className="text-3xl">🧇</span>
                  ))}
                  {sortedSquares === 0 && <span className="text-xs text-slate-400 italic">None yet</span>}
                </div>
                <button
                  onClick={handleAddSquare}
                  disabled={sortedSquares >= 3}
                  className="w-full py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white text-xs font-bold transition cursor-pointer"
                >
                  {sortedSquares >= 3 ? '✓ 3 Squares Complete!' : '+ Add Square Cracker'}
                </button>
              </div>
            </div>

            {(sortedCircles > 0 || sortedSquares > 0) && (
              <div className="flex justify-center">
                <button
                  onClick={() => {
                    playClickSound();
                    setSortedCircles(0);
                    setSortedSquares(0);
                  }}
                  className="text-xs text-slate-500 hover:text-slate-700 underline font-bold cursor-pointer"
                >
                  Reset Shapes
                </button>
              </div>
            )}
          </div>
        )}

        {/* --- GAME 3: FLOWER PATTERN (Session 3) --- */}
        {session.sessionNumber === 3 && (
          <div className="bg-emerald-50/60 p-6 rounded-2xl border border-emerald-200 space-y-6">
            <div className="text-center space-y-1">
              <div className="text-xs font-black uppercase tracking-wider text-emerald-900">
                Spring Garden AB Pattern: Pink, Yellow, Pink, [?]
              </div>
              <p className="text-xs text-emerald-800">
                What blooms next in our repeating rhythm?
              </p>
            </div>

            <div className="flex items-center justify-center gap-3 bg-white p-4 rounded-2xl border border-emerald-200 shadow-xs">
              {patternItems.map((item, idx) => (
                <div
                  key={idx}
                  className="w-14 h-14 rounded-2xl bg-slate-50 border border-slate-200 flex flex-col items-center justify-center gap-0.5"
                >
                  <span className="text-2xl">{item === 'pink' ? '🌸' : '🌼'}</span>
                  <span className="text-[9px] font-extrabold text-slate-500 uppercase">{item}</span>
                </div>
              ))}

              {!patternSolved && (
                <div className="w-14 h-14 rounded-2xl border-2 border-dashed border-emerald-400 bg-emerald-100/50 flex items-center justify-center text-xl font-black text-emerald-700 animate-pulse">
                  ?
                </div>
              )}
            </div>

            <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
              <span className="text-xs font-bold text-slate-600">Choose next flower:</span>
              <button
                onClick={() => handleChoosePatternItem('yellow')}
                disabled={patternSolved}
                className="px-4 py-2 rounded-xl bg-amber-400 hover:bg-amber-500 disabled:opacity-50 text-amber-950 text-xs font-black transition flex items-center gap-1.5 shadow-xs cursor-pointer"
              >
                <span>🌼</span>
                <span>Yellow Daisy</span>
              </button>
              <button
                onClick={() => handleChoosePatternItem('pink')}
                disabled={patternSolved}
                className="px-4 py-2 rounded-xl bg-pink-400 hover:bg-pink-500 disabled:opacity-50 text-pink-950 text-xs font-black transition flex items-center gap-1.5 shadow-xs cursor-pointer"
              >
                <span>🌸</span>
                <span>Pink Blossom</span>
              </button>

              {patternSolved && (
                <button
                  onClick={handleResetPattern}
                  className="px-3 py-1.5 rounded-xl bg-slate-200 hover:bg-slate-300 text-slate-700 text-xs font-bold transition cursor-pointer"
                >
                  Play Again
                </button>
              )}
            </div>

            {patternSolved && (
              <div className="text-center text-xs font-black text-emerald-800 bg-emerald-100 p-2.5 rounded-xl border border-emerald-300">
                🌸 Pink, 🌼 Yellow, 🌸 Pink, 🌼 Yellow! You completed the spring pattern!
              </div>
            )}
          </div>
        )}

        {/* --- GAME 4: HIGH FIVE STARS (Session 4) --- */}
        {session.sessionNumber === 4 && (
          <div className="bg-purple-50/60 p-6 rounded-2xl border border-purple-200 space-y-6">
            <div className="text-center space-y-1">
              <div className="text-xs font-black uppercase tracking-wider text-purple-900">
                Stars Collected: {collectedStars.length} of 5
              </div>
              <p className="text-xs text-purple-800">
                Tap each number star to illuminate the night sky! 1, 2, 3, 4, 5!
              </p>
            </div>

            <div className="flex flex-wrap items-center justify-center gap-3">
              {[1, 2, 3, 4, 5].map(starNum => {
                const isCollected = collectedStars.includes(starNum);

                return (
                  <button
                    key={starNum}
                    onClick={() => handleTapStar(starNum)}
                    className={`w-16 h-16 rounded-2xl transition transform active:scale-95 cursor-pointer flex flex-col items-center justify-center gap-1 font-black ${
                      isCollected
                        ? 'bg-amber-400 text-amber-950 shadow-md ring-2 ring-amber-300 scale-105'
                        : 'bg-white hover:bg-slate-100 text-slate-600 border border-slate-200'
                    }`}
                  >
                    <span className="text-2xl">{isCollected ? '⭐' : '☆'}</span>
                    <span className="text-xs font-mono">{starNum}</span>
                  </button>
                );
              })}
            </div>

            <div className="text-center">
              {collectedStars.length === 5 ? (
                <div className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-purple-100 text-purple-900 border border-purple-300 text-xs font-black">
                  <span>🖐️ HIGH FIVE! You counted all 5 stars like a preschool champion!</span>
                </div>
              ) : (
                <div className="text-xs text-slate-500">
                  Tap all 5 stars in order: 1, 2, 3, 4, 5.
                </div>
              )}
            </div>

            {collectedStars.length > 0 && (
              <div className="flex justify-center">
                <button
                  onClick={handleResetStars}
                  className="text-xs text-slate-500 hover:text-slate-700 underline font-bold cursor-pointer"
                >
                  Reset Stars
                </button>
              </div>
            )}
          </div>
        )}
      </section>

      {/* ==================================================== */}
      {/* NURSERY MATH RHYME & SONG TIME                      */}
      {/* ==================================================== */}
      <section className="bg-white rounded-3xl p-6 sm:p-8 border border-slate-200 shadow-sm space-y-4">
        <div className="flex items-center justify-between border-b border-slate-100 pb-3">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl bg-pink-100 text-pink-700 flex items-center justify-center">
              <Music className="w-4 h-4" />
            </div>
            <div>
              <div className="text-[10px] font-extrabold uppercase tracking-wider text-pink-600">
                Session {session.sessionNumber} Counting Song
              </div>
              <h3 className="text-base sm:text-lg font-black text-slate-900">
                {session.rhymeSong.title}
              </h3>
            </div>
          </div>

          <button
            onClick={handleSingSong}
            className="px-3.5 py-1.5 rounded-xl bg-pink-600 hover:bg-pink-700 text-white text-xs font-bold transition flex items-center gap-1.5 shadow-xs cursor-pointer"
          >
            <Volume2 className="w-3.5 h-3.5" />
            <span>Sing Song</span>
          </button>
        </div>

        <div className="p-4 rounded-2xl bg-pink-50/50 border border-pink-100 space-y-2 text-center sm:text-left">
          {session.rhymeSong.lyrics.map((line, lIdx) => (
            <p key={lIdx} className="text-xs sm:text-sm font-bold text-slate-800">
              🎵 {line}
            </p>
          ))}
          <div className="text-[11px] text-pink-800 font-semibold pt-2 border-t border-pink-100 italic">
            🗣️ {session.rhymeSong.audioPrompt}
          </div>
        </div>
      </section>

      {/* ==================================================== */}
      {/* SESSION DIAGNOSTIC CHALLENGE                        */}
      {/* ==================================================== */}
      <section className="bg-white rounded-3xl p-6 sm:p-8 border border-slate-200 shadow-sm space-y-5">
        <div className="flex items-center justify-between border-b border-slate-100 pb-3">
          <div>
            <div className="inline-flex items-center gap-1.5 text-xs font-extrabold uppercase tracking-wider text-indigo-600">
              <Star className="w-4 h-4 text-amber-500 fill-amber-400" />
              Session {session.sessionNumber} Milestone Quiz
            </div>
            <h3 className="text-lg font-black text-slate-900 mt-0.5">
              Friendly Touch-and-Count Challenge
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
            {session.quickChallenge.question}
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {session.quickChallenge.options.map((opt, i) => {
              const isSelected = selectedOption === i;
              const isCorrect = i === session.quickChallenge.correctIndex;
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
                  onClick={() => handleAnswerChallenge(i)}
                  className={`p-3.5 rounded-xl border text-xs sm:text-sm font-bold transition flex items-center justify-between cursor-pointer ${btnClass}`}
                >
                  <span>{opt}</span>
                  {hasSubmitted && isCorrect && <CheckCircle2 className="w-4 h-4 text-white" />}
                </button>
              );
            })}
          </div>

          {hasSubmitted && (
            <div
              className={`p-4 rounded-xl border text-xs font-semibold leading-relaxed ${
                selectedOption === session.quickChallenge.correctIndex
                  ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
                  : 'bg-amber-50 border-amber-200 text-amber-900'
              }`}
            >
              <div className="font-extrabold mb-1">
                {selectedOption === session.quickChallenge.correctIndex ? '🎉 Wonderful Answer!' : '💡 Learning Hint:'}
              </div>
              <div>{session.quickChallenge.explanation}</div>
            </div>
          )}

          {!hasSubmitted && (
            <div className="flex items-center justify-between pt-1">
              <button
                onClick={() => setShowHint(!showHint)}
                className="text-xs font-bold text-indigo-600 hover:text-indigo-700 cursor-pointer"
              >
                {showHint ? 'Hide Clue' : 'Need a Clue? 🔍'}
              </button>
              <button
                onClick={() => speakText(session.quickChallenge.audioVoice)}
                className="text-xs font-bold text-slate-500 hover:text-slate-800 flex items-center gap-1 cursor-pointer"
              >
                <Volume2 className="w-3.5 h-3.5 text-indigo-500" />
                <span>Read Question</span>
              </button>
            </div>
          )}

          {showHint && !hasSubmitted && (
            <div className="p-3 rounded-xl bg-amber-50 border border-amber-200 text-xs text-amber-900 font-medium">
              💡 {session.quickChallenge.hint}
            </div>
          )}
        </div>
      </section>

      {/* ==================================================== */}
      {/* PARENT & EDUCATOR AT-HOME PLAY TOOLKIT               */}
      {/* ==================================================== */}
      <section className="bg-white rounded-3xl p-6 sm:p-8 border border-slate-200 shadow-sm space-y-4">
        <div className="flex items-center gap-2 text-xs font-extrabold uppercase tracking-wider text-amber-700">
          <HeartHandshake className="w-4 h-4" />
          {session.parentAtHomeToolkit.title}
        </div>
        <h3 className="text-lg font-black text-slate-900">
          Everyday Real-World Math Play for Caregivers
        </h3>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-1">
          {session.parentAtHomeToolkit.tips.map((tip, idx) => (
            <div
              key={idx}
              className="p-4 rounded-2xl bg-amber-50/40 border border-amber-200/80 space-y-1.5"
            >
              <div className="w-6 h-6 rounded-full bg-amber-100 text-amber-800 text-xs font-black flex items-center justify-center">
                {idx + 1}
              </div>
              <p className="text-xs text-slate-700 font-medium leading-relaxed">
                {tip}
              </p>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
};
