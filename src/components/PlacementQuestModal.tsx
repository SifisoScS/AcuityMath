import React, { useState } from 'react';
import confetti from 'canvas-confetti';
import { UserProfile, AgeTier } from '../types';
import { ProblemGenerator, GeneratedMathProblem } from '../services/problemGenerator';
import { AdaptiveEngine, StudentAbilityProfile, MisconceptionCode } from '../services/adaptiveEngine';
import { adaptiveWorkerClient } from '../utils/adaptiveWorkerClient';
import { MathManipulatives } from './MathManipulatives';
import { Scratchpad } from './Scratchpad';
import { BilingualTextHighlighter } from './BilingualTextHighlighter';
import {
  Compass,
  CheckCircle2,
  AlertCircle,
  Sparkles,
  ArrowRight,
  TrendingUp,
  Award,
  PenTool,
  Volume2,
  VolumeX,
  X,
  ShieldCheck,
  Zap,
  Target
} from 'lucide-react';
import {
  playSuccessSound,
  playErrorSound,
  playLevelUpFanfare,
  playClickSound,
  speakText,
  stopSpeaking
} from '../utils/audio';

interface PlacementQuestModalProps {
  user: UserProfile;
  onClose: () => void;
  onCompletePlacement: (updates: Partial<UserProfile>) => void;
}

const TOTAL_DIAGNOSTIC_ITEMS = 7;

