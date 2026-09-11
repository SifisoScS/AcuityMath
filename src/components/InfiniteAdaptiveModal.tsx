import React, { useState, useEffect } from 'react';
import confetti from 'canvas-confetti';
import { UserProfile } from '../types';
import { MathManipulatives } from './MathManipulatives';
import { Scratchpad } from './Scratchpad';
import { SocraticCoachModal } from './SocraticCoachModal';
import { Activity, AlertCircle, ArrowRight, Bot, CheckCircle2, Clock, Flame, HelpCircle, PenTool, RotateCcw, Sparkles, Volume2, VolumeX, X, Zap } from 'lucide-react';
import {
  playSuccessSound,
  playErrorSound,
  playLevelUpFanfare,
  playClickSound,
  speakText,
  stopSpeaking
} from '../utils/audio';
import { ProblemGenerator, GeneratedMathProblem } from '../services/problemGenerator';
import { AdaptiveEngine, StudentAbilityProfile, MisconceptionCode } from '../services/adaptiveEngine';
import { adaptiveWorkerClient } from '../utils/adaptiveWorkerClient';
import { BilingualTextHighlighter } from './BilingualTextHighlighter';
import { apiService } from '../services/api';
import { isQueued, usePractice } from '../hooks/usePractice';

interface InfiniteAdaptiveModalProps {
  user: UserProfile;
  /**
   * The server learner to record this session against. When absent — offline,
   * signed out, or still resolving — the modal falls back to generating
   * problems locally, which is what it did before there was a server.
   */
  learnerId?: number | null;
  onClose: () => void;
  onUpdateUserProfile: (updates: Partial<UserProfile>) => void;
  onOpenGlossary?: () => void;
}

