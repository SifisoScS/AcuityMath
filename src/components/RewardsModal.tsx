import React from 'react';
import { UserProfile, Achievement } from '../types';
import { STORE_AVATARS, INITIAL_ACHIEVEMENTS } from '../data/curriculumData';
import { playClickSound, playSuccessSound, playLevelUpFanfare } from '../utils/audio';
import { X, Award, Sparkles, Check, Lock } from 'lucide-react';
import confetti from 'canvas-confetti';

interface RewardsModalProps {
  user: UserProfile;
  onClose: () => void;
  onUpdateUser: (updated: Partial<UserProfile>) => void;
}

export const RewardsModal: React.FC<RewardsModalProps> = ({ user, onClose, onUpdateUser }) => {
  const [activeTab, setActiveTab] = React.useState<'badges' | 'avatars'>('avatars');
  const [achievements] = React.useState<Achievement[]>(INITIAL_ACHIEVEMENTS);

  const handleBuyAvatar = (avatarId: string, price: number) => {
    if (user.coins < price) return;
    playLevelUpFanfare();
    confetti({ particleCount: 50, spread: 60 });
    onUpdateUser({
      coins: user.coins - price,
      unlockedAvatars: [...user.unlockedAvatars, avatarId]
    });
  };

  const handleEquipAvatar = (avatarIcon: string) => {
    playSuccessSound();
    onUpdateUser({ avatar: avatarIcon });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/80 backdrop-blur-sm p-3 sm:p-6 overflow-y-auto">
      <div className="relative w-full max-w-2xl bg-white rounded-3xl shadow-2xl border border-slate-200 flex flex-col overflow-hidden my-auto max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 bg-gradient-to-r from-indigo-600 via-purple-600 to-indigo-700 text-white">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-white/20 flex items-center justify-center text-2xl shadow-inner">
              🎁
            </div>
            <div>
              <h2 className="text-lg font-bold">Gamified Rewards & Avatar Vault</h2>
              <p className="text-xs text-indigo-100">Unlock mathematical companions and earn milestone badges</p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {/* Coins Balance pill */}
            <div className="flex items-center gap-1.5 bg-amber-400 text-amber-950 font-extrabold text-xs px-3 py-1.5 rounded-full shadow-sm">
              <Award className="w-4 h-4 text-amber-900" />
              <span>{user.coins} Coins</span>
            </div>

            <button
              onClick={() => {
                playClickSound();
                onClose();
              }}
              className="p-1.5 hover:bg-white/20 rounded-xl transition cursor-pointer text-white"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Tab switcher */}
        <div className="flex border-b border-slate-200 bg-slate-50 px-6 pt-2 gap-3">
          <button
            onClick={() => {
              playClickSound();
              setActiveTab('avatars');
            }}
            className={`pb-3 px-3 text-sm font-bold border-b-2 transition flex items-center gap-1.5 cursor-pointer ${
              activeTab === 'avatars'
                ? 'border-indigo-600 text-indigo-600'
                : 'border-transparent text-slate-500 hover:text-slate-700'
            }`}
          >
            <span>Avatars & Companions</span>
            <span className="text-[10px] bg-indigo-100 text-indigo-800 px-1.5 py-0.5 rounded-full">
              {STORE_AVATARS.length}
            </span>
          </button>

          <button
            onClick={() => {
              playClickSound();
              setActiveTab('badges');
            }}
            className={`pb-3 px-3 text-sm font-bold border-b-2 transition flex items-center gap-1.5 cursor-pointer ${
              activeTab === 'badges'
                ? 'border-indigo-600 text-indigo-600'
                : 'border-transparent text-slate-500 hover:text-slate-700'
            }`}
          >
            <span>Achievements & Badges</span>
            <span className="text-[10px] bg-amber-100 text-amber-800 px-1.5 py-0.5 rounded-full">
              {achievements.length}
            </span>
          </button>
        </div>

        {/* Content Container */}
        <div className="p-6 overflow-y-auto flex-1 max-h-[60vh]">
          {activeTab === 'avatars' ? (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              {STORE_AVATARS.map(av => {
                const isUnlocked = user.unlockedAvatars.includes(av.id) || av.price === 0;
                const isCurrent = user.avatar === av.icon;
                const canAfford = user.coins >= av.price;

                return (
                  <div
                    key={av.id}
                    className={`p-4 rounded-2xl border-2 flex flex-col items-center text-center transition-all ${
                      isCurrent
                        ? 'border-indigo-600 bg-indigo-50/50 shadow-md ring-2 ring-indigo-300'
                        : isUnlocked
                        ? 'border-slate-200 bg-white hover:border-slate-300'
                        : 'border-slate-200 bg-slate-50/70 opacity-90'
                    }`}
                  >
                    <div className="relative text-4xl sm:text-5xl my-2 select-none">
                      {av.icon}
                      {isCurrent && (
                        <span className="absolute -bottom-1 -right-1 bg-indigo-600 text-white rounded-full p-0.5">
                          <Check className="w-3.5 h-3.5" />
                        </span>
                      )}
                      {!isUnlocked && (
                        <span className="absolute -bottom-1 -right-1 bg-slate-600 text-white rounded-full p-1 shadow-sm">
                          <Lock className="w-3 h-3" />
                        </span>
                      )}
                    </div>

                    <h4 className="text-xs font-bold text-slate-800 mt-1 line-clamp-1">{av.name}</h4>
                    <span className="text-[10px] uppercase font-semibold text-slate-400 mt-0.5">{av.tier}</span>

                    {/* Action button */}
                    <div className="mt-3 w-full">
                      {isCurrent ? (
                        <div className="w-full py-1.5 rounded-lg bg-indigo-100 text-indigo-800 text-xs font-bold">
                          Equipped
                        </div>
                      ) : isUnlocked ? (
                        <button
                          onClick={() => handleEquipAvatar(av.icon)}
                          className="w-full py-1.5 rounded-lg bg-slate-800 hover:bg-slate-900 text-white text-xs font-bold transition shadow-xs cursor-pointer"
                        >
                          Equip
                        </button>
                      ) : (
                        <button
                          onClick={() => handleBuyAvatar(av.id, av.price)}
                          disabled={!canAfford}
                          className={`w-full py-1.5 rounded-lg text-xs font-bold transition flex items-center justify-center gap-1 cursor-pointer ${
                            canAfford
                              ? 'bg-amber-500 hover:bg-amber-600 text-amber-950 shadow-sm'
                              : 'bg-slate-200 text-slate-400 cursor-not-allowed'
                          }`}
                        >
                          <Sparkles className="w-3 h-3" />
                          <span>{av.price} Coins</span>
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="space-y-3">
              {achievements.map(ach => {
                const isComplete = ach.progress >= ach.maxProgress;
                const progressPct = Math.min(100, Math.round((ach.progress / ach.maxProgress) * 100));

                return (
                  <div
                    key={ach.id}
                    className={`p-4 rounded-2xl border flex items-center gap-4 transition ${
                      isComplete
                        ? 'bg-amber-50/50 border-amber-200'
                        : 'bg-white border-slate-200'
                    }`}
                  >
                    <div className={`w-12 h-12 rounded-2xl flex items-center justify-center text-2xl shadow-sm shrink-0 ${
                      isComplete ? 'bg-amber-100 ring-2 ring-amber-300' : 'bg-slate-100 grayscale opacity-70'
                    }`}>
                      {ach.icon}
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between">
                        <h4 className="text-sm font-bold text-slate-800 flex items-center gap-2">
                          {ach.title}
                          {isComplete && (
                            <span className="text-[10px] font-bold bg-amber-200 text-amber-900 px-2 py-0.5 rounded-full">
                              Unlocked
                            </span>
                          )}
                        </h4>
                        <span className="text-xs font-mono text-slate-500">
                          {ach.progress} / {ach.maxProgress}
                        </span>
                      </div>
                      <p className="text-xs text-slate-500 mt-0.5">{ach.description}</p>

                      {/* Progress bar */}
                      <div className="w-full bg-slate-100 h-2 rounded-full mt-2 overflow-hidden">
                        <div
                          className={`h-full rounded-full transition-all ${
                            isComplete ? 'bg-amber-500' : 'bg-indigo-600'
                          }`}
                          style={{ width: `${progressPct}%` }}
                        />
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-3.5 bg-slate-50 border-t border-slate-200 flex items-center justify-between text-xs text-slate-500">
          <span>Earn 15–50 Star Coins for each completed math challenge!</span>
          <button
            onClick={onClose}
            className="px-4 py-2 bg-slate-200 hover:bg-slate-300 text-slate-800 font-bold rounded-xl transition cursor-pointer"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
};
