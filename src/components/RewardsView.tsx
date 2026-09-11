import React, { useState } from 'react';
import { UserProfile, Achievement } from '../types';
import { INITIAL_ACHIEVEMENTS } from '../data/curriculumData';
import type { StoreAvatar } from '../data/avatars';
import { playClickSound, playSuccessSound, playLevelUpFanfare } from '../utils/audio';
import { fireConfettiBurst, fireMilestoneConfetti } from '../utils/confetti';
import { Award, Trophy, Star, Sparkles, Check, Lock, Flame } from 'lucide-react';

interface RewardsViewProps {
  user: UserProfile;
  onUpdateUser: (updated: Partial<UserProfile>) => void;
  /** The shop, from the server, so the price drawn is the price charged. */
  catalogue: StoreAvatar[];
  /** Buys one. The price is not passed: the server reads it from the catalogue. */
  onBuyAvatar: (avatarId: string) => Promise<void>;
  onEquipAvatar: (avatarId: string) => Promise<void>;
  isBusy: boolean;
}

export const RewardsView: React.FC<RewardsViewProps> = ({
  user,
  catalogue,
  onBuyAvatar,
  onEquipAvatar,
  isBusy
}) => {
  const [purchaseError, setPurchaseError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'all' | 'avatars' | 'achievements'>('all');
  const [achievements] = useState<Achievement[]>(INITIAL_ACHIEVEMENTS);

  const currentXpInLevel = user.xp % 500;
  const xpProgressPct = Math.min(100, Math.round((currentXpInLevel / 500) * 100));
  const coinsNextTarget = Math.ceil((user.coins + 1) / 1000) * 1000;
  const coinsProgressPct = Math.min(100, Math.round(((user.coins % 1000) / 1000) * 100));

  /*
   * The fanfare fires after the purchase, not before it.
   *
   * This used to deduct the coins locally, celebrate, and hand the new balance
   * to `onUpdateUser` — a function in `App` that discards its argument and
   * re-reads from the server. The child saw confetti and a balance that snapped
   * straight back.
   */
  const handleBuyAvatar = async (avatarId: string) => {
    setPurchaseError(null);
    try {
      await onBuyAvatar(avatarId);
    } catch (error) {
      setPurchaseError(error instanceof Error ? error.message : 'That purchase did not go through.');
      return;
    }
    playLevelUpFanfare();
    fireConfettiBurst();
  };

  const handleEquipAvatar = async (avatarId: string) => {
    setPurchaseError(null);
    try {
      await onEquipAvatar(avatarId);
    } catch (error) {
      setPurchaseError(error instanceof Error ? error.message : 'Could not equip that one.');
      return;
    }
    playSuccessSound();
  };

  return (
    <div className="space-y-6">
      {/* Top Banner */}
      <div className="bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 text-white rounded-3xl p-6 sm:p-8 shadow-xl border border-slate-800">
        <div className="flex items-center gap-2 text-xs uppercase font-bold text-amber-400 tracking-wider mb-2">
          <Trophy className="w-4 h-4" />
          Gamified Milestone Economy & Rewards
        </div>
        <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight">
          Rewards & Companion Vault
        </h1>
        <p className="text-xs sm:text-sm text-slate-300 mt-1 max-w-xl leading-relaxed">
          Celebrate your mathematical mastery by unlocking companion avatars, collecting achievement badges, and leveling up your explorer rank.
        </p>
      </div>

      {/* 3 Metric Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
        {/* Star Coins Card */}
        <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm text-center flex flex-col items-center justify-between">
          <div className="w-16 h-16 rounded-2xl bg-amber-50 text-amber-500 flex items-center justify-center text-3xl mb-2 shadow-inner">
            ⭐
          </div>
          <div className="text-3xl font-black text-slate-900 mt-1">{user.coins.toLocaleString()}</div>
          <div className="text-xs font-bold text-slate-400 uppercase tracking-wider mt-0.5">Star Coins Available</div>
          <div className="w-full bg-slate-100 h-2.5 rounded-full overflow-hidden mt-4">
            <div
              className="bg-amber-400 h-full rounded-full transition-all duration-500"
              style={{ width: `${coinsProgressPct}%` }}
            />
          </div>
          <span className="text-[11px] font-semibold text-slate-500 mt-2">
            Target: {coinsNextTarget.toLocaleString()} Coins for Rare Badge
          </span>
        </div>

        {/* Level & XP Card */}
        <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm text-center flex flex-col items-center justify-between">
          <div className="w-16 h-16 rounded-2xl bg-indigo-50 text-indigo-600 flex items-center justify-center text-3xl mb-2 shadow-inner">
            🏆
          </div>
          <div className="text-3xl font-black text-slate-900 mt-1">Level {user.dynamicLevel}</div>
          <div className="text-xs font-bold text-slate-400 uppercase tracking-wider mt-0.5">
            XP: {currentXpInLevel} / 500
          </div>
          <div className="w-full bg-slate-100 h-2.5 rounded-full overflow-hidden mt-4">
            <div
              className="bg-indigo-600 h-full rounded-full transition-all duration-500"
              style={{ width: `${xpProgressPct}%` }}
            />
          </div>
          <span className="text-[11px] font-semibold text-slate-500 mt-2">
            ⬆ {Math.ceil((500 - currentXpInLevel) / 60)} more lessons to Level {user.dynamicLevel + 1}
          </span>
        </div>

        {/* Achievement Badges Card */}
        <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm text-center flex flex-col items-center justify-between">
          <div className="w-16 h-16 rounded-2xl bg-purple-50 text-purple-600 flex items-center justify-center text-3xl mb-2 shadow-inner">
            🎖️
          </div>
          <div className="text-3xl font-black text-slate-900 mt-1">{achievements.length}</div>
          <div className="text-xs font-bold text-slate-400 uppercase tracking-wider mt-0.5">
            Unlocked Milestones
          </div>
          <div className="flex flex-wrap justify-center gap-1.5 mt-4">
            <span className="text-[10px] font-extrabold px-2 py-0.5 rounded-full bg-amber-100 text-amber-900">
              ⭐ Star Collector
            </span>
            <span className="text-[10px] font-extrabold px-2 py-0.5 rounded-full bg-purple-100 text-purple-900">
              🧮 Math Whiz
            </span>
            <span className="text-[10px] font-extrabold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-900">
              🔥 Streak Master
            </span>
          </div>
          <span className="text-[11px] font-semibold text-slate-500 mt-2">
            Active streak: {user.streakDays} consecutive days
          </span>
        </div>
      </div>

      {/* Unlockable Companion Avatars */}
      <div className="bg-white rounded-3xl p-6 border border-slate-200 shadow-sm space-y-4">
        <div className="flex items-center justify-between border-b border-slate-100 pb-3">
          <div>
            <h3 className="text-lg font-bold text-slate-900 flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-indigo-600" />
              Unlockable Companion Avatars
            </h3>
            <p className="text-xs text-slate-500">Equip your favorite mathematical persona or unlock new guardians</p>
          </div>
          <span className="text-xs font-bold text-indigo-600 bg-indigo-50 px-3 py-1 rounded-full">
            {user.unlockedAvatars.length} / {catalogue.length} Unlocked
          </span>
        </div>

        {purchaseError && (
          <p
            role="alert"
            className="text-xs font-semibold text-rose-700 bg-rose-50 border border-rose-200 rounded-xl p-2.5"
          >
            {purchaseError}
          </p>
        )}

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 pt-2">
          {catalogue.map(avatar => {
            const isUnlocked = user.unlockedAvatars.includes(avatar.id);
            const isEquipped = user.avatar === avatar.icon;
            const canAfford = user.coins >= avatar.price;

            return (
              <div
                key={avatar.id}
                className={`p-4 rounded-2xl border text-center transition flex flex-col justify-between items-center ${
                  isEquipped
                    ? 'border-indigo-600 bg-indigo-50/50 shadow-sm'
                    : 'border-slate-200 bg-slate-50/50 hover:bg-white hover:shadow-xs'
                }`}
              >
                <div className="text-4xl mb-2 select-none transform hover:scale-110 transition-transform">
                  {avatar.icon}
                </div>
                <h4 className="text-xs font-extrabold text-slate-900 line-clamp-1">{avatar.name}</h4>
                <span className="text-[10px] text-slate-400 font-semibold uppercase">{avatar.tier} stage</span>

                <div className="mt-3 w-full">
                  {isEquipped ? (
                    <span className="block w-full py-1.5 text-[11px] font-extrabold bg-indigo-600 text-white rounded-xl shadow-xs">
                      Equipped
                    </span>
                  ) : isUnlocked ? (
                    <button
                      onClick={() => void handleEquipAvatar(avatar.id)}
                      disabled={isBusy}
                      className="w-full py-1.5 text-[11px] font-bold bg-slate-200 hover:bg-indigo-600 hover:text-white text-slate-800 rounded-xl transition cursor-pointer disabled:opacity-50"
                    >
                      Equip
                    </button>
                  ) : (
                    <button
                      onClick={() => void handleBuyAvatar(avatar.id)}
                      disabled={!canAfford || isBusy}
                      className={`w-full py-1.5 text-[11px] font-bold rounded-xl transition flex items-center justify-center gap-1 cursor-pointer ${
                        canAfford
                          ? 'bg-amber-500 hover:bg-amber-600 text-white shadow-xs'
                          : 'bg-slate-200 text-slate-400 cursor-not-allowed'
                      }`}
                    >
                      <Lock className="w-3 h-3" />
                      <span>{avatar.price} Coins</span>
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Achievements List */}
      <div className="bg-white rounded-3xl p-6 border border-slate-200 shadow-sm space-y-4">
        <div className="flex items-center justify-between border-b border-slate-100 pb-3">
          <div>
            <h3 className="text-lg font-bold text-slate-900 flex items-center gap-2">
              <Award className="w-5 h-5 text-indigo-600" />
              Mathematical Milestone Badges
            </h3>
            <p className="text-xs text-slate-500">Track progress toward honorary honors and streak achievements</p>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 pt-2">
          {achievements.map(ach => (
            <div
              key={ach.id}
              className="p-4 rounded-2xl border border-slate-200 bg-slate-50/50 flex items-start gap-3.5"
            >
              <div className="w-12 h-12 rounded-2xl bg-white border border-slate-200 shadow-xs flex items-center justify-center text-2xl shrink-0">
                {ach.icon}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-bold text-slate-900 truncate">{ach.title}</h4>
                  <span className="text-[10px] font-extrabold uppercase px-2 py-0.5 rounded-full bg-slate-200 text-slate-700">
                    {ach.category}
                  </span>
                </div>
                <p className="text-[11px] text-slate-500 mt-0.5 leading-snug">{ach.description}</p>
                <div className="w-full bg-slate-200 h-1.5 rounded-full overflow-hidden mt-2">
                  <div
                    className="bg-indigo-600 h-full rounded-full"
                    style={{ width: `${(ach.progress / ach.maxProgress) * 100}%` }}
                  />
                </div>
                <div className="text-[10px] text-slate-400 font-bold mt-1 text-right">
                  {ach.progress} / {ach.maxProgress}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
