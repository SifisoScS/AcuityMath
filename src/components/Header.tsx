import React, { useState } from 'react';
import { UserProfile, NavigationTab, NotificationItem } from '../types';
import { AGE_TIER_META } from '../data/curriculumData';
import {
  Bell,
  Volume2,
  VolumeX,
  Award,
  Flame,
  Eye,
  Type,
  ChevronDown,
  BookOpen,
  PenTool,
  Headphones,
  Building2,
  Languages
} from 'lucide-react';
import {
  playClickSound,
  setSoundEnabled,
  getSoundEnabled,
  speakText,
  stopSpeaking
} from '../utils/audio';

interface HeaderProps {
  activeProfile: UserProfile;
  activeTab: NavigationTab;
  notifications: NotificationItem[];
  onOpenProfileModal: () => void;
  onOpenNotifications: () => void;
  onOpenRewards: () => void;
  onSelectTab: (tab: NavigationTab) => void;
  highContrast: boolean;
  onToggleHighContrast: () => void;
  dyslexicFont: boolean;
  onToggleDyslexicFont: () => void;
  onOpenGlossary?: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  activeProfile,
  activeTab,
  notifications,
  onOpenProfileModal,
  onOpenNotifications,
  onOpenRewards,
  onSelectTab,
  highContrast,
  onToggleHighContrast,
  dyslexicFont,
  onToggleDyslexicFont,
  onOpenGlossary
}) => {
  const [soundOn, setSoundOn] = useState(getSoundEnabled());
  const [showAccessMenu, setShowAccessMenu] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);

  const unreadCount = notifications.filter(n => !n.read).length;
  const tierMeta = activeProfile.role === 'student' ? AGE_TIER_META[activeProfile.tier] : null;

  const handleToggleSound = () => {
    const next = !soundOn;
    setSoundOn(next);
    setSoundEnabled(next);
    if (next) playClickSound();
  };

  const handleToggleTTS = () => {
    playClickSound();
    if (isSpeaking) {
      stopSpeaking();
      setIsSpeaking(false);
    } else {
      setIsSpeaking(true);
      const text = `Welcome to AcuityMath! You are exploring as ${activeProfile.name}. Current adaptive math rating is ${activeProfile.eloRating} ELO, Level ${activeProfile.dynamicLevel}. Keep up the great practice!`;
      speakText(text, () => setIsSpeaking(false));
    }
  };

  return (
    <header className="bg-white/95 backdrop-blur-md border-b border-slate-200 sticky top-0 z-30 shadow-xs">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between gap-4">
        {/* Left: Brand & Age Tier indicator */}
        <div className="flex items-center gap-3 shrink-0">
          <div className="flex items-center gap-2 cursor-pointer" onClick={onOpenProfileModal}>
            <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-indigo-600 via-indigo-500 to-sky-400 text-white flex items-center justify-center font-black text-xl shadow-md shadow-indigo-100">
              ∑
            </div>
            <div>
              <div className="flex items-center gap-1.5">
                <span className="font-extrabold text-base tracking-tight text-slate-900">
                  Acuity<span className="text-indigo-600">Math</span>
                </span>
                <span className="text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 bg-slate-100 text-slate-600 rounded">
                  v2.4
                </span>
              </div>
              {tierMeta && (
                <div className="hidden sm:flex items-center gap-1 text-[11px] font-bold text-slate-500">
                  <span>{tierMeta.icon}</span>
                  <span>{tierMeta.label} ({tierMeta.ageRange})</span>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Center: Navigation Pills */}
        <nav className="hidden lg:flex items-center bg-slate-100 p-1 rounded-2xl border border-slate-200/80">
          <button
            onClick={() => {
              playClickSound();
              onSelectTab('student');
            }}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition flex items-center gap-1.5 cursor-pointer ${
              activeTab === 'student'
                ? 'bg-white text-indigo-700 shadow-sm'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <span>🎒 Dashboard</span>
          </button>

          <button
            onClick={() => {
              playClickSound();
              onSelectTab('curriculum');
            }}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition flex items-center gap-1.5 cursor-pointer ${
              activeTab === 'curriculum'
                ? 'bg-white text-indigo-700 shadow-sm'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <BookOpen className="w-3.5 h-3.5 text-indigo-600" />
            <span>Curriculum</span>
          </button>

          <button
            onClick={() => {
              playClickSound();
              onSelectTab('parent');
            }}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition flex items-center gap-1.5 cursor-pointer ${
              activeTab === 'parent'
                ? 'bg-white text-indigo-700 shadow-sm'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <span>👨‍👩‍👧 Parent</span>
          </button>

          <button
            onClick={() => {
              playClickSound();
              onSelectTab('teacher');
            }}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition flex items-center gap-1.5 cursor-pointer ${
              activeTab === 'teacher'
                ? 'bg-white text-indigo-700 shadow-sm'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <span>📐 Teacher</span>
          </button>

          <button
            onClick={() => {
              playClickSound();
              onSelectTab('district');
            }}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition flex items-center gap-1.5 cursor-pointer ${
              activeTab === 'district'
                ? 'bg-white text-indigo-700 shadow-sm'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Building2 className="w-3.5 h-3.5 text-indigo-600" />
            <span>District Hub</span>
          </button>

          <button
            onClick={() => {
              playClickSound();
              onSelectTab('scratchpad');
            }}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition flex items-center gap-1.5 cursor-pointer ${
              activeTab === 'scratchpad'
                ? 'bg-white text-indigo-700 shadow-sm'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <PenTool className="w-3.5 h-3.5 text-indigo-600" />
            <span>Scratchpad</span>
          </button>
        </nav>

        {/* Right Actions: Coins, Streaks, Audio, Accessibility, Profile */}
        <div className="flex items-center gap-1.5 sm:gap-2.5 shrink-0">
          {/* Rewards & Coins pill */}
          <button
            onClick={() => {
              playClickSound();
              onOpenRewards();
            }}
            className="flex items-center gap-2 bg-amber-50 hover:bg-amber-100/80 border border-amber-200/80 px-2.5 py-1.5 rounded-2xl transition cursor-pointer shadow-xs"
            title="Open Rewards & Companion Shop"
          >
            <div className="flex items-center gap-1 text-xs font-extrabold text-amber-900">
              <Award className="w-3.5 h-3.5 text-amber-600" />
              <span>{activeProfile.coins}</span>
            </div>
            <div className="hidden sm:flex items-center gap-1 text-xs font-extrabold text-rose-600 border-l border-amber-300 pl-2">
              <Flame className="w-3.5 h-3.5" />
              <span>{activeProfile.streakDays}d</span>
            </div>
          </button>

          {/* Dual-Language Bilingual Math Glossary Button */}
          {onOpenGlossary && (
            <button
              onClick={() => {
                playClickSound();
                onOpenGlossary();
              }}
              className="p-2 rounded-xl text-slate-500 hover:text-indigo-600 hover:bg-indigo-50 transition cursor-pointer flex items-center gap-1"
              title="Dual-Language Math Glossary (English / Español)"
            >
              <Languages className="w-4 h-4 text-indigo-600" />
              <span className="hidden lg:inline text-[11px] font-bold text-indigo-700">ES/EN</span>
            </button>
          )}

          {/* Text-To-Speech (TTS) Toggle */}
          <button
            onClick={handleToggleTTS}
            className={`p-2 rounded-xl transition cursor-pointer ${
              isSpeaking
                ? 'bg-emerald-100 text-emerald-700 ring-2 ring-emerald-400 animate-pulse'
                : 'text-slate-500 hover:text-slate-800 hover:bg-slate-100'
            }`}
            title={isSpeaking ? 'Stop Speech' : 'Listen with Audio Readout (TTS)'}
          >
            <Headphones className="w-4 h-4" />
          </button>

          {/* Sound FX Toggle */}
          <button
            onClick={handleToggleSound}
            className="p-2 rounded-xl text-slate-500 hover:text-slate-800 hover:bg-slate-100 transition cursor-pointer"
            title={soundOn ? 'Mute Sound Effects' : 'Unmute Sound Effects'}
          >
            {soundOn ? <Volume2 className="w-4 h-4 text-indigo-600" /> : <VolumeX className="w-4 h-4 text-slate-400" />}
          </button>

          {/* Accessibility Settings Dropdown */}
          <div className="relative">
            <button
              onClick={() => {
                playClickSound();
                setShowAccessMenu(!showAccessMenu);
              }}
              className={`p-2 rounded-xl transition cursor-pointer ${
                highContrast || dyslexicFont
                  ? 'bg-indigo-100 text-indigo-700 ring-1 ring-indigo-300'
                  : 'text-slate-500 hover:text-slate-800 hover:bg-slate-100'
              }`}
              title="Accessibility Settings (High Contrast, Dyslexic Font)"
            >
              <Eye className="w-4 h-4" />
            </button>

            {showAccessMenu && (
              <div className="absolute right-0 mt-2 w-60 bg-white rounded-2xl shadow-xl border border-slate-200 p-2 z-50 animate-in fade-in space-y-1">
                <div className="px-3 py-1.5 text-[11px] font-bold uppercase tracking-wider text-slate-400">
                  Accessibility & Comfort
                </div>

                <button
                  onClick={() => {
                    onToggleHighContrast();
                    playClickSound();
                  }}
                  className="w-full px-3 py-2 text-xs font-semibold rounded-xl flex items-center justify-between hover:bg-slate-50 transition text-slate-700 cursor-pointer"
                >
                  <span className="flex items-center gap-2">
                    <Eye className="w-3.5 h-3.5 text-indigo-600" />
                    High Contrast
                  </span>
                  <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${
                    highContrast ? 'bg-indigo-600 text-white' : 'bg-slate-200 text-slate-600'
                  }`}>
                    {highContrast ? 'ON' : 'OFF'}
                  </span>
                </button>

                <button
                  onClick={() => {
                    onToggleDyslexicFont();
                    playClickSound();
                  }}
                  className="w-full px-3 py-2 text-xs font-semibold rounded-xl flex items-center justify-between hover:bg-slate-50 transition text-slate-700 cursor-pointer"
                >
                  <span className="flex items-center gap-2">
                    <Type className="w-3.5 h-3.5 text-indigo-600" />
                    High Readability Font
                  </span>
                  <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${
                    dyslexicFont ? 'bg-indigo-600 text-white' : 'bg-slate-200 text-slate-600'
                  }`}>
                    {dyslexicFont ? 'ON' : 'OFF'}
                  </span>
                </button>
              </div>
            )}
          </div>

          {/* Notifications Bell */}
          <button
            onClick={() => {
              playClickSound();
              onOpenNotifications();
            }}
            className="relative p-2 rounded-xl text-slate-500 hover:text-slate-800 hover:bg-slate-100 transition cursor-pointer"
            title="Notifications & Milestones"
          >
            <Bell className="w-4 h-4" />
            {unreadCount > 0 && (
              <span className="absolute top-1 right-1 w-2.5 h-2.5 rounded-full bg-indigo-600 ring-2 ring-white animate-pulse" />
            )}
          </button>

          {/* Profile Switcher Pill */}
          <button
            onClick={() => {
              playClickSound();
              onOpenProfileModal();
            }}
            className="flex items-center gap-2 p-1.5 pl-2 rounded-2xl bg-slate-100 hover:bg-slate-200/80 transition cursor-pointer border border-slate-200"
            title="Switch User Profile"
          >
            <span className="text-xl">{activeProfile.avatar}</span>
            <div className="text-left hidden xl:block pr-1">
              <div className="text-xs font-bold text-slate-900 leading-tight">
                {activeProfile.name.split(' ')[0]}
              </div>
              <div className="text-[10px] text-indigo-600 font-semibold leading-tight">
                {activeProfile.role === 'student' ? `Lvl ${activeProfile.dynamicLevel}` : activeProfile.role}
              </div>
            </div>
            <ChevronDown className="w-3 h-3 text-slate-400" />
          </button>
        </div>
      </div>

      {/* Mobile & Tablet Role Navigation Strip */}
      <div className="flex lg:hidden border-t border-slate-200 px-3 py-2 bg-slate-50 justify-around text-xs font-bold overflow-x-auto gap-2">
        <button
          onClick={() => onSelectTab('student')}
          className={`py-1 px-3 rounded-lg transition shrink-0 ${
            activeTab === 'student' ? 'bg-indigo-600 text-white' : 'text-slate-600'
          }`}
        >
          🎒 Dashboard
        </button>
        <button
          onClick={() => onSelectTab('curriculum')}
          className={`py-1 px-3 rounded-lg transition shrink-0 ${
            activeTab === 'curriculum' ? 'bg-indigo-600 text-white' : 'text-slate-600'
          }`}
        >
          📚 Curriculum
        </button>
        <button
          onClick={() => onSelectTab('parent')}
          className={`py-1 px-3 rounded-lg transition shrink-0 ${
            activeTab === 'parent' ? 'bg-indigo-600 text-white' : 'text-slate-600'
          }`}
        >
          👨‍👩‍👧 Parent
        </button>
        <button
          onClick={() => onSelectTab('teacher')}
          className={`py-1 px-3 rounded-lg transition shrink-0 ${
            activeTab === 'teacher' ? 'bg-indigo-600 text-white' : 'text-slate-600'
          }`}
        >
          📐 Teacher
        </button>
        <button
          onClick={() => onSelectTab('district')}
          className={`py-1 px-3 rounded-lg transition shrink-0 ${
            activeTab === 'district' ? 'bg-indigo-600 text-white' : 'text-slate-600'
          }`}
        >
          🏛️ District
        </button>
        <button
          onClick={() => onSelectTab('scratchpad')}
          className={`py-1 px-3 rounded-lg transition shrink-0 ${
            activeTab === 'scratchpad' ? 'bg-indigo-600 text-white' : 'text-slate-600'
          }`}
        >
          ✏️ Scratchpad
        </button>
      </div>
    </header>
  );
};
