import React, { useState, useEffect } from 'react';
import { playClickSound, playSuccessSound, speakText } from '../../utils/audio';
import {
  RotateCcw,
  Sparkles,
  Volume2,
  CheckCircle2,
  Eye,
  Zap,
  HelpCircle,
  Plus,
  Minus
} from 'lucide-react';

/* ==========================================================================
   1. TEN-FRAME COUNTER LAB (Ages 3–5)
   ========================================================================== */

type TokenType = 'star' | 'apple' | 'circle';

export const TenFrameLab: React.FC = () => {
  // 10 slots: 0 to 9. Value: null | 'red' | 'yellow'
  const [frame, setFrame] = useState<( 'red' | 'yellow' | null)[]>([
    'red', 'red', 'red', null, null,
    null, null, null, null, null
  ]);
  const [tokenColor, setTokenColor] = useState<'red' | 'yellow'>('red');
  const [tokenType, setTokenType] = useState<TokenType>('star');
  const [challengeTarget, setChallengeTarget] = useState<number | null>(7);
  const [feedback, setFeedback] = useState<string | null>(null);

  const redCount = frame.filter(c => c === 'red').length;
  const yellowCount = frame.filter(c => c === 'yellow').length;
  const totalCount = redCount + yellowCount;
  const emptySlots = 10 - totalCount;

  const toggleSlot = (index: number) => {
    playClickSound();
    setFrame(prev => {
      const next = [...prev];
      if (next[index] === null) {
        next[index] = tokenColor;
      } else if (next[index] === tokenColor) {
        next[index] = null;
      } else {
        next[index] = tokenColor;
      }
      return next;
    });
  };

  const handleFill = (count: number) => {
    playClickSound();
    const newFrame: ('red' | 'yellow' | null)[] = Array(10).fill(null);
    for (let i = 0; i < Math.min(count, 10); i++) {
      newFrame[i] = tokenColor;
    }
    setFrame(newFrame);
  };

  const handleClear = () => {
    playClickSound();
    setFrame(Array(10).fill(null));
    setFeedback(null);
  };

  const checkChallenge = () => {
    if (challengeTarget === null) return;
    if (totalCount === challengeTarget) {
      playSuccessSound();
      setFeedback(`Fantastic! You made ${totalCount} counters! 🌟`);
      speakText(`Great job! You made ${totalCount}!`);
    } else if (totalCount < challengeTarget) {
      playClickSound();
      const diff = challengeTarget - totalCount;
      setFeedback(`Add ${diff} more to reach ${challengeTarget}!`);
      speakText(`Add ${diff} more!`);
    } else {
      playClickSound();
      const diff = totalCount - challengeTarget;
      setFeedback(`Remove ${diff} to reach ${challengeTarget}!`);
      speakText(`Remove ${diff}!`);
    }
  };

  const generateNewChallenge = () => {
    playClickSound();
    const targets = [4, 5, 6, 7, 8, 9, 10];
    const next = targets[Math.floor(Math.random() * targets.length)];
    setChallengeTarget(next);
    setFeedback(null);
    speakText(`Can you make ${next} counters in the ten frame?`);
  };

  const renderIcon = (color: 'red' | 'yellow') => {
    if (tokenType === 'star') return color === 'red' ? '⭐' : '🌟';
    if (tokenType === 'apple') return color === 'red' ? '🍎' : '🍋';
    return color === 'red' ? '🔴' : '🟡';
  };

  return (
    <div className="bg-white rounded-3xl p-5 sm:p-7 border border-slate-200 shadow-sm space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-100 pb-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="px-2.5 py-1 rounded-full bg-rose-100 text-rose-800 text-xs font-bold">
              Ages 3–5
            </span>
            <span className="text-xs text-slate-500 font-semibold">Concrete Number Sense</span>
          </div>
          <h3 className="text-xl font-extrabold text-slate-900 mt-1">Ten-Frame Counter Lab</h3>
          <p className="text-xs text-slate-500">
            Click any box to add or remove counters. Observe pairs of 5 and bonds to 10.
          </p>
        </div>

        {/* Audio helper */}
        <button
          onClick={() => {
            playClickSound();
            speakText(`You have ${totalCount} counters. ${10 - totalCount} empty boxes make ten!`);
          }}
          className="p-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 transition cursor-pointer flex items-center gap-2 text-xs font-bold"
          title="Read current count out loud"
        >
          <Volume2 className="w-4 h-4 text-indigo-600" />
          <span>Speak Count</span>
        </button>
      </div>

      {/* Challenge Banner */}
      {challengeTarget !== null && (
        <div className="p-4 rounded-2xl bg-indigo-50 border border-indigo-200 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-indigo-600 text-white flex items-center justify-center font-extrabold text-lg shadow-sm">
              {challengeTarget}
            </div>
            <div>
              <div className="text-xs font-extrabold text-indigo-950">Target Challenge:</div>
              <div className="text-sm font-semibold text-indigo-800">
                Can you place exactly <span className="font-bold underline">{challengeTarget}</span> counters?
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={checkChallenge}
              className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold transition cursor-pointer shadow-xs"
            >
              Check My Answer
            </button>
            <button
              onClick={generateNewChallenge}
              className="px-3 py-2 rounded-xl bg-white hover:bg-slate-100 text-slate-700 border border-slate-300 text-xs font-bold transition cursor-pointer"
            >
              New Target
            </button>
          </div>
        </div>
      )}

      {feedback && (
        <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-300 text-emerald-800 text-xs font-bold flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
          <span>{feedback}</span>
        </div>
      )}

      {/* The 10-Frame Grid (2 rows of 5) */}
      <div className="bg-amber-50/70 p-4 sm:p-6 rounded-3xl border-2 border-amber-200 flex flex-col items-center">
        <div className="grid grid-cols-5 gap-2.5 sm:gap-3 w-full max-w-xl">
          {frame.map((token, idx) => (
            <button
              key={idx}
              onClick={() => toggleSlot(idx)}
              className={`h-16 sm:h-20 rounded-2xl border-2 flex items-center justify-center text-3xl sm:text-4xl transition-transform active:scale-95 cursor-pointer relative select-none ${
                token
                  ? 'border-indigo-400 bg-white shadow-sm'
                  : 'border-dashed border-amber-300 bg-white/60 hover:bg-white'
              }`}
              title={`Slot ${idx + 1}`}
            >
              <span className="absolute top-1 left-2 text-[10px] font-bold text-slate-300 pointer-events-none">
                {idx + 1}
              </span>
              {token && (
                <span className="animate-in zoom-in-50 duration-200">
                  {renderIcon(token)}
                </span>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Number Bond & Composition Bar */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="p-3.5 rounded-2xl bg-slate-50 border border-slate-200 text-center">
          <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Total In Frame</span>
          <div className="text-2xl font-extrabold text-slate-900 mt-0.5">{totalCount} / 10</div>
        </div>
        <div className="p-3.5 rounded-2xl bg-slate-50 border border-slate-200 text-center">
          <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Bond To Ten</span>
          <div className="text-xl font-extrabold text-indigo-700 mt-0.5">
            {totalCount} + {emptySlots} = 10
          </div>
        </div>
        <div className="p-3.5 rounded-2xl bg-slate-50 border border-slate-200 text-center">
          <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Color Split</span>
          <div className="text-xl font-extrabold text-slate-800 mt-0.5">
            🔴 {redCount} + 🟡 {yellowCount} = {totalCount}
          </div>
        </div>
      </div>

      {/* Interactive Controls & Palette */}
      <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
        {/* Token Color and Type */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl border border-slate-200">
            <button
              onClick={() => {
                playClickSound();
                setTokenColor('red');
              }}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer flex items-center gap-1.5 ${
                tokenColor === 'red' ? 'bg-rose-500 text-white shadow-xs' : 'text-slate-600 hover:bg-slate-200'
              }`}
            >
              <span>🔴 Red</span>
            </button>
            <button
              onClick={() => {
                playClickSound();
                setTokenColor('yellow');
              }}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer flex items-center gap-1.5 ${
                tokenColor === 'yellow' ? 'bg-amber-400 text-slate-900 shadow-xs' : 'text-slate-600 hover:bg-slate-200'
              }`}
            >
              <span>🟡 Yellow</span>
            </button>
          </div>

          <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl border border-slate-200">
            <button
              onClick={() => { playClickSound(); setTokenType('star'); }}
              className={`px-2.5 py-1.5 rounded-lg text-xs font-bold cursor-pointer ${
                tokenType === 'star' ? 'bg-white shadow-xs text-slate-900' : 'text-slate-500'
              }`}
            >
              ⭐ Stars
            </button>
            <button
              onClick={() => { playClickSound(); setTokenType('apple'); }}
              className={`px-2.5 py-1.5 rounded-lg text-xs font-bold cursor-pointer ${
                tokenType === 'apple' ? 'bg-white shadow-xs text-slate-900' : 'text-slate-500'
              }`}
            >
              🍎 Fruit
            </button>
            <button
              onClick={() => { playClickSound(); setTokenType('circle'); }}
              className={`px-2.5 py-1.5 rounded-lg text-xs font-bold cursor-pointer ${
                tokenType === 'circle' ? 'bg-white shadow-xs text-slate-900' : 'text-slate-500'
              }`}
            >
              🔵 Chips
            </button>
          </div>
        </div>

        {/* Quick Fill Actions */}
        <div className="flex flex-wrap items-center gap-1.5">
          <button
            onClick={() => handleFill(5)}
            className="px-3 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold transition cursor-pointer"
          >
            Fill 5
          </button>
          <button
            onClick={() => handleFill(10)}
            className="px-3 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold transition cursor-pointer"
          >
            Fill 10
          </button>
          <button
            onClick={handleClear}
            className="px-3 py-1.5 rounded-xl border border-slate-300 hover:bg-slate-100 text-slate-600 text-xs font-bold transition cursor-pointer flex items-center gap-1"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>Clear</span>
          </button>
        </div>
      </div>
    </div>
  );
};

/* ==========================================================================
   2. RAPID SUBITIZING DOT FLASH LAB (Ages 3–5)
   ========================================================================== */

export const SubitizingLab: React.FC = () => {
  const [dotCount, setDotCount] = useState<number>(4);
  const [isRevealed, setIsRevealed] = useState<boolean>(true);
  const [flashSpeedMs, setFlashSpeedMs] = useState<number>(600);
  const [scoreStreak, setScoreStreak] = useState<number>(0);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [dotPattern, setDotPattern] = useState<'dice' | 'tenframe' | 'scattered'>('dice');

  // Generate random dot positions
  const [dots, setDots] = useState<{ x: number; y: number }[]>([]);

  useEffect(() => {
    generatePattern(dotCount, dotPattern);
  }, [dotCount, dotPattern]);

  const generatePattern = (count: number, pattern: 'dice' | 'tenframe' | 'scattered') => {
    if (pattern === 'dice') {
      // Standard dice/card layouts
      const diceCoords: Record<number, { x: number; y: number }[]> = {
        1: [{ x: 50, y: 50 }],
        2: [{ x: 30, y: 30 }, { x: 70, y: 70 }],
        3: [{ x: 30, y: 30 }, { x: 50, y: 50 }, { x: 70, y: 70 }],
        4: [{ x: 30, y: 30 }, { x: 70, y: 30 }, { x: 30, y: 70 }, { x: 70, y: 70 }],
        5: [{ x: 30, y: 30 }, { x: 70, y: 30 }, { x: 50, y: 50 }, { x: 30, y: 70 }, { x: 70, y: 70 }],
        6: [{ x: 30, y: 25 }, { x: 70, y: 25 }, { x: 30, y: 50 }, { x: 70, y: 50 }, { x: 30, y: 75 }, { x: 70, y: 75 }],
        7: [{ x: 30, y: 25 }, { x: 70, y: 25 }, { x: 50, y: 40 }, { x: 30, y: 55 }, { x: 70, y: 55 }, { x: 30, y: 75 }, { x: 70, y: 75 }],
        8: [{ x: 30, y: 20 }, { x: 70, y: 20 }, { x: 30, y: 40 }, { x: 70, y: 40 }, { x: 30, y: 60 }, { x: 70, y: 60 }, { x: 30, y: 80 }, { x: 70, y: 80 }]
      };
      setDots(diceCoords[count] || [{ x: 50, y: 50 }]);
    } else if (pattern === 'tenframe') {
      const arr: { x: number; y: number }[] = [];
      for (let i = 0; i < count; i++) {
        const col = i % 5;
        const row = Math.floor(i / 5);
        arr.push({ x: 20 + col * 15, y: 35 + row * 30 });
      }
      setDots(arr);
    } else {
      // scattered random positions within 20% to 80%
      const arr: { x: number; y: number }[] = [];
      for (let i = 0; i < count; i++) {
        arr.push({
          x: Math.round(20 + Math.random() * 60),
          y: Math.round(20 + Math.random() * 60)
        });
      }
      setDots(arr);
    }
  };

  const triggerFlash = () => {
    playClickSound();
    const nextCount = Math.floor(Math.random() * 7) + 1; // 1 to 7
    setDotCount(nextCount);
    generatePattern(nextCount, dotPattern);
    setIsRevealed(true);
    setFeedback(null);

    // Flash timer: hide after flashSpeedMs
    setTimeout(() => {
      setIsRevealed(false);
    }, flashSpeedMs);
  };

  const handleGuess = (guess: number) => {
    playClickSound();
    if (guess === dotCount) {
      playSuccessSound();
      setScoreStreak(prev => prev + 1);
      setFeedback(`Correct! Exactly ${dotCount} dots! 🎯`);
      setIsRevealed(true);
      speakText(`Yes! That was ${dotCount}!`);
    } else {
      setScoreStreak(0);
      setFeedback(`Not quite. There were ${dotCount} dots. Look closely!`);
      setIsRevealed(true);
      speakText(`That was ${dotCount}. Look!`);
    }
  };

  return (
    <div className="bg-white rounded-3xl p-5 sm:p-7 border border-slate-200 shadow-sm space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-100 pb-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="px-2.5 py-1 rounded-full bg-emerald-100 text-emerald-800 text-xs font-bold">
              Ages 3–5
            </span>
            <span className="text-xs text-slate-500 font-semibold">Perceptual Subitizing</span>
          </div>
          <h3 className="text-xl font-extrabold text-slate-900 mt-1">Rapid Dot Flash Lab</h3>
          <p className="text-xs text-slate-500">
            Recognize the quantity instantly without counting one by one!
          </p>
        </div>

        <div className="flex items-center gap-2">
          <div className="px-3 py-1.5 rounded-full bg-amber-50 border border-amber-200 text-amber-900 text-xs font-extrabold flex items-center gap-1.5">
            <Zap className="w-3.5 h-3.5 text-amber-500" />
            <span>Streak: {scoreStreak}</span>
          </div>
        </div>
      </div>

      {/* Flash Card Stage */}
      <div className="flex flex-col items-center">
        <div className="relative w-full max-w-sm h-64 rounded-3xl bg-indigo-950 border-4 border-indigo-800 shadow-inner flex items-center justify-center overflow-hidden">
          {isRevealed ? (
            <div className="relative w-full h-full">
              {dots.map((d, i) => (
                <div
                  key={i}
                  className="absolute w-9 h-9 sm:w-11 sm:h-11 rounded-full bg-amber-400 border-2 border-amber-200 shadow-md transform -translate-x-1/2 -translate-y-1/2 flex items-center justify-center animate-in zoom-in-75 duration-150"
                  style={{ left: `${d.x}%`, top: `${d.y}%` }}
                >
                  <div className="w-3 h-3 rounded-full bg-amber-200" />
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center p-6 space-y-2">
              <Eye className="w-10 h-10 text-indigo-400 mx-auto animate-pulse" />
              <div className="text-indigo-200 text-sm font-extrabold">How many dots did you see?</div>
              <p className="text-[11px] text-indigo-400">Pick a number below!</p>
            </div>
          )}
        </div>

        {/* Trigger Button */}
        <div className="mt-4 flex items-center gap-3">
          <button
            onClick={triggerFlash}
            className="px-6 py-3 rounded-2xl bg-indigo-600 hover:bg-indigo-700 text-white font-extrabold text-sm shadow-md transition-all active:scale-95 cursor-pointer flex items-center gap-2"
          >
            <Sparkles className="w-4 h-4 text-amber-300" />
            <span>Flash New Dots!</span>
          </button>
          <button
            onClick={() => setIsRevealed(prev => !prev)}
            className="px-4 py-3 rounded-2xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs transition cursor-pointer flex items-center gap-1.5 border border-slate-200"
          >
            <Eye className="w-4 h-4" />
            <span>{isRevealed ? 'Hide' : 'Reveal'}</span>
          </button>
        </div>
      </div>

      {feedback && (
        <div className={`p-3 rounded-xl text-xs font-bold text-center ${
          feedback.startsWith('Correct')
            ? 'bg-emerald-50 border border-emerald-300 text-emerald-800'
            : 'bg-amber-50 border border-amber-300 text-amber-800'
        }`}>
          {feedback}
        </div>
      )}

      {/* Guess Buttons (1 to 7) */}
      <div className="space-y-2">
        <span className="text-xs font-bold text-slate-400 uppercase tracking-wider block text-center">
          Tap Your Guess:
        </span>
        <div className="flex flex-wrap items-center justify-center gap-2">
          {[1, 2, 3, 4, 5, 6, 7].map(num => (
            <button
              key={num}
              onClick={() => handleGuess(num)}
              className="w-12 h-12 rounded-2xl bg-slate-100 hover:bg-indigo-600 hover:text-white text-slate-800 font-extrabold text-lg transition-colors cursor-pointer border border-slate-200 active:scale-95 shadow-xs"
            >
              {num}
            </button>
          ))}
        </div>
      </div>

      {/* Speed and Pattern Settings */}
      <div className="pt-4 border-t border-slate-100 flex flex-wrap items-center justify-between gap-4 text-xs">
        <div className="flex items-center gap-2">
          <span className="font-bold text-slate-500">Flash Speed:</span>
          <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl">
            {[
              { label: 'Slow (1s)', ms: 1000 },
              { label: 'Medium (0.6s)', ms: 600 },
              { label: 'Fast (0.3s)', ms: 300 }
            ].map(s => (
              <button
                key={s.ms}
                onClick={() => { playClickSound(); setFlashSpeedMs(s.ms); }}
                className={`px-2.5 py-1 rounded-lg font-bold cursor-pointer transition ${
                  flashSpeedMs === s.ms ? 'bg-white text-indigo-700 shadow-2xs' : 'text-slate-500'
                }`}
              >
                {s.label}
              </button>
            ))}
          </div>
        </div>

        <div className="flex items-center gap-2">
          <span className="font-bold text-slate-500">Pattern:</span>
          <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl">
            {[
              { id: 'dice', label: 'Dice' },
              { id: 'tenframe', label: 'Ten-Frame' },
              { id: 'scattered', label: 'Random' }
            ].map(p => (
              <button
                key={p.id}
                onClick={() => { playClickSound(); setDotPattern(p.id as any); }}
                className={`px-2.5 py-1 rounded-lg font-bold cursor-pointer transition ${
                  dotPattern === p.id ? 'bg-white text-indigo-700 shadow-2xs' : 'text-slate-500'
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};
