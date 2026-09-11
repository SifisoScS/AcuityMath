import React, { useState } from 'react';
import confetti from 'canvas-confetti';
import { MathLesson, UserProfile } from '../types';
import { MathManipulatives } from './MathManipulatives';
import { Scratchpad } from './Scratchpad';
import { SocraticCoachModal } from './SocraticCoachModal';
import { useModalA11y } from '../hooks/useModalA11y';
import {
  Volume2,
  VolumeX,
  PenTool,
  Bot,
  HelpCircle,
  CheckCircle2,
  AlertCircle,
  ArrowRight,
  Sparkles,
  Trophy,
  X,
  Flame,
  Award
} from 'lucide-react';
import {
  playSuccessSound,
  playErrorSound,
  playLevelUpFanfare,
  playClickSound,
  speakText,
  stopSpeaking
} from '../utils/audio';

interface LessonModalProps {
  lesson: MathLesson;
  user: UserProfile;
  onClose: () => void;
  onLessonComplete: (results: {
    lessonId: string;
    xpEarned: number;
    coinsEarned: number;
    accuracy: number;
    newLevel: number;
    newElo: number;
  }) => void;
}

export const InteractiveLessonModal: React.FC<LessonModalProps> = ({
  lesson,
  user,
  onClose,
  onLessonComplete
}) => {
  // Traps Tab, handles Escape, and returns focus where it came from.
  // `aria-modal` on the panel below promises the rest of the page is
  // inert; this is what makes that true rather than a claim.
  const panelRef = useModalA11y(true, onClose);
  const [currentProblemIdx, setCurrentProblemIdx] = useState(0);
  const [selectedOption, setSelectedOption] = useState<string | null>(null);
  const [isAnswerSubmitted, setIsAnswerSubmitted] = useState(false);
  const [isCorrect, setIsCorrect] = useState(false);
  const [showHint, setShowHint] = useState(false);
  const [showScratchpad, setShowScratchpad] = useState(false);
  const [showCoach, setShowCoach] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);

  // Dynamic adaptive tracking
  const [currentDynamicLevel, setCurrentDynamicLevel] = useState(user.dynamicLevel);
  const [currentElo, setCurrentElo] = useState(user.eloRating);
  const [consecutiveCorrect, setConsecutiveCorrect] = useState(0);
  const [correctAnswersCount, setCorrectAnswersCount] = useState(0);
  const [adaptiveFeedback, setAdaptiveFeedback] = useState<string | null>(null);

  // Completion state
  const [isCompleted, setIsCompleted] = useState(false);

  const problem = lesson.problems[currentProblemIdx];
  const totalProblems = lesson.problems.length;
  const progressPercent = Math.round(((currentProblemIdx) / totalProblems) * 100);

  // Read aloud prompt with TTS
  const handleReadAloud = () => {
    if (isSpeaking) {
      stopSpeaking();
      setIsSpeaking(false);
      return;
    }
    setIsSpeaking(true);
    const textToRead = problem.audioPrompt || problem.question;
    speakText(textToRead, () => {
      setIsSpeaking(false);
    });
  };

  const handleSelectOption = (option: string) => {
    if (isAnswerSubmitted) return;
    playClickSound();
    setSelectedOption(option);
  };

  const handleSubmitAnswer = () => {
    if (!selectedOption || isAnswerSubmitted) return;

    const correct = selectedOption.trim() === problem.correctAnswer.trim();
    setIsAnswerSubmitted(true);
    setIsCorrect(correct);

    if (correct) {
      playSuccessSound();
      setCorrectAnswersCount(prev => prev + 1);
      const newConsecutive = consecutiveCorrect + 1;
      setConsecutiveCorrect(newConsecutive);

      // Adaptive algorithm: 2+ consecutive correct increases level & ELO
      if (newConsecutive >= 2) {
        const nextLevel = Math.min(10, currentDynamicLevel + 1);
        setCurrentDynamicLevel(nextLevel);
        setCurrentElo(prev => prev + 25);
        setAdaptiveFeedback(`🚀 Adaptive Boost! Difficulty scaled up to Level ${nextLevel}.`);
      } else {
        setAdaptiveFeedback(`✨ Precision! +10 ELO`);
        setCurrentElo(prev => prev + 10);
      }
    } else {
      playErrorSound();
      setConsecutiveCorrect(0);
      setShowHint(true); // Automatically expose friendly remediation hint
      // Adaptive decrease
      const nextLevel = Math.max(1, currentDynamicLevel - (currentDynamicLevel > 1 ? 0.5 : 0));
      setCurrentDynamicLevel(nextLevel);
      setCurrentElo(prev => Math.max(800, prev - 10));
      setAdaptiveFeedback(`🛡️ Adapting: Review the hint below to solidify the concept.`);
    }
  };

  const handleNextProblem = () => {
    playClickSound();
    stopSpeaking();
    setIsSpeaking(false);
    setSelectedOption(null);
    setIsAnswerSubmitted(false);
    setShowHint(false);
    setAdaptiveFeedback(null);

    if (currentProblemIdx < totalProblems - 1) {
      setCurrentProblemIdx(prev => prev + 1);
    } else {
      // Completed lesson
      setIsCompleted(true);
      playLevelUpFanfare();
      confetti({
        particleCount: 80,
        spread: 70,
        origin: { y: 0.6 }
      });
    }
  };

  const handleFinish = () => {
    const accuracy = Math.round(((correctAnswersCount) / totalProblems) * 100);
    onLessonComplete({
      lessonId: lesson.id,
      xpEarned: lesson.xpReward,
      coinsEarned: lesson.coinReward,
      accuracy,
      newLevel: Math.round(currentDynamicLevel),
      newElo: currentElo
    });
    onClose();
  };

  return (
    <div
      ref={panelRef}
      role="dialog"
      aria-modal="true"
      aria-label="Interactive lesson"
      tabIndex={-1}
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/80 backdrop-blur-sm p-3 sm:p-6 overflow-y-auto">
      <div className="relative w-full max-w-3xl bg-white rounded-3xl shadow-2xl border border-slate-200 flex flex-col overflow-hidden my-auto max-h-[95vh]">
        {/* Scratchpad overlay if open */}
        {showScratchpad && <Scratchpad onClose={() => setShowScratchpad(false)} />}

        {/* Modal Top Header */}
        <div className="flex items-center justify-between px-5 py-3.5 bg-slate-50 border-b border-slate-200">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-indigo-100 flex items-center justify-center text-xl shadow-inner">
              {lesson.tier === 'early' ? '🌱' : lesson.tier === 'elementary' ? '🚀' : lesson.tier === 'middle' ? '⚡' : '🌌'}
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-800 leading-tight flex items-center gap-2">
                {lesson.title}
                <span className="text-[11px] font-semibold bg-indigo-50 text-indigo-700 px-2 py-0.5 rounded-full border border-indigo-200">
                  {lesson.topic}
                </span>
              </h2>
              <div className="flex items-center gap-3 text-xs text-slate-500 mt-0.5">
                <span>Problem {currentProblemIdx + 1} of {totalProblems}</span>
                <span className="flex items-center gap-1 font-bold text-amber-600">
                  <Sparkles className="w-3.5 h-3.5" /> +{lesson.xpReward} XP
                </span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* Dynamic Adaptive Level Badge */}
            <div className="hidden sm:flex items-center gap-1.5 bg-emerald-50 border border-emerald-200 text-emerald-800 px-3 py-1 rounded-full text-xs font-bold shadow-xs">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
              Dynamic Lvl {currentDynamicLevel.toFixed(1)}
            </div>

            {/* Close Button */}
            <button
              onClick={() => {
                stopSpeaking();
                onClose();
              }}
              className="p-2 hover:bg-slate-200 text-slate-500 hover:text-slate-700 rounded-xl transition cursor-pointer"
              title="Close Lesson"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Progress Bar */}
        <div className="w-full bg-slate-100 h-1.5 overflow-hidden">
          <div
            className="bg-indigo-600 h-full transition-all duration-300 ease-out"
            style={{ width: `${progressPercent}%` }}
          />
        </div>

        {/* Modal Body / Active Content */}
        {!isCompleted ? (
          <div className="p-4 sm:p-6 overflow-y-auto flex-1 flex flex-col gap-5">
            {/* Adaptive Banner Notification */}
            {adaptiveFeedback && (
              <div className="p-2.5 bg-indigo-50 border border-indigo-200 text-indigo-900 rounded-xl text-xs font-semibold flex items-center justify-between animate-in fade-in duration-200">
                <span>{adaptiveFeedback}</span>
                <span className="text-[10px] font-mono text-indigo-600">Rating: {currentElo} ELO</span>
              </div>
            )}

            {/* Question Bar & Accessibility Tools */}
            <div className="bg-slate-50 rounded-2xl p-4 border border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-[11px] font-bold uppercase tracking-wider text-indigo-600">
                    Question {currentProblemIdx + 1}
                  </span>
                  {consecutiveCorrect > 1 && (
                    <span className="text-[10px] font-extrabold bg-amber-100 text-amber-800 px-2 py-0.5 rounded-full flex items-center gap-0.5">
                      <Flame className="w-3 h-3 text-amber-500" /> {consecutiveCorrect}x Streak!
                    </span>
                  )}
                </div>
                <h3 className="text-base sm:text-lg font-bold text-slate-800 leading-snug">
                  {problem.question}
                </h3>
              </div>

              {/* Action Buttons: TTS Read Aloud & Scratchpad */}
              <div className="flex items-center gap-2 self-end sm:self-center">
                <button
                  onClick={handleReadAloud}
                  className={`p-2.5 rounded-xl border flex items-center gap-1.5 text-xs font-bold transition shadow-xs cursor-pointer ${
                    isSpeaking
                      ? 'bg-amber-500 text-white border-amber-600 animate-pulse'
                      : 'bg-white hover:bg-slate-100 text-slate-700 border-slate-200'
                  }`}
                  title="Read question out loud (TTS)"
                >
                  {isSpeaking ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4 text-indigo-600" />}
                  <span className="hidden sm:inline">{isSpeaking ? 'Stop' : 'Read Aloud'}</span>
                </button>

                <button
                  onClick={() => setShowScratchpad(true)}
                  className="p-2.5 rounded-xl border bg-white hover:bg-slate-100 text-slate-700 border-slate-200 flex items-center gap-1.5 text-xs font-bold transition shadow-xs cursor-pointer"
                  title="Open Math Scratchpad"
                >
                  <PenTool className="w-4 h-4 text-indigo-600" />
                  <span className="hidden sm:inline">Scratchpad</span>
                </button>

                <button
                  onClick={() => setShowCoach(true)}
                  className="p-2.5 rounded-xl border bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border-indigo-200 flex items-center gap-1.5 text-xs font-bold transition shadow-xs cursor-pointer"
                  title="Ask Socratic AI Math Coach"
                >
                  <Bot className="w-4 h-4 text-indigo-600" />
                  <span className="hidden sm:inline">AI Coach</span>
                </button>
              </div>
            </div>

            {/* Interactive Visual Manipulative */}
            <div className="w-full">
              <MathManipulatives problem={problem} />
            </div>

            {/* Options Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-1">
              {problem.options.map((opt, i) => {
                const isSelected = selectedOption === opt;
                let btnStyle = 'bg-white border-slate-200 hover:border-indigo-400 hover:bg-indigo-50/40 text-slate-800';

                if (isAnswerSubmitted) {
                  if (opt === problem.correctAnswer) {
                    btnStyle = 'bg-emerald-50 border-emerald-500 text-emerald-900 ring-2 ring-emerald-400 shadow-md font-bold';
                  } else if (isSelected && !isCorrect) {
                    btnStyle = 'bg-rose-50 border-rose-500 text-rose-900 ring-2 ring-rose-400 shadow-md';
                  } else {
                    btnStyle = 'bg-slate-50 border-slate-200 text-slate-400 opacity-60';
                  }
                } else if (isSelected) {
                  btnStyle = 'bg-indigo-50 border-indigo-600 text-indigo-900 ring-2 ring-indigo-500 font-bold shadow-sm';
                }

                return (
                  <button
                    key={i}
                    onClick={() => handleSelectOption(opt)}
                    disabled={isAnswerSubmitted}
                    className={`min-h-[52px] p-4 rounded-xl border-2 text-left font-medium text-base transition-all duration-150 flex items-center justify-between cursor-pointer ${btnStyle}`}
                  >
                    <span className="font-mono-math">{opt}</span>
                    {isAnswerSubmitted && opt === problem.correctAnswer && (
                      <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
                    )}
                    {isAnswerSubmitted && isSelected && !isCorrect && (
                      <AlertCircle className="w-5 h-5 text-rose-600 shrink-0" />
                    )}
                  </button>
                );
              })}
            </div>

            {/* Hint Box (if toggled or on error) */}
            {showHint && (
              <div className="p-3.5 bg-amber-50 border border-amber-200 rounded-xl text-amber-900 text-xs flex items-start gap-2.5 animate-in fade-in">
                <HelpCircle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                <div>
                  <span className="font-bold">Helpful Hint: </span>
                  <span>{problem.hint}</span>
                </div>
              </div>
            )}

            {/* Post-Submit Explanation Card */}
            {isAnswerSubmitted && (
              <div
                className={`p-4 rounded-2xl border text-sm animate-in slide-in-from-bottom-2 ${
                  isCorrect
                    ? 'bg-emerald-50/80 border-emerald-300 text-emerald-950'
                    : 'bg-rose-50/80 border-rose-300 text-rose-950'
                }`}
              >
                <div className="flex items-center justify-between gap-2 font-bold mb-1">
                  <div className="flex items-center gap-2">
                    {isCorrect ? (
                      <>
                        <CheckCircle2 className="w-5 h-5 text-emerald-600" />
                        <span>Terrific Work! Correct!</span>
                      </>
                    ) : (
                      <>
                        <AlertCircle className="w-5 h-5 text-rose-600" />
                        <span>Not quite, let&apos;s understand why:</span>
                      </>
                    )}
                  </div>

                  {!isCorrect && (
                    <button
                      onClick={() => setShowCoach(true)}
                      className="px-3 py-1 bg-white hover:bg-rose-100 text-rose-800 border border-rose-200 rounded-xl text-xs font-bold flex items-center gap-1.5 shadow-xs cursor-pointer"
                    >
                      <Bot className="w-3.5 h-3.5 text-rose-600" />
                      <span>Ask AI Coach →</span>
                    </button>
                  )}
                </div>
                <p className="text-xs sm:text-sm mt-1 leading-relaxed opacity-90">{problem.explanation}</p>
              </div>
            )}
          </div>
        ) : (
          /* Lesson Completed Celebration View */
          <div className="p-6 sm:p-10 flex flex-col items-center text-center gap-6 overflow-y-auto">
            <div className="w-20 h-20 bg-gradient-to-tr from-amber-400 to-yellow-300 rounded-3xl flex items-center justify-center text-4xl shadow-xl shadow-amber-200 animate-bounce">
              <Trophy className="w-10 h-10 text-amber-950" />
            </div>

            <div>
              <h3 className="text-2xl sm:text-3xl font-extrabold text-slate-900">
                Lesson Complete! 🎉
              </h3>
              <p className="text-sm text-slate-500 mt-1 max-w-sm">
                You conquered <span className="font-semibold text-slate-800">{lesson.title}</span> with dynamic adaptive mastery!
              </p>
            </div>

            {/* Performance Stats Cards */}
            <div className="grid grid-cols-3 gap-3 w-full max-w-md">
              <div className="bg-slate-50 p-3 rounded-2xl border border-slate-200">
                <span className="text-[11px] font-bold text-slate-400 uppercase">Accuracy</span>
                <p className="text-xl font-extrabold text-indigo-600 mt-1">
                  {Math.round((correctAnswersCount / totalProblems) * 100)}%
                </p>
              </div>

              <div className="bg-slate-50 p-3 rounded-2xl border border-slate-200">
                <span className="text-[11px] font-bold text-slate-400 uppercase">XP Gained</span>
                <p className="text-xl font-extrabold text-amber-500 mt-1 flex items-center justify-center gap-1">
                  <Sparkles className="w-4 h-4" /> +{lesson.xpReward}
                </p>
              </div>

              <div className="bg-slate-50 p-3 rounded-2xl border border-slate-200">
                <span className="text-[11px] font-bold text-slate-400 uppercase">Star Coins</span>
                <p className="text-xl font-extrabold text-yellow-500 mt-1 flex items-center justify-center gap-1">
                  <Award className="w-4 h-4" /> +{lesson.coinReward}
                </p>
              </div>
            </div>

            {/* Dynamic Level Status */}
            <div className="w-full max-w-md bg-emerald-50 border border-emerald-200 p-3.5 rounded-2xl flex items-center justify-between text-xs font-bold text-emerald-900">
              <span className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-500" />
                Updated Adaptive Math Rating
              </span>
              <span className="font-mono text-emerald-800">
                Level {currentDynamicLevel.toFixed(1)} ({currentElo} ELO)
              </span>
            </div>

            <button
              onClick={handleFinish}
              className="w-full max-w-md py-3.5 px-6 rounded-2xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-base shadow-lg shadow-indigo-200 transition cursor-pointer"
            >
              Collect Rewards & Return to Dashboard
            </button>
          </div>
        )}

        {/* Modal Bottom Footer Actions */}
        {!isCompleted && (
          <div className="px-5 py-3.5 bg-slate-50 border-t border-slate-200 flex items-center justify-between">
            <button
              onClick={() => setShowHint(prev => !prev)}
              className="text-xs font-semibold text-slate-600 hover:text-indigo-600 flex items-center gap-1.5 transition cursor-pointer"
            >
              <HelpCircle className="w-4 h-4" />
              <span>{showHint ? 'Hide Hint' : 'Need a Hint?'}</span>
            </button>

            <div className="flex items-center gap-3">
              {!isAnswerSubmitted ? (
                <button
                  onClick={handleSubmitAnswer}
                  disabled={!selectedOption}
                  className={`px-6 py-2.5 rounded-xl font-bold text-sm transition cursor-pointer ${
                    selectedOption
                      ? 'bg-indigo-600 hover:bg-indigo-700 text-white shadow-md shadow-indigo-200'
                      : 'bg-slate-200 text-slate-400 cursor-not-allowed'
                  }`}
                >
                  Check Answer
                </button>
              ) : (
                <button
                  onClick={handleNextProblem}
                  className="px-6 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-sm shadow-md shadow-indigo-200 flex items-center gap-1.5 transition cursor-pointer"
                >
                  <span>{currentProblemIdx < totalProblems - 1 ? 'Next Problem' : 'Complete Lesson'}</span>
                  <ArrowRight className="w-4 h-4" />
                </button>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Socratic Coach Modal */}
      {showCoach && (
        <SocraticCoachModal
          isOpen={showCoach}
          onClose={() => setShowCoach(false)}
          problemQuestion={problem.question}
          options={problem.options}
          correctAnswer={problem.correctAnswer}
          studentAnswer={selectedOption}
          studentAge={user.age}
          tier={user.tier}
          hint={problem.hint}
          explanation={problem.explanation}
        />
      )}

      {/* Scratchpad Modal */}
      {showScratchpad && (
        <Scratchpad
          isOpen={showScratchpad}
          onClose={() => setShowScratchpad(false)}
          title={`Scratchpad • Problem ${currentProblemIdx + 1}`}
        />
      )}
    </div>
  );
};