export const InfiniteAdaptiveModal: React.FC<InfiniteAdaptiveModalProps> = ({
  user,
  learnerId,
  onClose,
  onUpdateUserProfile,
  onOpenGlossary
}) => {
  // Ability Profile based on IRT
  const [abilityProfile, setAbilityProfile] = useState<StudentAbilityProfile>(() => {
    const p = AdaptiveEngine.createInitialProfile(user.age);
    p.dynamicLevel = user.dynamicLevel;
    p.eloRating = user.eloRating;
    return p;
  });

  // Dynamic problem stream
  const [currentProblem, setCurrentProblem] = useState<GeneratedMathProblem>(() =>
    ProblemGenerator.generate(user.tier, abilityProfile.theta)
  );
  const [selectedOption, setSelectedOption] = useState<string | null>(null);
  /** A typed answer, for the 784 authored problems that offer no choices. */
  const [typedAnswer, setTypedAnswer] = useState('');
  const [isAnswerSubmitted, setIsAnswerSubmitted] = useState(false);

  /**
   * Where this question came from.
   *
   * `authored` means one of the 1,132 problems whose answer was verified with
   * SymPy and whose wrong options were written by someone who knew what each
   * one diagnoses. `generated` is the local generator: unlimited, and the only
   * thing that covers the ages the corpus does not reach.
   */
  const [source, setSource] = useState<'authored' | 'generated'>('generated');
  const [explanation, setExplanation] = useState<string | null>(null);

  const practice = usePractice(learnerId ?? null);
  const useServer = typeof learnerId === 'number' && learnerId > 0;
  const [isCorrect, setIsCorrect] = useState(false);
  /**
   * True when the answer was queued rather than sent.
   *
   * A third state, not `isCorrect === false`. `practice.next` withholds the
   * correct answer — anything it returns is readable in the network tab by the
   * child being tested — so with no server there is genuinely nothing to mark
   * against. Showing "Not quite" would be inventing a verdict, and showing
   * "Correct!" would be worse.
   */
  const [awaitingMark, setAwaitingMark] = useState(false);
  const [detectedMisconception, setDetectedMisconception] = useState<MisconceptionCode | null>(null);

  // Tools state
  const [showScratchpad, setShowScratchpad] = useState(false);
  const [showCoach, setShowCoach] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [streak, setStreak] = useState(0);
  const [solvedCount, setSolvedCount] = useState(0);
  const [earnedCoins, setEarnedCoins] = useState(0);

  /** Turns a served problem into the shape this component already renders. */
  const adoptServerQuestion = (served: NonNullable<typeof practice.question>) => {
    setCurrentProblem({
      id: String(served.problemId),
      question: served.prompt,
      // The correct answer is deliberately not sent with the question — it
      // arrives with the verdict, once the learner has committed.
      correctAnswer: '',
      options: served.choices,
      hint: served.hint,
      explanation: '',
      visualType: undefined,
      visualData: served.visual ?? undefined,
      manipulativeHint: served.manipulativeHint ?? undefined,
      difficulty: served.difficulty,
      irtParameters: { discrimination: 1, difficulty: 0, pseudoGuessing: 0.25 },
      distractorDiagnostics: {},
      standardCode: '',
      topicDomain: served.conceptId,
    } as GeneratedMathProblem);
    setSource(served.source);
  };

  // The first server question. Runs once the learner id is known; until then
  // the locally generated problem from `useState` is on screen, so the modal
  // always opens with something rather than a spinner.
  useEffect(() => {
    if (!useServer) return;
    let cancelled = false;
    practice
      .next()
      .then(served => {
        if (!cancelled) adoptServerQuestion(served);
      })
      .catch(() => {
        // Offline, or the server refused. The generated question already on
        // screen stands, and practice continues.
        if (!cancelled) setSource('generated');
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [useServer, learnerId]);

  const handleReadAloud = () => {
    if (isSpeaking) {
      stopSpeaking();
      setIsSpeaking(false);
    } else {
      setIsSpeaking(true);
      speakText(currentProblem.question, () => setIsSpeaking(false));
    }
  };

  const handleSelectOption = (opt: string) => {
    if (isAnswerSubmitted) return;
    playClickSound();
    setSelectedOption(opt);
  };

  const handleSubmitAnswer = async () => {
    const answer = currentProblem.options.length > 0 ? selectedOption : typedAnswer.trim();
    if (!answer || isAnswerSubmitted) return;

    if (useServer && practice.question) {
      // Correctness is decided by the server, from the stored problem. The
      // client never learns the answer before the learner has committed to one.
      try {
        const outcome = await practice.submit(answer);

        if (isQueued(outcome)) {
          /*
           * Kept, not marked. No streak, no coins and no confetti: those are
           * rewards for a correct answer, and nobody has checked this one yet.
           * They arrive with the rest of the child's progress when the queue
           * drains.
           */
          setSelectedOption(answer);
          setIsAnswerSubmitted(true);
          setAwaitingMark(true);
          return;
        }

        setSelectedOption(answer);
        setIsCorrect(outcome.isCorrect);
        setIsAnswerSubmitted(true);
        setExplanation(outcome.explanation);
        setCurrentProblem(prev => ({ ...prev, correctAnswer: outcome.correctAnswer }));
        setDetectedMisconception((outcome.misconceptionCode as MisconceptionCode) ?? null);

        if (outcome.isCorrect) {
          playSuccessSound();
          const newStreak = streak + 1;
          setStreak(newStreak);
          setSolvedCount(prev => prev + 1);
          setEarnedCoins(prev => prev + 3);
          if (newStreak > 0 && newStreak % 5 === 0) {
            confetti({ particleCount: 60, spread: 60, origin: { y: 0.6 } });
            playLevelUpFanfare();
          }
        } else {
          playErrorSound();
          setStreak(0);
        }

        // The server holds the authoritative ability estimate; mirror it so the
        // meters on screen agree with what was recorded.
        setAbilityProfile(prev => ({
          ...prev,
          theta: outcome.ability.theta,
          dynamicLevel: outcome.ability.dynamicLevel,
          eloRating: outcome.ability.eloRating,
          historyCount: outcome.ability.answered,
        }));
        onUpdateUserProfile({
          dynamicLevel: outcome.ability.dynamicLevel,
          eloRating: outcome.ability.eloRating,
        });
        return;
      } catch {
        /*
         * A refusal the server issued, rather than the network failing —
         * `usePractice.submit` queues the second kind and only rethrows the
         * first. Falling through to local marking is still better than stranding
         * the learner mid-question, and for a generated problem the client does
         * know the answer.
         */
      }
    }

    const correct = answer === currentProblem.correctAnswer;
    setSelectedOption(answer);
    setIsCorrect(correct);
    setIsAnswerSubmitted(true);

    let misCode: MisconceptionCode | null = null;
    if (!correct) {
      misCode = currentProblem.distractorDiagnostics[selectedOption] || 'GENERAL_CALCULATION_SLIP';
      setDetectedMisconception(misCode);
      playErrorSound();
      setStreak(0);
    } else {
      setDetectedMisconception(null);
      playSuccessSound();
      const newStreak = streak + 1;
      setStreak(newStreak);
      setSolvedCount(prev => prev + 1);
      setEarnedCoins(prev => prev + 3);

      if (newStreak > 0 && newStreak % 5 === 0) {
        confetti({ particleCount: 60, spread: 60, origin: { y: 0.6 } });
        playLevelUpFanfare();
      }
    }

    // Update IRT Ability via background worker (avoids UI hitching on Chromebooks)
    adaptiveWorkerClient.updateAbilityAsync(abilityProfile, {
      itemParams: currentProblem.irtParameters,
      isCorrect: correct,
      misconceptionCode: misCode
    }).then(updatedProfile => {
      setAbilityProfile(updatedProfile);

      // Sync state back to parent profile
      onUpdateUserProfile({
        dynamicLevel: updatedProfile.dynamicLevel,
        eloRating: updatedProfile.eloRating,
        coins: user.coins + (correct ? 3 : 0)
      });
    }).catch(() => {
      // Local fallback
      const fallbackProfile = AdaptiveEngine.updateAbility(abilityProfile, {
        itemParams: currentProblem.irtParameters,
        isCorrect: correct,
        misconceptionCode: misCode
      });
      setAbilityProfile(fallbackProfile);
      onUpdateUserProfile({
        dynamicLevel: fallbackProfile.dynamicLevel,
        eloRating: fallbackProfile.eloRating,
        coins: user.coins + (correct ? 3 : 0)
      });
    });

    /*
     * A call to `apiService.syncBatch([...])` stood here, posting a
     * `LESSON_ATTEMPT` to `/api/sync/batch`.
     *
     * That endpoint writes to `server/db.ts` — the JSON-file store this product
     * used before the MySQL migration — which nothing migrated reads. So the
     * write happened and then sat where no dashboard, report or analytic would
     * ever find it.
     *
     * This branch is the local generator, whose problems have no row in
     * `problems`, so there is nothing for an `attempts` foreign key to point at:
     * generated practice genuinely cannot be recorded until a generated problem
     * is persisted first. Recorded as a gap rather than papered over with a
     * write to the wrong database.
     */

  };

  const handleNextProblem = async () => {
    stopSpeaking();
    setIsSpeaking(false);
    setIsAnswerSubmitted(false);
    setAwaitingMark(false);
    setSelectedOption(null);
    setTypedAnswer('');
    setDetectedMisconception(null);
    setExplanation(null);

    if (useServer) {
      try {
        adoptServerQuestion(await practice.next());
        return;
      } catch {
        // Offline. Keep practising on generated content.
      }
    }

    setCurrentProblem(ProblemGenerator.generate(user.tier, abilityProfile.theta));
    setSource('generated');
  };

  const getMisconceptionLabel = (code: MisconceptionCode): string => {
    switch (code) {
      case 'SIGN_ERROR':
        return 'Signs rule slipped (negative/positive inversion)';
      case 'ORDER_OF_OPERATIONS':
        return 'PEMDAS order of operations evaluated prematurely';
      case 'INVERTED_FRACTION':
        return 'Numerator and denominator roles were transposed';
      case 'ADDITIVE_INSTEAD_OF_MULTIPLICATIVE':
        return 'Treated multiplication/area as simple addition/perimeter';
      case 'OFF_BY_ONE_COUNTING':
        return 'Off-by-one counting boundary discrepancy';
      case 'COORDINATE_AXIS_SWAP':
        return 'Horizontal (x) and vertical (y) axes were swapped';
      case 'DISTRIBUTIVE_OMISSION':
        return 'Partial factor was omitted during distribution';
      case 'RECIPROCAL_MISAPPLIED':
        return 'Reciprocal ratio was applied inversely';
      default:
        return 'Arithmetic calculation step slip';
    }
  };

  return (
    <div
      role="dialog"
      aria-label="Adaptive practice session"
      tabIndex={-1}
      className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-200">
      <div className="bg-white rounded-3xl max-w-3xl w-full max-h-[94vh] flex flex-col shadow-2xl border border-slate-200 overflow-hidden">
        {/* Top Header */}
        <div className="px-5 py-4 bg-slate-900 text-white flex items-center justify-between shadow-xs">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-indigo-600/30 border border-indigo-400/30 flex items-center justify-center text-indigo-300">
              <Zap className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="font-bold text-base sm:text-lg">Infinite Adaptive Practice</h2>
                <span className="text-[10px] uppercase tracking-wider font-extrabold px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 flex items-center gap-1">
                  <Activity className="w-3 h-3" /> CAT 3PL
                </span>
              </div>
              <p className="text-xs text-slate-300">
                {currentProblem.topicDomain} • {currentProblem.standardCode}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* Live Theta / Dynamic Level */}
            <div className="hidden sm:flex flex-col items-end px-3 py-1 bg-slate-800 rounded-xl border border-slate-700 text-right">
              <div className="text-[10px] text-slate-400 font-mono">
                θ Ability: {abilityProfile.theta >= 0 ? `+${abilityProfile.theta.toFixed(2)}` : abilityProfile.theta.toFixed(2)}
              </div>
              <div className="text-xs font-bold text-emerald-400">
                Level {abilityProfile.dynamicLevel.toFixed(1)} ({abilityProfile.eloRating} ELO)
              </div>
            </div>

            <button
              onClick={() => {
                stopSpeaking();
                onClose();
              }}
              className="p-2 hover:bg-slate-800 text-slate-400 hover:text-white rounded-xl transition cursor-pointer"
              title="Close Practice"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Stats Bar */}
        <div className="px-5 py-2.5 bg-slate-50 border-b border-slate-200 flex items-center justify-between text-xs font-semibold text-slate-600">
          <div className="flex items-center gap-4">
            <span>Problems Solved: <strong>{solvedCount}</strong></span>
            {streak > 1 && (
              <span className="flex items-center gap-1 text-amber-600 font-bold">
                <Flame className="w-3.5 h-3.5 fill-amber-500 text-amber-500" />
                {streak}x Streak!
              </span>
            )}
            <span className="text-emerald-700 flex items-center gap-1">
              <Sparkles className="w-3.5 h-3.5" /> +{earnedCoins} Coins
            </span>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowCoach(true)}
              className="px-3 py-1 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 rounded-xl text-xs font-bold flex items-center gap-1.5 transition cursor-pointer"
            >
              <Bot className="w-3.5 h-3.5" />
              <span>Ask AI Coach</span>
            </button>
          </div>
        </div>

        {/* Body Content */}
        <div className="p-4 sm:p-6 overflow-y-auto flex-1 flex flex-col gap-4">
          {/* Question Box */}
          <div className="bg-slate-50 rounded-2xl p-4 sm:p-5 border border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex-1">
              <div className="text-[11px] font-bold text-indigo-600 uppercase tracking-wider mb-1">
                Target Difficulty: {currentProblem.irtParameters.difficulty >= 0 ? `+${currentProblem.irtParameters.difficulty.toFixed(1)}` : currentProblem.irtParameters.difficulty.toFixed(1)}
              </div>
              <h3 className="text-base sm:text-lg font-bold text-slate-900 leading-snug">
                <BilingualTextHighlighter
                  text={currentProblem.question}
                  onOpenGlossary={onOpenGlossary}
                />
              </h3>
            </div>

            <div className="flex items-center gap-2 shrink-0 self-end sm:self-center">
              <button
                onClick={handleReadAloud}
                className={`p-2.5 rounded-xl border flex items-center gap-1.5 text-xs font-bold transition shadow-xs cursor-pointer ${
                  isSpeaking
                    ? 'bg-amber-500 text-white border-amber-600 animate-pulse'
                    : 'bg-white hover:bg-slate-100 text-slate-700 border-slate-200'
                }`}
              >
                {isSpeaking ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4 text-indigo-600" />}
                <span className="hidden sm:inline">{isSpeaking ? 'Stop' : 'Read'}</span>
              </button>

              <button
                onClick={() => setShowScratchpad(true)}
                className="p-2.5 rounded-xl border bg-white hover:bg-slate-100 text-slate-700 border-slate-200 flex items-center gap-1.5 text-xs font-bold transition shadow-xs cursor-pointer"
              >
                <PenTool className="w-4 h-4 text-indigo-600" />
                <span className="hidden sm:inline">Draw</span>
              </button>
            </div>
          </div>

          {/* Manipulative Preview */}
          <div className="w-full">
            <MathManipulatives problem={currentProblem} />
          </div>

          {/* A typed answer, for the authored problems that offer no choices.
              Two thirds of the imported corpus is numeric — the whole fractions
              strand is — so a multiple-choice-only card could not show it. */}
          {currentProblem.options.length === 0 && (
            <div className="flex flex-col gap-2">
              <label htmlFor="typed-answer" className="text-xs font-bold text-slate-600">
                Your answer
              </label>
              <input
                id="typed-answer"
                type="text"
                inputMode="text"
                autoComplete="off"
                value={typedAnswer}
                disabled={isAnswerSubmitted}
                onChange={event => setTypedAnswer(event.target.value)}
                onKeyDown={event => {
                  if (event.key === 'Enter' && !isAnswerSubmitted) handleSubmitAnswer();
                }}
                placeholder="Type your answer"
                className={`w-full px-4 py-3 rounded-xl border-2 text-lg font-bold tracking-tight transition outline-hidden ${
                  !isAnswerSubmitted
                    ? 'bg-white border-slate-200 focus:border-indigo-500 text-slate-900'
                    : awaitingMark
                      ? 'bg-slate-50 border-slate-400 text-slate-900'
                      : isCorrect
                        ? 'bg-emerald-50 border-emerald-500 text-emerald-900'
                        : 'bg-rose-50 border-rose-500 text-rose-900'
                }`}
              />
              {isAnswerSubmitted && !awaitingMark && !isCorrect && currentProblem.correctAnswer && (
                <p className="text-xs font-bold text-emerald-700">
                  Correct answer: {currentProblem.correctAnswer}
                </p>
              )}
            </div>
          )}

          {/* Options Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {currentProblem.options.map((opt, i) => {
              const isSelected = selectedOption === opt;
              let btnStyle = 'bg-white border-slate-200 hover:border-indigo-400 hover:bg-indigo-50/40 text-slate-800';

              if (isAnswerSubmitted && awaitingMark) {
                // Nothing is revealed: the client does not know the answer, and
                // dimming everything but the child's choice would imply one.
                btnStyle = isSelected
                  ? 'bg-slate-100 border-slate-400 text-slate-900 ring-2 ring-slate-300 font-bold'
                  : 'bg-slate-50 border-slate-200 text-slate-400 opacity-60';
              } else if (isAnswerSubmitted) {
                if (opt === currentProblem.correctAnswer) {
                  btnStyle = 'bg-emerald-50 border-emerald-500 text-emerald-900 ring-2 ring-emerald-400 font-bold';
                } else if (isSelected && !isCorrect) {
                  btnStyle = 'bg-rose-50 border-rose-500 text-rose-900 ring-2 ring-rose-400 font-bold';
                } else {
                  btnStyle = 'bg-slate-50 border-slate-200 text-slate-400 opacity-60';
                }
              } else if (isSelected) {
                btnStyle = 'bg-indigo-50 border-indigo-600 text-indigo-900 ring-2 ring-indigo-500 font-bold';
              }

              return (
                <button
                  key={i}
                  onClick={() => handleSelectOption(opt)}
                  disabled={isAnswerSubmitted}
                  className={`min-h-[50px] p-4 rounded-xl border-2 text-left font-medium text-base transition flex items-center justify-between cursor-pointer ${btnStyle}`}
                >
                  <span className="font-mono">{opt}</span>
                  {isAnswerSubmitted && !awaitingMark && opt === currentProblem.correctAnswer && (
                    <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
                  )}
                  {isAnswerSubmitted && !awaitingMark && isSelected && !isCorrect && (
                    <AlertCircle className="w-5 h-5 text-rose-600 shrink-0" />
                  )}
                </button>
              );
            })}
          </div>

          {/* Kept, not marked. */}
          {isAnswerSubmitted && awaitingMark && (
            <div
              role="status"
              className="p-4 rounded-2xl border text-sm animate-in fade-in bg-slate-50 border-slate-300 text-slate-800"
            >
              <div className="flex items-center gap-2 font-bold mb-1.5">
                <Clock className="w-5 h-5 text-slate-500" />
                <span>Answer saved on this device</span>
              </div>
              <p className="text-xs sm:text-sm leading-relaxed opacity-90">
                We cannot mark it until this device can reach the server again. Your answer is kept
                safely and will be marked automatically — nothing is lost.
              </p>
            </div>
          )}

          {/* Diagnostic Misconception & Explanation */}
          {isAnswerSubmitted && !awaitingMark && (
            <div className={`p-4 rounded-2xl border text-sm animate-in fade-in ${
              isCorrect ? 'bg-emerald-50/90 border-emerald-300 text-emerald-950' : 'bg-rose-50/90 border-rose-300 text-rose-950'
            }`}>
              <div className="flex items-center justify-between gap-2 mb-1.5">
                <div className="flex items-center gap-2 font-bold">
                  {isCorrect ? (
                    <>
                      <CheckCircle2 className="w-5 h-5 text-emerald-600" />
                      <span>Outstanding Precision! Correct!</span>
                    </>
                  ) : (
                    <>
                      <AlertCircle className="w-5 h-5 text-rose-600" />
                      <span>Not quite, let&apos;s analyze why:</span>
                    </>
                  )}
                </div>

                {!isCorrect && detectedMisconception && (
                  <button
                    onClick={() => setShowCoach(true)}
                    className="px-3 py-1 bg-white hover:bg-rose-100 text-rose-700 border border-rose-200 rounded-xl text-xs font-bold flex items-center gap-1.5 shadow-xs cursor-pointer"
                  >
                    <Bot className="w-3.5 h-3.5" />
                    <span>Explain With Coach →</span>
                  </button>
                )}
              </div>

              {!isCorrect && detectedMisconception && (
                <div className="text-xs font-semibold text-rose-800 bg-white/70 px-3 py-1.5 rounded-xl border border-rose-200 mb-2">
                  <strong>Diagnostic Clue:</strong> {getMisconceptionLabel(detectedMisconception)}
                </div>
              )}

              <p className="text-xs sm:text-sm leading-relaxed opacity-90">
                {explanation ?? currentProblem.explanation}
              </p>
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="p-4 bg-slate-50 border-t border-slate-200 flex items-center justify-between">
          <button
            onClick={() => setShowCoach(true)}
            className="px-4 py-2.5 bg-white hover:bg-slate-100 text-slate-700 border border-slate-300 rounded-xl text-xs font-bold flex items-center gap-1.5 cursor-pointer shadow-xs"
          >
            <HelpCircle className="w-4 h-4 text-amber-500" />
            <span>Socratic Clue</span>
          </button>

          {!isAnswerSubmitted ? (
            <button
              onClick={handleSubmitAnswer}
              disabled={
                (currentProblem.options.length > 0 ? !selectedOption : !typedAnswer.trim()) ||
                practice.isSubmitting
              }
              className="px-6 py-2.5 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-40 text-white rounded-xl font-bold text-xs sm:text-sm transition flex items-center gap-2 cursor-pointer shadow-xs"
            >
              <span>Submit Answer</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          ) : (
            <button
              onClick={handleNextProblem}
              className="px-6 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-bold text-xs sm:text-sm transition flex items-center gap-2 cursor-pointer shadow-xs"
            >
              <span>Next Adaptive Question</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      {/* Socratic Coach Modal */}
      {showCoach && (
        <SocraticCoachModal
          isOpen={showCoach}
          onClose={() => setShowCoach(false)}
          problemQuestion={currentProblem.question}
          options={currentProblem.options}
          correctAnswer={currentProblem.correctAnswer}
          studentAnswer={selectedOption}
          studentAge={user.age}
          tier={user.tier}
          hint={currentProblem.hint}
          explanation={explanation ?? currentProblem.explanation}
          misconceptionDescription={detectedMisconception ? getMisconceptionLabel(detectedMisconception) : null}
        />
      )}

      {/* Scratchpad Modal */}
      {showScratchpad && (
        <Scratchpad
          isOpen={showScratchpad}
          onClose={() => setShowScratchpad(false)}
          title={`Scratchpad • ${currentProblem.topicDomain}`}
        />
      )}
    </div>
  );
};