export const PlacementQuestModal: React.FC<PlacementQuestModalProps> = ({
  user,
  onClose,
  onCompletePlacement
}) => {
  // Ability profile initialized to tier baseline
  const [abilityProfile, setAbilityProfile] = useState<StudentAbilityProfile>(() =>
    AdaptiveEngine.createInitialProfile(user.age)
  );

  const [questionIndex, setQuestionIndex] = useState<number>(1);
  const [currentProblem, setCurrentProblem] = useState<GeneratedMathProblem>(() =>
    ProblemGenerator.generate(user.tier, abilityProfile.theta)
  );

  const [selectedOption, setSelectedOption] = useState<string | null>(null);
  const [isAnswerSubmitted, setIsAnswerSubmitted] = useState<boolean>(false);
  const [isCorrect, setIsCorrect] = useState<boolean>(false);
  const [detectedMisconception, setDetectedMisconception] = useState<MisconceptionCode | null>(null);
  const [isSpeaking, setIsSpeaking] = useState<boolean>(false);
  const [showScratchpad, setShowScratchpad] = useState<boolean>(false);

  // Completed State
  const [isCompleted, setIsCompleted] = useState<boolean>(false);

  // History tracking
  const [responseHistory, setResponseHistory] = useState<{
    itemNum: number;
    thetaBefore: number;
    thetaAfter: number;
    isCorrect: boolean;
  }[]>([]);

  const handleSelectOption = (opt: string) => {
    if (isAnswerSubmitted) return;
    playClickSound();
    setSelectedOption(opt);
  };

  const handleToggleSpeak = () => {
    if (isSpeaking) {
      stopSpeaking();
      setIsSpeaking(false);
    } else {
      setIsSpeaking(true);
      speakText(`${currentProblem.question}. Options are: ${currentProblem.options.join(', ')}`, () => {
        setIsSpeaking(false);
      });
    }
  };

  const handleSubmitAnswer = () => {
    if (!selectedOption || isAnswerSubmitted) return;
    stopSpeaking();
    setIsSpeaking(false);

    const correct = selectedOption === currentProblem.correctAnswer;
    setIsCorrect(correct);
    setIsAnswerSubmitted(true);

    const misconception = !correct ? currentProblem.misconceptionsMap[selectedOption] || null : null;
    setDetectedMisconception(misconception);

    if (correct) {
      playSuccessSound();
    } else {
      playErrorSound();
    }

    // Psychometric 3PL Update via background worker
    const thetaBefore = abilityProfile.theta;
    adaptiveWorkerClient.updateAbilityAsync(abilityProfile, {
      itemParams: currentProblem.irtParams,
      isCorrect: correct,
      misconceptionCode: misconception
    }).then(updated => {
      setAbilityProfile(updated);
      setResponseHistory(prev => [
        ...prev,
        {
          itemNum: questionIndex,
          thetaBefore,
          thetaAfter: updated.theta,
          isCorrect: correct
        }
      ]);
    }).catch(() => {
      const updated = AdaptiveEngine.updateAbility(abilityProfile, {
        itemParams: currentProblem.irtParams,
        isCorrect: correct,
        misconceptionCode: misconception
      });
      setAbilityProfile(updated);
      setResponseHistory(prev => [
        ...prev,
        {
          itemNum: questionIndex,
          thetaBefore,
          thetaAfter: updated.theta,
          isCorrect: correct
        }
      ]);
    });
  };

  const handleNextQuestion = () => {
    playClickSound();

    if (questionIndex >= TOTAL_DIAGNOSTIC_ITEMS) {
      // Complete Quest!
      setIsCompleted(true);
      playLevelUpFanfare();
      confetti({
        particleCount: 120,
        spread: 80,
        origin: { y: 0.6 }
      });
      return;
    }

    const nextIndex = questionIndex + 1;
    setQuestionIndex(nextIndex);
    setSelectedOption(null);
    setIsAnswerSubmitted(false);
    setDetectedMisconception(null);

    // Generate problem at newly calibrated theta
    const nextProb = ProblemGenerator.generate(user.tier, abilityProfile.theta);
    setCurrentProblem(nextProb);
  };

  const handleFinishAndSave = () => {
    playClickSound();
    onCompletePlacement({
      dynamicLevel: abilityProfile.dynamicLevel,
      eloRating: abilityProfile.eloRating,
      diagnosticComplete: true,
      initialThetaScore: abilityProfile.theta
    });
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/70 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
      <div className="bg-white w-full max-w-3xl rounded-3xl p-6 sm:p-8 shadow-2xl border border-slate-200 space-y-6 animate-in zoom-in-95">
        {!isCompleted ? (
          <>
            {/* Header & Benchmark Progress */}
            <div className="flex items-start justify-between gap-4 pb-4 border-b border-slate-100">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <span className="px-2.5 py-0.5 rounded-full text-[10px] font-extrabold uppercase tracking-wider bg-indigo-50 text-indigo-700 border border-indigo-200 flex items-center gap-1">
                    <Sparkles className="w-3 h-3 text-indigo-600" />
                    Adaptive Placement Quest
                  </span>
                  <span className="text-xs font-bold text-slate-400">
                    Question {questionIndex} of {TOTAL_DIAGNOSTIC_ITEMS}
                  </span>
                </div>
                <h2 className="text-xl sm:text-2xl font-black text-slate-900 flex items-center gap-2">
                  <Compass className="w-6 h-6 text-indigo-600" />
                  Calibrating Your Math Starting Zone
                </h2>
                <p className="text-xs text-slate-500">
                  Items adapt in difficulty using 3-Parameter Logistic psychometrics to determine your baseline proficiency.
                </p>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                <button
                  onClick={() => setShowScratchpad(prev => !prev)}
                  className={`p-2 rounded-xl border text-xs font-bold transition flex items-center gap-1.5 cursor-pointer ${
                    showScratchpad ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-slate-100 text-slate-700 hover:bg-slate-200 border-slate-200'
                  }`}
                  title="Toggle Scratchpad Workspace"
                >
                  <PenTool className="w-4 h-4" />
                  <span className="hidden sm:inline">Scratchpad</span>
                </button>
                <button
                  onClick={onClose}
                  className="p-2 rounded-xl text-slate-400 hover:text-slate-700 hover:bg-slate-100 cursor-pointer transition"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Diagnostic Meter (Live SEM & Theta calibration indicator) */}
            <div className="bg-slate-50 p-3.5 rounded-2xl border border-slate-200/80 space-y-2">
              <div className="flex items-center justify-between text-xs">
                <span className="font-bold text-slate-700 flex items-center gap-1.5">
                  <Target className="w-3.5 h-3.5 text-indigo-600" />
                  Diagnostic Convergence
                </span>
                <span className="text-slate-500 font-mono text-[11px]">
                  Estimated θ: <strong>{abilityProfile.theta > 0 ? `+${abilityProfile.theta}` : abilityProfile.theta}</strong> • SEM: ±{abilityProfile.standardError}
                </span>
              </div>
              <div className="h-2 w-full bg-slate-200 rounded-full overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-indigo-500 to-emerald-500 rounded-full transition-all duration-500"
                  style={{ width: `${(questionIndex / TOTAL_DIAGNOSTIC_ITEMS) * 100}%` }}
                />
              </div>
            </div>

            {/* Problem Card */}
            <div className="bg-white rounded-2xl border border-slate-200 p-5 space-y-5 shadow-xs">
              <div className="flex items-start justify-between gap-4">
                <div className="space-y-1">
                  <span className="text-[10px] font-black uppercase tracking-wider text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded">
                    {currentProblem.topic}
                  </span>
                  <h3 className="text-lg sm:text-xl font-bold text-slate-900 leading-snug">
                    <BilingualTextHighlighter text={currentProblem.question} />
                  </h3>
                </div>

                <button
                  onClick={handleToggleSpeak}
                  className={`p-2.5 rounded-xl border transition cursor-pointer shrink-0 ${
                    isSpeaking
                      ? 'bg-emerald-100 text-emerald-800 border-emerald-300 animate-pulse'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200 border-slate-200'
                  }`}
                  title="Read Question Aloud"
                >
                  {isSpeaking ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
                </button>
              </div>

              {/* Visual Aid */}
              {currentProblem.visualAid && (
                <div className="p-3 bg-slate-50 rounded-2xl border border-slate-100 flex justify-center">
                  <MathManipulatives visualType={currentProblem.visualAid} interactive={true} />
                </div>
              )}

              {/* Multiple Choice Options */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {currentProblem.options.map((opt, idx) => {
                  let optStyle = 'bg-slate-50 border-slate-200 text-slate-800 hover:bg-indigo-50/50 hover:border-indigo-300';
                  if (selectedOption === opt) {
                    optStyle = 'bg-indigo-50 border-indigo-600 text-indigo-900 font-black ring-2 ring-indigo-500/20';
                  }
                  if (isAnswerSubmitted) {
                    if (opt === currentProblem.correctAnswer) {
                      optStyle = 'bg-emerald-50 border-emerald-500 text-emerald-900 font-black ring-2 ring-emerald-500/20';
                    } else if (selectedOption === opt && !isCorrect) {
                      optStyle = 'bg-rose-50 border-rose-500 text-rose-900 font-bold';
                    } else {
                      optStyle = 'opacity-50 border-slate-200 text-slate-400';
                    }
                  }

                  return (
                    <button
                      key={idx}
                      onClick={() => handleSelectOption(opt)}
                      disabled={isAnswerSubmitted}
                      className={`p-4 rounded-xl border-2 text-left font-medium text-sm transition flex items-center justify-between cursor-pointer ${optStyle}`}
                    >
                      <span>{opt}</span>
                      {isAnswerSubmitted && opt === currentProblem.correctAnswer && (
                        <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                      )}
                      {isAnswerSubmitted && selectedOption === opt && !isCorrect && (
                        <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
                      )}
                    </button>
                  );
                })}
              </div>

              {/* Feedback Alert */}
              {isAnswerSubmitted && (
                <div className={`p-4 rounded-2xl border text-xs font-semibold space-y-1 ${
                  isCorrect ? 'bg-emerald-50 text-emerald-900 border-emerald-200' : 'bg-amber-50 text-amber-900 border-amber-200'
                }`}>
                  <div className="flex items-center gap-1.5 font-bold">
                    {isCorrect ? (
                      <>
                        <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                        <span>Calibrated! Excellent step reasoning.</span>
                      </>
                    ) : (
                      <>
                        <AlertCircle className="w-4 h-4 text-amber-600" />
                        <span>Diagnostic note: Adjusting proximal difficulty.</span>
                      </>
                    )}
                  </div>
                  <p className="text-slate-600 font-normal">
                    {currentProblem.explanation}
                  </p>
                </div>
              )}

              {/* Action Buttons */}
              <div className="flex items-center justify-end gap-3 pt-2">
                {!isAnswerSubmitted ? (
                  <button
                    onClick={handleSubmitAnswer}
                    disabled={!selectedOption}
                    className="px-6 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 text-white font-bold text-xs cursor-pointer shadow-md shadow-indigo-600/30 transition active:scale-95"
                  >
                    Submit Response
                  </button>
                ) : (
                  <button
                    onClick={handleNextQuestion}
                    className="px-6 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs flex items-center gap-1.5 cursor-pointer shadow-md shadow-emerald-600/30 transition active:scale-95"
                  >
                    <span>{questionIndex >= TOTAL_DIAGNOSTIC_ITEMS ? 'Finish Placement' : 'Next Item'}</span>
                    <ArrowRight className="w-4 h-4" />
                  </button>
                )}
              </div>
            </div>

            {/* Scratchpad slide-in */}
            {showScratchpad && (
              <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200">
                <Scratchpad onExportToCanvas={() => {}} />
              </div>
            )}
          </>
        ) : (
          /* Completion Screen */
          <div className="text-center py-6 space-y-6">
            <div className="w-16 h-16 bg-gradient-to-tr from-emerald-500 to-indigo-600 rounded-3xl mx-auto flex items-center justify-center text-white shadow-xl shadow-indigo-600/30">
              <Award className="w-8 h-8" />
            </div>

            <div className="space-y-1.5">
              <span className="px-3 py-1 rounded-full text-xs font-black uppercase tracking-wider bg-emerald-100 text-emerald-800">
                Diagnostic Complete
              </span>
              <h2 className="text-2xl sm:text-3xl font-black text-slate-900">
                Your Baseline Proficiency is Locked In!
              </h2>
              <p className="text-xs sm:text-sm text-slate-500 max-w-md mx-auto">
                Based on your 7-item psychometric response vector, AcuityMath has customized your curriculum starting level.
              </p>
            </div>

            {/* Diagnostic Calibrated Results Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 p-4 bg-slate-50 rounded-2xl border border-slate-200 text-center">
              <div className="p-3 bg-white rounded-xl shadow-2xs border border-slate-100">
                <span className="text-[11px] font-bold text-slate-400 uppercase">Starting Dynamic Level</span>
                <div className="text-2xl font-black text-indigo-600 mt-0.5">
                  Level {abilityProfile.dynamicLevel}
                </div>
                <span className="text-[10px] text-slate-500">Pacing scale (1 to 10)</span>
              </div>

              <div className="p-3 bg-white rounded-xl shadow-2xs border border-slate-100">
                <span className="text-[11px] font-bold text-slate-400 uppercase">Latent Ability (θ)</span>
                <div className="text-2xl font-black text-emerald-600 mt-0.5">
                  {abilityProfile.theta > 0 ? `+${abilityProfile.theta}` : abilityProfile.theta}
                </div>
                <span className="text-[10px] text-slate-500">SEM precision ±{abilityProfile.standardError}</span>
              </div>

              <div className="p-3 bg-white rounded-xl shadow-2xs border border-slate-100">
                <span className="text-[11px] font-bold text-slate-400 uppercase">Calibrated ELO</span>
                <div className="text-2xl font-black text-amber-600 mt-0.5">
                  {abilityProfile.eloRating}
                </div>
                <span className="text-[10px] text-slate-500">Initial matchmaking rating</span>
              </div>
            </div>

            <div className="p-4 bg-indigo-50/70 rounded-2xl border border-indigo-100 text-xs text-indigo-900 text-left space-y-1">
              <div className="font-extrabold flex items-center gap-1.5">
                <ShieldCheck className="w-4 h-4 text-indigo-700" />
                <span>Zone of Proximal Development (ZPD) Confirmed</span>
              </div>
              <p className="text-indigo-800 text-[11px] leading-relaxed">
                Your daily tasks, manipulatives, and Socratic coach dialogues will now precisely target your cognitive sweet spot—challenging enough to spark growth without overwhelming.
              </p>
            </div>

            <div className="pt-2">
              <button
                onClick={handleFinishAndSave}
                className="w-full py-3.5 rounded-2xl bg-indigo-600 hover:bg-indigo-500 text-white font-extrabold text-sm shadow-lg shadow-indigo-600/30 cursor-pointer transition active:scale-98"
              >
                Lock In Placement & Enter Dashboard
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
