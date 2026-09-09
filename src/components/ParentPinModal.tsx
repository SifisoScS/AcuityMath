import React, { useState } from 'react';

import { useModalA11y } from '../hooks/useModalA11y';
import { ShieldCheck, X, Lock, KeyRound, AlertCircle } from 'lucide-react';
import { apiService } from '../services/api';
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

  if (!isOpen) return null;

  const heading =
    targetRole === 'parent'
      ? 'Parent Authorization Required'
      : targetRole === 'teacher'
        ? 'Educator PIN Required'
        : 'District Administrator PIN Required';

  /**
   * The demonstration credential shown under the keypad.
   *
   * It was a two-branch ternary and gained a third role, so the district prompt
   * offered the teacher's PIN — following the on-screen hint would have been
   * refused by the server, which checks the role alongside the digits. A lookup
   * fails to compile when a role is added without one, where a ternary silently
   * picks a wrong branch.
   */
  const demoKey = { parent: '1234', teacher: '4321', admin: '9876' }[targetRole];

  const description =
    targetRole === 'admin'
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

  const verify = async (pinToVerify: string) => {
    setIsSubmitting(true);
    try {
      const res = await apiService.verifyPin(targetRole, pinToVerify);
      if (res.valid) {
        playSuccessSound();
        onSuccess();
      } else {
        playErrorSound();
        setError(res.error || 'Incorrect PIN. Please try again.');
        setPin('');
      }
    } catch {
      playErrorSound();
      setError('Connection error. Please retry.');
      setPin('');
    } finally {
      setIsSubmitting(false);
    }
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
              Demo Key: <strong className="text-indigo-600">{demoKey}</strong>
            </span>
          </div>
          <span className="text-[10px] text-slate-400 block mt-0.5">
            Phase 1 Authenticated Gateway (Argon2 / Server Validated)
          </span>
        </div>
      </div>
    </div>
  );
};
