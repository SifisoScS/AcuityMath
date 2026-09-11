import React, { useState } from 'react';
import { UserProfile, Role } from '../types';
import { determineTierForAge } from '../utils/storage';
import { Lock, UserPlus, Users, X, Check, KeyRound } from 'lucide-react';
import { playClickSound, playSuccessSound, playErrorSound } from '../utils/audio';
import { useModalA11y } from '../hooks/useModalA11y';

interface ProfileSwitchModalProps {
  profiles: UserProfile[];
  activeProfile: UserProfile;
  onSelectProfile: (profile: UserProfile) => void;
  onAddNewStudent: (newProfile: UserProfile) => void;
  onClose: () => void;
}

export const ProfileSwitchModal: React.FC<ProfileSwitchModalProps> = ({
  profiles,
  activeProfile,
  onSelectProfile,
  onAddNewStudent,
  onClose
}) => {
  // Traps Tab, handles Escape, and returns focus where it came from.
  // `aria-modal` on the panel below promises the rest of the page is
  // inert; this is what makes that true rather than a claim.
  const panelRef = useModalA11y(true, onClose);
  const [activeTab, setActiveTab] = useState<'switch' | 'create'>('switch');

  // PIN check state
  const [pendingProfile, setPendingProfile] = useState<UserProfile | null>(null);
  const [pinInput, setPinInput] = useState('');
  const [pinError, setPinError] = useState(false);

  // New student form
  const [newName, setNewName] = useState('');
  const [newAge, setNewAge] = useState<number>(8);
  const [newAvatar, setNewAvatar] = useState('🌟');

  const avatarOptions = ['🦊', '🤖', '🧑‍🚀', '🦉', '🐱', '🦄', '🐯', '🐼', '🦖', '🚀'];

  const handleProfileClick = (profile: UserProfile) => {
    playClickSound();
    if (profile.role === 'parent' || profile.role === 'teacher') {
      // Prompt for PIN
      setPendingProfile(profile);
      setPinInput('');
      setPinError(false);
    } else {
      onSelectProfile(profile);
      onClose();
    }
  };

  const handleVerifyPin = (e: React.FormEvent) => {
    e.preventDefault();
    if (!pendingProfile) return;

    if (pinInput === pendingProfile.pin || pinInput === '1234' || pinInput === '5678') {
      playSuccessSound();
      onSelectProfile(pendingProfile);
      setPendingProfile(null);
      onClose();
    } else {
      playErrorSound();
      setPinError(true);
    }
  };

  const handleCreateStudent = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newName.trim()) return;

    const tier = determineTierForAge(newAge);
    const initialLevel = tier === 'early' ? 1 : tier === 'elementary' ? 3 : tier === 'middle' ? 5 : 7;
    const initialElo = tier === 'early' ? 900 : tier === 'elementary' ? 1200 : tier === 'middle' ? 1500 : 1800;

    const newProfile: UserProfile = {
      id: `user-${Date.now()}`,
      name: newName.trim(),
      role: 'student',
      age: newAge,
      avatar: newAvatar,
      tier,
      dynamicLevel: initialLevel,
      eloRating: initialElo,
      xp: 50,
      coins: 20,
      streakDays: 1,
      streakShields: 1,
      accuracyRate: 100,
      completedLessonsCount: 0,
      unlockedAvatars: ['av-owl']
    };

    playSuccessSound();
    onAddNewStudent(newProfile);
    onSelectProfile(newProfile);
    onClose();
  };

  return (
    <div
      ref={panelRef}
      role="dialog"
      aria-modal="true"
      aria-label="Switch learner profile"
      tabIndex={-1}
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/80 backdrop-blur-sm p-3 sm:p-6 overflow-y-auto">
      <div className="relative w-full max-w-lg bg-white rounded-3xl shadow-2xl border border-slate-200 flex flex-col overflow-hidden my-auto max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 bg-slate-50 border-b border-slate-200">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-indigo-100 text-indigo-600 flex items-center justify-center text-xl">
              <Users className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-900">Multi-User Profile Security</h3>
              <p className="text-xs text-slate-500">Switch learner, parent oversight, or teacher portal</p>
            </div>
          </div>

          <button
            onClick={() => {
              playClickSound();
              onClose();
            }}
            className="p-1.5 hover:bg-slate-200 text-slate-500 rounded-xl transition cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* PIN Verification view if pending */}
        {pendingProfile ? (
          <div className="p-6 sm:p-8 space-y-5">
            <div className="text-center space-y-2">
              <div className="w-14 h-14 bg-indigo-50 border border-indigo-200 rounded-2xl flex items-center justify-center mx-auto text-indigo-600">
                <Lock className="w-7 h-7" />
              </div>
              <h4 className="text-lg font-bold text-slate-900">
                Enter Security PIN for {pendingProfile.name}
              </h4>
              <p className="text-xs text-slate-500 max-w-xs mx-auto">
                Parent and Teacher areas are PIN-protected to safeguard curriculum settings and analytics.
              </p>
            </div>

            <form onSubmit={handleVerifyPin} className="space-y-4 max-w-xs mx-auto">
              <div>
                <input
                  type="password"
                  maxLength={6}
                  placeholder="Enter 4-digit PIN"
                  value={pinInput}
                  onChange={e => {
                    setPinInput(e.target.value);
                    setPinError(false);
                  }}
                  autoFocus
                  className="w-full text-center tracking-[0.5em] font-mono text-2xl py-3 border-2 border-slate-200 rounded-2xl focus:border-indigo-600 focus:outline-none bg-slate-50"
                />
                {pinError && (
                  <p className="text-xs font-bold text-rose-600 text-center mt-1.5 animate-bounce">
                    Incorrect PIN. Try default: {pendingProfile.role === 'parent' ? '1234' : '5678'}
                  </p>
                )}
              </div>

              <div className="p-2.5 bg-amber-50 rounded-xl border border-amber-200 text-[11px] text-amber-900 flex items-center gap-1.5">
                <KeyRound className="w-4 h-4 shrink-0 text-amber-600" />
                <span>
                  Demo Access PIN: <strong>{pendingProfile.role === 'parent' ? '1234 (Parent)' : '5678 (Teacher)'}</strong>
                </span>
              </div>

              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setPendingProfile(null)}
                  className="flex-1 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs rounded-xl transition cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="flex-1 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs rounded-xl shadow-md transition cursor-pointer"
                >
                  Unlock Portal
                </button>
              </div>
            </form>
          </div>
        ) : (
          <>
            {/* Tabs */}
            <div className="flex border-b border-slate-200 bg-slate-50 px-6 pt-2 gap-3">
              <button
                onClick={() => {
                  playClickSound();
                  setActiveTab('switch');
                }}
                className={`pb-3 px-3 text-xs font-bold border-b-2 transition flex items-center gap-1.5 cursor-pointer ${
                  activeTab === 'switch'
                    ? 'border-indigo-600 text-indigo-600'
                    : 'border-transparent text-slate-500 hover:text-slate-700'
                }`}
              >
                <Users className="w-3.5 h-3.5" />
                <span>Switch Profile</span>
              </button>

              <button
                onClick={() => {
                  playClickSound();
                  setActiveTab('create');
                }}
                className={`pb-3 px-3 text-xs font-bold border-b-2 transition flex items-center gap-1.5 cursor-pointer ${
                  activeTab === 'create'
                    ? 'border-indigo-600 text-indigo-600'
                    : 'border-transparent text-slate-500 hover:text-slate-700'
                }`}
              >
                <UserPlus className="w-3.5 h-3.5" />
                <span>Add Student</span>
              </button>
            </div>

            {/* Tab content */}
            <div className="p-6 overflow-y-auto flex-1 max-h-[60vh]">
              {activeTab === 'switch' ? (
                <div className="space-y-2.5">
                  {profiles.map(p => {
                    const isActive = p.id === activeProfile.id;

                    return (
                      <div
                        key={p.id}
                        onClick={() => handleProfileClick(p)}
                        className={`p-3.5 rounded-2xl border-2 flex items-center justify-between transition cursor-pointer ${
                          isActive
                            ? 'border-indigo-600 bg-indigo-50/60 ring-2 ring-indigo-200'
                            : 'border-slate-200 bg-white hover:border-indigo-300 hover:bg-slate-50'
                        }`}
                      >
                        <div className="flex items-center gap-3.5">
                          <div className="w-12 h-12 rounded-2xl bg-white border border-slate-200 flex items-center justify-center text-2xl shadow-xs shrink-0">
                            {p.avatar}
                          </div>
                          <div>
                            <div className="flex items-center gap-2">
                              <h4 className="text-sm font-bold text-slate-900">{p.name}</h4>
                              {isActive && (
                                <span className="text-[10px] font-bold bg-indigo-600 text-white px-2 py-0.2 rounded-full">
                                  Active
                                </span>
                              )}
                            </div>

                            <div className="flex items-center gap-2 text-xs text-slate-500 mt-0.5">
                              {p.role === 'student' ? (
                                <>
                                  <span className="capitalize font-semibold text-indigo-700">{p.tier} Tier</span>
                                  <span>•</span>
                                  <span>Age {p.age}</span>
                                  <span>•</span>
                                  <span className="font-bold text-emerald-600">Lvl {p.dynamicLevel}</span>
                                </>
                              ) : (
                                <span className="text-amber-800 font-semibold flex items-center gap-1">
                                  <Lock className="w-3 h-3 text-amber-600" />
                                  PIN-Protected {p.role === 'parent' ? 'Parent' : 'Teacher'} Role
                                </span>
                              )}
                            </div>
                          </div>
                        </div>

                        {isActive && (
                          <div className="w-6 h-6 rounded-full bg-indigo-600 text-white flex items-center justify-center">
                            <Check className="w-4 h-4" />
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              ) : (
                /* Create New Student Profile Form */
                <form onSubmit={handleCreateStudent} className="space-y-4">
                  <div>
                    <label className="block text-xs font-bold text-slate-700 uppercase mb-1">
                      Student Name
                    </label>
                    <input
                      type="text"
                      required
                      placeholder="e.g. Maya, Ethan, or Chloe"
                      value={newName}
                      onChange={e => setNewName(e.target.value)}
                      className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-medium focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-700 uppercase mb-1">
                      Age (3 to 18)
                    </label>
                    <div className="flex items-center gap-3">
                      <input
                        type="range"
                        min="3"
                        max="18"
                        value={newAge}
                        onChange={e => setNewAge(Number(e.target.value))}
                        className="flex-1 accent-indigo-600 cursor-pointer"
                      />
                      <span className="font-mono text-base font-extrabold text-indigo-600 bg-indigo-50 px-3 py-1 rounded-xl border border-indigo-200 min-w-[50px] text-center">
                        {newAge} yrs
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-400 mt-1">
                      Target Tier:{' '}
                      <strong className="text-indigo-600 capitalize">
                        {determineTierForAge(newAge)}
                      </strong>{' '}
                      (Auto-calibrated math difficulty)
                    </p>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-700 uppercase mb-1">
                      Choose Avatar
                    </label>
                    <div className="grid grid-cols-5 gap-2">
                      {avatarOptions.map(av => (
                        <button
                          key={av}
                          type="button"
                          onClick={() => setNewAvatar(av)}
                          className={`p-2 rounded-xl text-2xl border-2 transition ${
                            newAvatar === av
                              ? 'border-indigo-600 bg-indigo-50 scale-110 shadow-sm'
                              : 'border-slate-200 hover:bg-slate-50'
                          }`}
                        >
                          {av}
                        </button>
                      ))}
                    </div>
                  </div>

                  <button
                    type="submit"
                    className="w-full py-3 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs rounded-xl shadow-md transition cursor-pointer mt-2"
                  >
                    Add Profile & Start Learning
                  </button>
                </form>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
};
