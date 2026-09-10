import React, { useState } from 'react';

import { useModalA11y } from '../hooks/useModalA11y';
import { ShieldCheck, X, Lock, KeyRound, AlertCircle } from 'lucide-react';
import { useStepUp, useStepUpStatus } from '../hooks/useStepUp';
import { playClickSound, playErrorSound, playSuccessSound } from '../utils/audio';

interface ParentPinModalProps {
  isOpen: boolean;
  targetRole: 'parent' | 'teacher' | 'admin';
  onSuccess: () => void;
  onClose: () => void;
}

export const ParentPinModal: React.FC<ParentPinModalProps> = ({
  isOpen,
  targetRole,
  onSuccess,
  onClose
}) => {
  const [pin, setPin] = useState('');
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Called before the early return, because hooks cannot be conditional.
  const panelRef = useModalA11y(isOpen, onClose);
  const { hasPin, isLoading } = useStepUpStatus();
  const { elevate, setPin: choosePin, isWorking } = useStepUp();

  if (!isOpen) return null;

  /**
   * A guardian who has never chosen a PIN is asked to choose one.
   *
   * The alternative — refusing them until they find a settings page — locks a
   * parent out of their own child's records on the strength of a step they were
   * never prompted to take. Choosing the PIN proves an adult is present just as
   * well as entering one does, and the server elevates on the same request.
   */
  const isChoosing = hasPin === false;

  const heading = isChoosing
    ? 'Choose a Parent PIN'
    : targetRole === 'parent'
      ? 'Parent Authorization Required'
      : targetRole === 'teacher'
        ? 'Educator PIN Required'
        : 'District Administrator PIN Required';

  const description = isChoosing
    ? 'This PIN separates you from whoever is holding the device next. Avoid 1234, a birthday, or four of the same digit.'
    : targetRole === 'admin'
      ? 'Enter your 4-digit PIN to access multi-campus analytics, standards audits, and learner data export.'
      : 'Enter your 4-digit PIN to access child analytics, screen time controls, and compliance settings.';

  const handleDigit = (digit: string) => {
    playClickSound();
    if (pin.length < 4) {
      const nextPin = pin + digit;
      setPin(nextPin);
      setError('');
      if (nextPin.length === 4) {
        verify(nextPin);
      }
    }
  };

  const handleDelete = () => {
    playClickSound();
    setPin(prev => prev.slice(0, -1));
    setError('');
  };

  const handleClear = () => {
    playClickSound();
    setPin('');
    setError('');
  };

  /**
   * Either proves the adult is present, or records the PIN that will.
   *
   * Both paths end in the server issuing a short-lived elevation cookie, so the
   * caller does not care which happened. The message on failure is the server's
   * — "two attempts left" and "try again in 15 minutes" have different next
   * steps, and only the server knows which applies.
   */
  const verify = async (pinToVerify: string) => {
    setIsSubmitting(true);
    const result = isChoosing ? await choosePin(pinToVerify) : await elevate(pinToVerify);

    if (result.ok) {
      playSuccessSound();
      onSuccess();
    } else {
      playErrorSound();
      setError(result.message);
      setPin('');
    }
    setIsSubmitting(false);
  };

  return (
    <div className="fixed inset-0 bg-slate-950/70 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-fadeIn">
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="pin-modal-heading"
        aria-describedby="pin-modal-description"
        tabIndex={-1}
        className="bg-white rounded-3xl max-w-sm w-full p-6 shadow-2xl border border-slate-200 relative overflow-hidden outline-hidden"
      >
        {/* Top Accent Header */}
        <div className="flex items-center justify-between pb-3 border-b border-slate-100">
          <div className="flex items-center gap-2 text-indigo-700 font-extrabold text-sm uppercase tracking-wider">
            <ShieldCheck className="w-4 h-4 text-indigo-600" />
            <span>Secure Access Guard</span>
          </div>
          <button
            onClick={() => {
              playClickSound();
              onClose();
            }}
            aria-label="Close"
            className="p-1 rounded-full text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="text-center mt-5 mb-4">
          <div className="w-12 h-12 rounded-2xl bg-indigo-50 border border-indigo-100 text-indigo-600 flex items-center justify-center mx-auto mb-3 shadow-xs">
            <Lock className="w-6 h-6" />
          </div>
          <h3 id="pin-modal-heading" className="text-lg font-black text-slate-900 tracking-tight">
            {heading}
          </h3>
          <p id="pin-modal-description" className="text-xs text-slate-500 mt-1 max-w-xs mx-auto">
            {description}
          </p>
        </div>

        {/* PIN Dot Display */}
        <div className="flex items-center justify-center gap-3 my-5">
          {[0, 1, 2, 3].map(idx => (
            <div
              key={idx}
              className={`w-4 h-4 rounded-full transition-all duration-200 border-2 ${
                idx < pin.length
                  ? 'bg-indigo-600 border-indigo-600 scale-110 shadow-xs'
                  : 'bg-slate-100 border-slate-300'
              }`}
            />
          ))}
        </div>

        {/* Error message */}
        {error && (
          <div className="flex items-center justify-center gap-1.5 text-rose-600 text-xs font-bold mb-3 animate-shake">
            <AlertCircle className="w-3.5 h-3.5" />
            <span>{error}</span>
          </div>
        )}

        {/* Keypad */}
        <div className="grid grid-cols-3 gap-2.5 max-w-[240px] mx-auto mb-4">
          {[1, 2, 3, 4, 5, 6, 7, 8, 9].map(num => (
            <button
              key={num}
              disabled={isSubmitting}
              onClick={() => handleDigit(num.toString())}
              className="h-12 rounded-2xl bg-slate-50 hover:bg-indigo-50 hover:text-indigo-600 active:scale-95 border border-slate-200 font-extrabold text-base text-slate-800 transition cursor-pointer shadow-2xs"
            >
              {num}
            </button>
          ))}
          <button
            onClick={handleClear}
            disabled={isSubmitting}
            className="h-12 rounded-2xl bg-slate-100 hover:bg-slate-200 text-slate-500 font-bold text-xs transition cursor-pointer"
          >
            Clear
          </button>
          <button
            disabled={isSubmitting}
            onClick={() => handleDigit('0')}
            className="h-12 rounded-2xl bg-slate-50 hover:bg-indigo-50 hover:text-indigo-600 active:scale-95 border border-slate-200 font-extrabold text-base text-slate-800 transition cursor-pointer shadow-2xs"
          >
            0
          </button>
          <button
            onClick={handleDelete}
            disabled={isSubmitting}
            className="h-12 rounded-2xl bg-slate-100 hover:bg-slate-200 text-slate-500 font-bold text-xs transition cursor-pointer flex items-center justify-center"
          >
            Del
          </button>
        </div>

        {/* Helper Hint */}
        <div className="bg-slate-50 rounded-xl p-2.5 border border-slate-200 text-center">
          <div className="flex items-center justify-center gap-1 text-[11px] font-bold text-slate-600">
            <KeyRound className="w-3 h-3 text-indigo-500" />
            <span>
              {isChoosing
                ? 'You will be asked for this again after 15 minutes'
                : 'Five wrong attempts locks this for 15 minutes'}
            </span>
          </div>
          <span className="text-[10px] text-slate-400 block mt-0.5">
            {isLoading ? 'Checking…' : 'Verified server-side. Stored hashed, never in plain text.'}
          </span>
        </div>
      </div>
    </div>
  );
};
