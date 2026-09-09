import React, { useState } from 'react';
import { Clock, Lock, Sparkles, KeyRound, AlertCircle } from 'lucide-react';
import { apiService } from '../services/api';
import { playClickSound, playSuccessSound, playErrorSound } from '../utils/audio';

interface ScreenTimeLockModalProps {
  isOpen: boolean;
  studentName: string;
  todayMinutes: number;
  limitMinutes: number;
  studentId: string;
  onUnlocked: () => void;
}

export const ScreenTimeLockModal: React.FC<ScreenTimeLockModalProps> = ({
  isOpen,
  studentName,
  todayMinutes,
  limitMinutes,
  studentId,
  onUnlocked
}) => {
  const [showOverride, setShowOverride] = useState(false);
  const [parentPin, setParentPin] = useState('');
  const [overrideMinutes, setOverrideMinutes] = useState(30);
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (!isOpen) return null;

  const handleUnlock = async () => {
    if (!parentPin) {
      setError('Please enter the 4-digit Parent PIN');
      return;
    }
    setIsSubmitting(true);
    setError('');
    try {
      const res = await apiService.unlockScreenTime(studentId, parentPin, overrideMinutes);
      if (res.success) {
        playSuccessSound();
        setShowOverride(false);
        setParentPin('');
        onUnlocked();
      } else {
        playErrorSound();
        setError(res.error || 'Incorrect Parent PIN');
      }
    } catch {
      playErrorSound();
      setError('Network error unlocking session');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div
      role="dialog"
      aria-label="Screen time limit reached"
      tabIndex={-1}
      className="fixed inset-0 bg-slate-950/85 backdrop-blur-md flex items-center justify-center p-4 z-50 animate-fadeIn">
      <div className="bg-white rounded-3xl max-w-md w-full p-6 sm:p-8 shadow-2xl border border-slate-200 text-center relative overflow-hidden">
        {/* Animated Badge */}
        <div className="w-16 h-16 rounded-3xl bg-amber-50 text-amber-600 flex items-center justify-center mx-auto mb-4 border border-amber-200 shadow-sm animate-bounce">
          <Clock className="w-8 h-8" />
        </div>

        <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-indigo-50 text-indigo-700 text-xs font-black uppercase tracking-wider mb-2">
          <Sparkles className="w-3.5 h-3.5 text-indigo-600" />
          <span>Server Screen Time Guard</span>
        </div>

        <h3 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight">
          Great Math Work Today, {studentName}!
        </h3>
        <p className="text-xs sm:text-sm text-slate-500 mt-2 max-w-xs mx-auto">
          You have reached your daily math goal of <strong className="text-slate-800">{limitMinutes} minutes</strong> ({Math.round(todayMinutes)} mins recorded). Time to rest your eyes or play outdoors!
        </p>

        {/* Progress Bar */}
        <div className="my-5 p-4 rounded-2xl bg-slate-50 border border-slate-200 text-left">
          <div className="flex justify-between text-xs font-bold text-slate-700 mb-1.5">
            <span>Today's Time</span>
            <span>{Math.round(todayMinutes)} / {limitMinutes} mins</span>
          </div>
          <div className="w-full h-3 bg-slate-200 rounded-full overflow-hidden">
            <div className="h-full bg-gradient-to-r from-amber-500 to-rose-500 w-full rounded-full" />
          </div>
        </div>

        {/* Parent Override Section */}
        {!showOverride ? (
          <button
            onClick={() => {
              playClickSound();
              setShowOverride(true);
            }}
            className="flex items-center justify-center gap-2 mx-auto text-xs font-bold text-slate-500 hover:text-indigo-600 transition cursor-pointer py-2 px-4 rounded-xl hover:bg-slate-100"
          >
            <Lock className="w-3.5 h-3.5" />
            <span>Parent Override</span>
          </button>
        ) : (
          <div className="mt-4 p-4 rounded-2xl bg-indigo-50/70 border border-indigo-100 text-left">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-black text-indigo-900 flex items-center gap-1">
                <KeyRound className="w-3.5 h-3.5 text-indigo-600" />
                Parent PIN Override
              </span>
              <button
                onClick={() => setShowOverride(false)}
                className="text-[11px] font-bold text-slate-400 hover:text-slate-600 cursor-pointer"
              >
                Cancel
              </button>
            </div>

            <div className="flex items-center gap-2 mb-2">
              <input
                type="password"
                maxLength={4}
                value={parentPin}
                onChange={(e) => {
                  setParentPin(e.target.value);
                  setError('');
                }}
                placeholder="PIN (1234)"
                className="flex-1 text-xs p-2 rounded-xl border border-slate-300 bg-white font-mono"
              />
              <select
                value={overrideMinutes}
                onChange={(e) => setOverrideMinutes(Number(e.target.value))}
                className="text-xs p-2 rounded-xl border border-slate-300 bg-white font-bold"
              >
                <option value={15}>+15 mins</option>
                <option value={30}>+30 mins</option>
                <option value={60}>+60 mins</option>
              </select>
            </div>

            {error && (
              <div className="flex items-center gap-1 text-rose-600 text-[11px] font-bold mb-2">
                <AlertCircle className="w-3 h-3" />
                <span>{error}</span>
              </div>
            )}

            <button
              onClick={handleUnlock}
              disabled={isSubmitting}
              className="w-full py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs transition cursor-pointer"
            >
              {isSubmitting ? 'Verifying...' : 'Authorize Additional Time'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
