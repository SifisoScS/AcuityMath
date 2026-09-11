import React from 'react';
import { Compass, Sparkles, X, Brain, CheckCircle2, ArrowRight } from 'lucide-react';
import { UserProfile } from '../types';
import { playClickSound, playLevelUpFanfare } from '../utils/audio';
import { useModalA11y } from '../hooks/useModalA11y';

interface PlacementQuestPromptModalProps {
  isOpen: boolean;
  user: UserProfile;
  onStartQuest: () => void;
  onDismiss: () => void;
}

export const PlacementQuestPromptModal: React.FC<PlacementQuestPromptModalProps> = ({
  isOpen,
  user,
  onStartQuest,
  onDismiss
}) => {
  // Traps Tab, handles Escape, and returns focus where it came from.
  // `aria-modal` on the panel below promises the rest of the page is
  // inert; this is what makes that true rather than a claim.
  const panelRef = useModalA11y(isOpen, onDismiss);
  if (!isOpen) return null;

  return (
    <div
      ref={panelRef}
      role="dialog"
      aria-modal="true"
      aria-label="Start the placement quest"
      tabIndex={-1}
      className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in">
      <div className="bg-white w-full max-w-md rounded-3xl p-6 sm:p-7 shadow-2xl border border-slate-200 space-y-5 animate-in zoom-in-95 text-center">
        {/* Animated Compass Icon Header */}
        <div className="relative mx-auto w-16 h-16 rounded-3xl bg-gradient-to-tr from-amber-500 to-indigo-600 flex items-center justify-center shadow-lg shadow-indigo-500/20 text-white">
          <Compass className="w-8 h-8 animate-spin-slow" />
          <div className="absolute -top-1 -right-1 p-1 bg-amber-400 text-amber-950 rounded-full">
            <Sparkles className="w-3.5 h-3.5" />
          </div>
        </div>

        <div className="space-y-2">
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-indigo-50 text-indigo-700 text-xs font-black uppercase tracking-wider">
            <Brain className="w-3.5 h-3.5" />
            <span>Automated IRT Calibration</span>
          </div>
          <h3 className="text-xl sm:text-2xl font-black text-slate-900">
            Welcome to AcuityMath, {user.name.split(' ')[0]}!
          </h3>
          <p className="text-xs sm:text-sm text-slate-600 leading-relaxed px-2">
            Your teacher has enrolled you in the <strong>Adaptive Placement Quest</strong>. Answer 7 fast questions to customize your math challenges to your exact Zone of Proximal Development.
          </p>
        </div>

        {/* Benefits Checklist */}
        <div className="p-3.5 bg-slate-50 rounded-2xl border border-slate-200/80 text-left text-xs space-y-2">
          <div className="flex items-center gap-2 text-slate-700">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            <span>Only <strong>7 adaptive questions</strong> (~4 to 5 minutes)</span>
          </div>
          <div className="flex items-center gap-2 text-slate-700">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            <span>Calibrates starting latent ability <strong>θ</strong> and ELO rating</span>
          </div>
          <div className="flex items-center gap-2 text-slate-700">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            <span>Earn <strong>+100 Coins</strong> and an exclusive Quest Badge</span>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="space-y-2 pt-2">
          <button
            onClick={() => {
              playClickSound();
              onStartQuest();
            }}
            className="w-full py-3.5 rounded-2xl bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-500 hover:to-violet-500 text-white font-extrabold text-sm shadow-lg shadow-indigo-500/30 flex items-center justify-center gap-2 transition cursor-pointer"
          >
            <span>Start Placement Quest</span>
            <ArrowRight className="w-4 h-4" />
          </button>

          <button
            onClick={() => {
              playClickSound();
              onDismiss();
            }}
            className="w-full py-2.5 rounded-xl hover:bg-slate-100 text-slate-500 hover:text-slate-800 font-bold text-xs transition cursor-pointer"
          >
            Explore Dashboard First
          </button>
        </div>
      </div>
    </div>
  );
};
