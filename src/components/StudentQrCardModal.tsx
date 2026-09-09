import React from 'react';
import { QrCode, X, Printer, Sparkles, ShieldCheck } from 'lucide-react';
import { playClickSound } from '../utils/audio';

interface StudentQrCardModalProps {
  isOpen: boolean;
  onClose: () => void;
  student: {
    name: string;
    age: number;
    avatar: string;
    tier: string;
    pin: string;
    qrToken: string;
    pictureSequence: string[];
  };
}

export const StudentQrCardModal: React.FC<StudentQrCardModalProps> = ({
  isOpen,
  onClose,
  student
}) => {
  if (!isOpen) return null;

  const handlePrint = () => {
    playClickSound();
    window.print();
  };

  return (
    <div
      role="dialog"
      aria-label="Printable learner badge"
      tabIndex={-1}
      className="fixed inset-0 bg-slate-950/70 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-fadeIn">
      <div className="bg-white rounded-3xl max-w-sm w-full p-6 shadow-2xl border border-slate-200 text-center relative overflow-hidden">
        {/* Close Button */}
        <button
          onClick={() => {
            playClickSound();
            onClose();
          }}
          className="absolute top-4 right-4 p-1 rounded-full text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition cursor-pointer"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-indigo-50 text-indigo-700 text-[11px] font-black uppercase tracking-wider mb-3">
          <Sparkles className="w-3.5 h-3.5 text-indigo-600" />
          <span>Child-Friendly Login Badge</span>
        </div>

        {/* Printable Card Area */}
        <div className="p-5 rounded-3xl bg-gradient-to-b from-indigo-50/80 via-white to-sky-50/50 border-2 border-indigo-200 shadow-sm my-2 text-center">
          <div className="w-14 h-14 rounded-2xl bg-white shadow-xs mx-auto flex items-center justify-center text-3xl mb-2 border border-slate-100">
            {student.avatar}
          </div>
          <h4 className="text-lg font-black text-slate-900 tracking-tight">
            {student.name}
          </h4>
          <span className="text-xs text-indigo-600 font-bold capitalize">
            Age {student.age} • {student.tier} Sprout
          </span>

          {/* QR Code Simulation Graphic */}
          <div className="my-4 p-3 bg-white rounded-2xl border-2 border-dashed border-indigo-300 inline-block shadow-2xs">
            <div className="w-32 h-32 bg-slate-900 rounded-xl p-2 flex flex-col justify-between items-center text-white relative">
              <div className="grid grid-cols-4 gap-1.5 w-full h-full p-1 opacity-90">
                {Array.from({ length: 16 }).map((_, i) => (
                  <div
                    key={i}
                    className={`rounded-xs ${
                      (i % 2 === 0 && i % 3 === 0) || i === 0 || i === 3 || i === 12
                        ? 'bg-white'
                        : 'bg-indigo-400/80'
                    }`}
                  />
                ))}
              </div>
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="w-8 h-8 rounded-lg bg-indigo-600 text-white flex items-center justify-center font-bold text-xs shadow-md">
                  ∑
                </div>
              </div>
            </div>
            <div className="text-[9px] font-mono text-slate-400 mt-1 uppercase tracking-tighter">
              {student.qrToken.slice(0, 18)}...
            </div>
          </div>

          {/* Picture Password Sequence */}
          <div className="bg-white rounded-2xl p-2.5 border border-slate-200">
            <span className="text-[10px] font-extrabold uppercase tracking-wider text-slate-400 block mb-1">
              Visual Picture Code
            </span>
            <div className="flex items-center justify-center gap-3 text-2xl">
              {student.pictureSequence.map((icon, idx) => (
                <span key={idx} className="p-1 rounded-xl bg-slate-50 border border-slate-100 shadow-2xs">
                  {icon}
                </span>
              ))}
            </div>
          </div>
        </div>

        {/* Security Notice */}
        <div className="flex items-center justify-center gap-1.5 text-[11px] font-semibold text-slate-400 mt-3">
          <ShieldCheck className="w-3.5 h-3.5 text-emerald-500" />
          <span>No typing required • Safe for young learners</span>
        </div>

        {/* Action Button */}
        <button
          onClick={handlePrint}
          className="w-full mt-4 flex items-center justify-center gap-2 py-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs transition cursor-pointer shadow-xs"
        >
          <Printer className="w-4 h-4" />
          <span>Print or Save Login Badge</span>
        </button>
      </div>
    </div>
  );
};
