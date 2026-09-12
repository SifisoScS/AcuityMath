/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import {
  UserProfile,
  NavigationTab,
  MathLesson,
  TeacherAssignment,
  NotificationItem,
  ParentAnalytics,
  AgeTier
} from './types';
import { getSavedItem, saveItem } from './utils/storage';
import { INITIAL_LESSONS, AGE_TIER_META } from './data/curriculumData';
import { OfflineSyncBanner } from './components/OfflineSyncBanner';
import { useOffline } from './offline/useOffline';
import { OfflineProvider } from './offline/OfflineContext';
import { StudentDashboard } from './components/StudentDashboard';
import { CurriculumView } from './components/CurriculumView';
import { ParentDashboard } from './components/ParentDashboard';
import { TeacherDashboard, type NewAssignmentInput } from './components/TeacherDashboard';
import { RewardsView } from './components/RewardsView';
import { ScratchpadView } from './components/ScratchpadView';
import { LandingPage } from './components/LandingPage';
import { CategoryLandingPage } from './components/CategoryLandingPage';
import { AgeSpecificPage } from './components/AgeSpecificPage';
import { CATEGORY_DETAILS, AGE_PROFILES } from './data/ageCurriculumData';
import { InteractiveLessonModal } from './components/InteractiveLessonModal';
import { RewardsModal } from './components/RewardsModal';
import { NotificationsModal } from './components/NotificationsModal';
import { useProfiles } from './hooks/useProfiles';
import { useStepUpStatus } from './hooks/useStepUp';
import { useFamilyAnalytics } from './hooks/useAnalytics';
import { useAuthoredAssignments, useLearnerAssignments } from './hooks/useAssignments';
import { useNotifications } from './hooks/useNotifications';
import { useConsent } from './hooks/useConsent';
import { useRewards } from './hooks/useRewards';
import { useScreenTime } from './hooks/useScreenTime';
import { ProfileSwitchModal } from './components/ProfileSwitchModal';
import { SignInPanel } from './components/SignInPanel';
import { ParentPinModal } from './components/ParentPinModal';
import { CoppaConsentModal } from './components/CoppaConsentModal';
import { ScreenTimeLockModal } from './components/ScreenTimeLockModal';
import { StudentQrCardModal } from './components/StudentQrCardModal';
import { ManipulativesHub } from './components/manipulatives/ManipulativesHub';
import { PlacementQuestModal } from './components/PlacementQuestModal';
import { PlacementQuestPromptModal } from './components/PlacementQuestPromptModal';
import { BilingualGlossaryModal } from './components/BilingualGlossaryModal';
import {
  Bell,
  ChevronRight,
  Clock,
  Compass,
  Eye,
  GraduationCap,
  Home,
  KeyRound,
  Languages,
  LayoutDashboard,
  LineChart,
  Menu,
  PanelLeft,
  PanelLeftClose,
  PanelLeftOpen,
  PenTool,
  QrCode,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  Trophy,
  Type,
  Users,
  Volume2,
  X
} from 'lucide-react';
import { playClickSound, speakText, stopSpeaking } from './utils/audio';
import { screenTimeMeter } from './utils/screenTime';

export default function App() {
  /**
   * Profiles now come from the server: the signed-in guardian's real children.
   *
   * What used to be `INITIAL_PROFILES` in `localStorage` — Maya, Leo and Alex,
   * invented — is a query. The shape they arrive in is unchanged, so the
   * fourteen components rendering a `UserProfile` did not have to move with the
   * data.
   *
   * `setProfiles` is gone with them. A child's name and age belong to a row, and
   * the mutation that changes one is `learners.create`; a local setter would be
   * a second source of truth that silently disagrees after a refresh.
   */
  const {
    sessionUser,
    profiles,
    activeProfile,
    activeProfileId,
    selectProfile,
    refresh: refreshProfiles,
    createLearner,
    isSignedIn,
    isResolving: isResolvingProfiles,
    isPlaceholder,
  } = useProfiles();

  // Active navigation tab (default to landing/home page)
  const [activeTab, setActiveTab] = useState<NavigationTab>('home');

  // Selected stage category & age for dedicated landing pages
  const [selectedCategoryTier, setSelectedCategoryTier] = useState<AgeTier>('early');
  const [selectedAge, setSelectedAge] = useState<number>(8);

  // Lessons
  const [lessons] = useState<MathLesson[]>(INITIAL_LESSONS);


  /*
   * Assignments, from the server.
   *
   * Two lists, because they answer different questions and are guarded
   * differently. `forLearner` is what the child in front of the screen has been
   * set, scoped by `learnerProcedure` so it cannot return a sibling's work.
   * `authored` is what this adult has set, for the teacher view.
   *
   * They were one array in React state seeded from `INITIAL_ASSIGNMENTS`, so a
   * teacher who set homework and reloaded the page had set nothing.
   */
  const learnerAssignments = useLearnerAssignments(activeProfile.learnerId ?? null);

  /** Buying and equipping avatars, against the server's catalogue and balance. */
  const rewards = useRewards(activeProfile.learnerId ?? null);

  const {
    assignments: authoredAssignments,
    concepts: assignableConcepts,
    assignableStudents,
    assignableLearnerIds,
    create: createAssignment
  } = useAuthoredAssignments(isSignedIn);

  /*
   * The bell, from the server.
   *
   * Two lists merged: what the signed-in adult has been told, and what the
   * selected child has. A family device has both in front of it.
   */
  const {
    notifications,
    unreadCount: unreadNotificationCount,
    markAllRead: markNotificationsRead,
    clear: clearNotifications,
    toggleRead: toggleNotificationRead
  } = useNotifications(activeProfile.learnerId ?? null, isSignedIn);

  /*
   * The offline queue.
   *
   * This was `syncState`: a `pendingActions` array in React state mirrored to
   * localStorage, with a `syncLogs` list seeded with an invented "Initial Cloud
   * Profile Sync" entry and a `lastSyncedAt` of "Just now" for an application
   * that had just started and synced nothing.
   *
   * Every figure the banner shows now comes from the queue itself, and an item
   * leaves that queue only when the server has confirmed it.
   */
  const offline = useOffline();

  // Accessibility flags
  const [highContrast, setHighContrast] = useState(false);
  const [dyslexicFont, setDyslexicFont] = useState(false);
  const [ttsEnabled, setTtsEnabled] = useState(false);

  // Sidebar visibility state: open by default on desktop, closed on mobile
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false);

  // Modals
  const [activeLesson, setActiveLesson] = useState<MathLesson | null>(null);
  const [isRewardsModalOpen, setIsRewardsModalOpen] = useState(false);
  const [isNotificationsOpen, setIsNotificationsOpen] = useState(false);
  const [isProfileModalOpen, setIsProfileModalOpen] = useState(false);

  // Phase 1: Security, Persistent Cloud Data & COPPA
  //
  // `authenticatedRoles` is gone. It was a client-side record of which roles a
  // modal had approved — trivially set from devtools, and meaningless to the
  // API, which never saw it. What replaces it is `isElevated`, read from the
  // server, and `elevatedProcedure`, which refuses regardless of what the
  // client believes.
  const { isElevated } = useStepUpStatus();
  /**
   * A parent's view of their children, from the server.
   *
   * `INITIAL_ANALYTICS` was seven days of invented activity per child and a
   * recommended action written into `storage.ts`. Every figure is derived from
   * the child's own answers now, and the fields with no honest source — focus
   * alerts, which nothing records — stay at zero rather than being filled in to
   * look complete.
   *
   * Fetched only once elevated, because that is what the step-up protects.
   */
  const {
    analyticsMap,
    needsStepUp: analyticsNeedsStepUp,
    refresh: refreshAnalytics,
    setScreenTimeLimit,
  } = useFamilyAnalytics(isElevated === true);

  /** Set when an account lacks the role a surface needs, rather than the PIN. */
  const [blockedSurface, setBlockedSurface] = useState<'parent' | 'teacher' | 'admin' | null>(null);
  const [isParentPinOpen, setIsParentPinOpen] = useState(false);
  const [targetProtectedRole, setTargetProtectedRole] = useState<'parent' | 'teacher' | 'admin'>('parent');
  const [targetProtectedTab, setTargetProtectedTab] = useState<NavigationTab | null>(null);
  const [targetProtectedProfile, setTargetProtectedProfile] = useState<UserProfile | null>(null);

  const [isCoppaModalOpen, setIsCoppaModalOpen] = useState(false);
  /** Set when the consent modal stood aside for the PIN prompt, so it can return. */
  const [reopenConsentAfterPin, setReopenConsentAfterPin] = useState(false);
  /*
   * Consent, from the ledger.
   *
   * This was `useState(true)` — a fail-open default, of the same family as the
   * `verifyPin` wrapper that returned `{ valid: true }` from its catch block.
   * Until a legacy endpoint answered, the application assumed consent, and the
   * badge below rendered green on that assumption.
   *
   * `allCovered` is false until every child on the account is covered under the
   * current terms, which is also false while it is still loading. There is no
   * state in which this asserts consent it has not read.
   */
  const consent = useConsent(isSignedIn);
  const hasCoppaConsent = consent.allCovered;

  const [isScreenLocked, setIsScreenLocked] = useState(false);
  const [lockedTimeData, setLockedTimeData] = useState({ todayMinutes: 45, limitMinutes: 45 });

  const [isQrCardModalOpen, setIsQrCardModalOpen] = useState(false);
  const [qrStudentData, setQrStudentData] = useState<{
    name: string;
    age: number;
    avatar: string;
    tier: string;
    pin: string;
    qrToken: string;
    pictureSequence: string[];
  } | null>(null);

  // Quick-Wins: Placement Quest & Bilingual Vocabulary Scaffolding
  const [isPlacementQuestOpen, setIsPlacementQuestOpen] = useState(false);
  const [showPlacementPrompt, setShowPlacementPrompt] = useState(false);
  const [isSignInOpen, setIsSignInOpen] = useState(false);

  /**
   * What the sign-in callback said, taken from the query string once.
   *
   * The callback redirects rather than rendering, so the token never sits in
   * the address bar — but the *outcome* has to reach the page somehow, and a
   * query parameter is the only channel a redirect has. Read and cleared on
   * mount so a refresh does not repeat the message.
   */
  const [signInNotice, setSignInNotice] = useState<string | null>(() => {
    if (typeof window === 'undefined') return null;
    const status = new URLSearchParams(window.location.search).get('signin');
    if (!status) return null;
    window.history.replaceState({}, '', window.location.pathname);
    return (
      {
        ok: 'You are signed in.',
        expired: 'That sign-in link has expired. Ask for a new one.',
        'already-used': 'That sign-in link has already been used. Ask for a new one.',
        invalid: 'That sign-in link was not valid. Ask for a new one.',
        unknown: 'That sign-in link was not recognised. Ask for a new one.',
      } as Record<string, string>
    )[status] ?? null;
  });

  const [isGlossaryModalOpen, setIsGlossaryModalOpen] = useState(false);

  // Automated Placement Quest First-Login Onboarding Prompt
  useEffect(() => {
    if (activeProfile.role === 'student' && !activeProfile.diagnosticComplete) {
      const key = `dismissed_placement_prompt_${activeProfile.id}`;
      if (!sessionStorage.getItem(key)) {
        const timer = setTimeout(() => {
          setShowPlacementPrompt(true);
        }, 900);
        return () => clearTimeout(timer);
      }
    } else {
      setShowPlacementPrompt(false);
    }
  }, [activeProfile.id, activeProfile.role, activeProfile.diagnosticComplete]);

  /*
   * A `getBootstrap()` call stood here, reading `coppaStatus.isCompliant` from
   * `/api/bootstrap` — which reads `data_store.json`, the pre-migration JSON
   * file nothing else consults. Consent comes from `consent_events` now.
   */

  /*
   * Screen time, counted by the server.
   *
   * This was a `setInterval` posting to `/api/students/:id/heartbeat` with an
   * `elapsedSeconds` this file chose. It sent `activeProfile.id` — `learner-12`
   * — to a route reading a JSON store keyed `student_1..4`, so every beat
   * 404ed, `sendHeartbeat` returned `null`, `if (res)` was false, and **no
   * child was ever locked out.** The parent's limit saved, displayed, and did
   * nothing.
   *
   * The hook beats only for a profile actually practising, so a parent opening
   * a dashboard does not spend their child's allowance.
   */
  const screenTime = useScreenTime(
    activeProfile.learnerId ?? null,
    activeProfile.role === 'student',
  );

  useEffect(() => {
    if (!screenTime.isLocked) return;
    setIsScreenLocked(true);
    setLockedTimeData({
      todayMinutes: screenTime.minutesSpent,
      limitMinutes: screenTime.limitMinutes ?? 0,
    });
  }, [screenTime.isLocked, screenTime.minutesSpent, screenTime.limitMinutes]);

  // Save changes to localStorage
  //
  // The two effects that mirrored `profiles` and the active profile id here are
  // gone. Children are rows now, and `useProfiles` owns the one thing that is
  // still local — which child this browser tab is looking at.
  //
  // Leaving them would have been worse than redundant: `profiles` starts empty
  // while the query is in flight, so the effect wrote `[]` over whatever was
  // stored, on every load, before the real children had arrived.

  // Assignments are rows on the server now, so there is nothing to persist
  // here. Writing them back to localStorage would give a stale second copy that
  // a reload could show instead of what was actually set.

  // Notifications are rows on the server now. Writing them back to localStorage
  // would keep a stale copy whose 'read' flags disagree with the ones the bell
  // was actually cleared on.

  // The queue lives in IndexedDB and is its own record. Mirroring it to
  // localStorage would give a second, stale copy of what is unsent.

  // Analytics is the server's answer now, so it is not written back to
  // localStorage. Persisting it copied one child's mastery and error patterns
  // onto a shared family device, and nothing ever read the copy.

  // Screen time. `screenTimeMeter` holds the rule that a limit of zero means
  // *no limit set* rather than a limit of zero minutes — see the note there for
  // what inlining that distinction cost twice.
  const {
    minutesUsed: screenMinutesUsed,
    limitMinutes: screenLimitMinutes,
    hasLimit: hasScreenLimit,
    isNearLimit: isNearScreenLimit,
  } = screenTimeMeter(analyticsMap[activeProfile.id]);

  // Handle student lesson completion
  const handleLessonComplete = (results: {
    lessonId: string;
    xpEarned: number;
    coinsEarned: number;
    accuracy: number;
    newLevel: number;
    newElo: number;
  }) => {
    // XP, coins, level and ELO were computed here and written to local state.
    // They are the server's now — `recordAttempt` moves mastery and the 3PL
    // estimate inside one transaction — so this asks for the new numbers
    // instead of inventing a second set that disagrees after a refresh.
    refreshProfiles();

    /*
     * A second submission stood here, to `/api/students/:id/attempts`. It could
     * not succeed — it sent `activeProfile.id` (`learner-12`) to a route keyed
     * `student_1..4` — and its `.catch` logged "Offline queue fallback for
     * attempt", which was false: nothing was queued and the answer was dropped.
     *
     * The attempt is already recorded. `usePractice.submit` sends it where the
     * `clientId` is known, inside the transaction that moves mastery, and
     * `refreshProfiles` above reads back what the server made of it.
     */

    /*
     * The lesson-completion path used to push a `LESSON_COMPLETE` action onto
     * `pendingActions` when the offline toggle was set, and otherwise append a
     * "synced" log line. Neither did anything durable.
     *
     * Answers are queued where they are given — `usePractice.submit` — because
     * that is the only place that knows the `clientId` the server deduplicates
     * on. There is nothing to queue here.
     */
  };

  /*
   * `handleToggleOfflineMode` and `triggerCloudSync` stood here.
   *
   * `triggerCloudSync` called `apiService.syncBatch(...)` without awaiting it,
   * attached `.catch(err => console.warn(...))`, and then a `setTimeout` cleared
   * `pendingActions` and wrote "Synced to Server: ..." log lines regardless of
   * what had happened. A failed sync reported success and discarded the child's
   * answers.
   *
   * `useOffline` replaces both. It drains on reconnect, on mount and on demand,
   * and removes an item only once the server has said it has it.
   */

  /**
   * A component reporting that the learner moved.
   *
   * Nothing is written locally: whatever changed was recorded server-side by
   * the procedure that changed it, and this re-reads rather than guessing. The
   * argument is kept in the signature because fourteen components pass it, and
   * dropping it would be a churn this slice does not need.
   */
  const handleUpdateActiveUser = (_updated: Partial<UserProfile>) => {
    refreshProfiles();
  };

  /*
   * Sets work.
   *
   * Rejections are re-thrown rather than swallowed: the form shows the server's
   * reason. Swallowing it would put a success toast on a refused write, which is
   * what the old local-state version did unconditionally.
   */
  const handleCreateAssignment = async (input: NewAssignmentInput) => {
    await createAssignment(input);
  };

  /*
   * `handleSendStudentNotification` stood here.
   *
   * It put a local notification in the bell saying `Mr. Henderson assigned "X"`
   * — whoever was actually signed in — and it vanished on reload. Setting work
   * now raises the notification server-side, in the same call that writes the
   * assignment targets, so the child is told once and the record survives.
   */

  // Screen time update from parent
  const handleUpdateScreenTime = (studentId: string, minutes: number) => {
    void setScreenTimeLimit(studentId, minutes);
  };

  // Stage change handler
  const handleSelectAgeTier = (tier: AgeTier) => {
    playClickSound();
    handleUpdateActiveUser({ tier });
    if (ttsEnabled) {
      const meta = AGE_TIER_META[tier];
      speakText(`Switched to ${meta.label} for ages ${meta.ageRange}`);
    }
  };

  /**
   * Which adult role a tab requires, or null if anyone may open it.
   *
   * `district` was missing from this guard, so the command centre — every
   * campus's mean ability, intervention flags, and a one-click CSV of the lot —
   * opened to whoever clicked it. It is demonstration data today, which is
   * exactly why the gap would have survived into a pilot.
   */
  const roleRequiredFor = (tab: NavigationTab): 'parent' | 'teacher' | 'admin' | null => {
    if (tab === 'parent') return 'parent';
    if (tab === 'teacher') return 'teacher';
    // Kept although the tab is unreachable: if the District Hub is rebuilt,
    // this is what stops it appearing without a role behind it. Deleting the
    // entry would make a returning surface ungated by default.
    if (tab === 'district') return 'admin';
    return null;
  };

  /**
   * Whether this account may open a surface at all.
   *
   * Separate from the PIN, and asked first. A PIN proves an adult is present;
   * it says nothing about *which* adult, and a parent entering the right PIN
   * must still not reach a district export. Asking for a PIN they could type
   * correctly and still be refused wastes their time and teaches them the
   * prompt is meaningless.
   *
   * An administrator reaches everything, which is what the role is for.
   */
  const accountMayReach = (required: 'parent' | 'teacher' | 'admin'): boolean => {
    const role = sessionUser?.role;
    if (!role) return false;
    if (role === 'admin') return true;
    return role === required;
  };

  /**
   * Tab navigation, gated by the server rather than by a flag in this component.
   *
   * `authenticatedRoles` used to live here — a record set to true when a modal
   * said so, which any React devtools user could set themselves and which meant
   * nothing to the API. Elevation is a short-lived signed cookie the server
   * issues and checks, and `elevatedProcedure` refuses without it whatever the
   * client believes.
   */
  const handleNavigate = (tab: NavigationTab) => {
    playClickSound();
    const required = roleRequiredFor(tab);

    if (required) {
      if (!sessionUser) {
        setIsSignInOpen(true);
        setIsMobileSidebarOpen(false);
        return;
      }
      if (!accountMayReach(required)) {
        setBlockedSurface(required);
        setIsMobileSidebarOpen(false);
        return;
      }
      if (!isElevated) {
        setTargetProtectedRole(required);
        setTargetProtectedTab(tab);
        setTargetProtectedProfile(null);
        setIsParentPinOpen(true);
        setIsMobileSidebarOpen(false);
        return;
      }
    }

    setActiveTab(tab);
    setIsMobileSidebarOpen(false);
  };

  // Open specific Category Landing Page
  const handleOpenCategory = (tier: AgeTier) => {
    playClickSound();
    setSelectedCategoryTier(tier);
    setActiveTab('category');
    setIsMobileSidebarOpen(false);
    if (ttsEnabled) {
      const meta = CATEGORY_DETAILS[tier];
      speakText(`Viewing ${meta.title} landing page for ${meta.ageRange}`);
    }
  };

  // Open specific Age Page (Ages 3 through 18)
  const handleOpenAge = (ageNum: number) => {
    playClickSound();
    setSelectedAge(ageNum);
    const tier = AGE_PROFILES[ageNum]?.tier || 'elementary';
    setSelectedCategoryTier(tier);
    setActiveTab('age');
    setIsMobileSidebarOpen(false);
    if (ttsEnabled) {
      const p = AGE_PROFILES[ageNum];
      speakText(`Viewing Age ${ageNum} page: ${p?.title || ''}`);
    }
  };

  // Start learning session from category or age page
  const handleStartLearningWithAge = (tier: AgeTier, specificAge?: number) => {
    playClickSound();
    handleSelectAgeTier(tier);
    if (specificAge && activeProfile.role === 'student') {
      handleUpdateActiveUser({ age: specificAge, tier });
    }
    setActiveTab('student');
    setIsMobileSidebarOpen(false);
  };

  // TTS audio toggle
  const handleToggleTTS = () => {
    playClickSound();
    const next = !ttsEnabled;
    setTtsEnabled(next);
    if (next) {
      speakText(`Text to speech activated on AcuityMath. Active profile is ${activeProfile.name}, Level ${activeProfile.dynamicLevel}.`);
    } else {
      stopSpeaking();
    }
  };

  const studentProfiles = profiles.filter(p => p.role === 'student');
  // Counted by `useNotifications` over the merged list, so the badge and the
  // modal cannot disagree about what is unread.
  const unreadCount = unreadNotificationCount;

  const pageTitleMap: Record<NavigationTab, { title: string; subtitle: string }> = {
    home: {
      title: 'Welcome to AcuityMath',
      subtitle: 'Adaptive Mathematical Learning Ecosystem for Ages 3 to 18'
    },
    category: {
      title: CATEGORY_DETAILS[selectedCategoryTier]?.title || 'Category Stage',
      subtitle: `${CATEGORY_DETAILS[selectedCategoryTier]?.ageRange || ''} · ${CATEGORY_DETAILS[selectedCategoryTier]?.subtitle || ''}`
    },
    age: {
      title: AGE_PROFILES[selectedAge]?.title || `Age ${selectedAge}`,
      subtitle: `${AGE_PROFILES[selectedAge]?.gradeLevel || ''} · ${AGE_PROFILES[selectedAge]?.subtitle || ''}`
    },
    student: {
      title: 'Dashboard',
      subtitle: `Welcome back, ${activeProfile.name} ⭐`
    },
    curriculum: {
      title: 'Curriculum Explorer',
      subtitle: 'Comprehensive mathematical progression across all stages'
    },
    labs: {
      title: 'Virtual Math Labs & Manipulatives',
      subtitle: 'Concrete ➔ Representational ➔ Abstract tactile learning'
    },
    parent: {
      title: 'Parent Analytics',
      subtitle: 'Real-time performance velocity, screen time & mastery oversight'
    },
    teacher: {
      title: 'Teacher Command',
      subtitle: 'Classroom roster management & custom task assignment'
    },
    district: {
      title: 'District Command Center',
      subtitle: 'Multi-campus mathematics pacing, CCSS alignment & LMS grade passback orchestration'
    },
    rewards: {
      title: 'Rewards Vault',
      subtitle: 'Unlockable avatars, milestone badges & star economy'
    },
    scratchpad: {
      title: 'Digital Scratchpad',
      subtitle: 'Mathematical workspace with symbol stamping and snapshot export'
    }
  };

  return (
    // Every surface that records an answer reaches the queue through this, so a
    // new one cannot bypass it by not being handed a prop.
    <OfflineProvider value={offline}>
    <div
      className={`h-screen w-full overflow-hidden flex flex-col lg:flex-row transition-colors duration-200 ${
        highContrast ? 'contrast-125 bg-black text-white' : 'bg-slate-50 text-slate-900'
      } ${dyslexicFont ? 'font-fredoka tracking-wide' : ''}`}
    >
      {/* Mobile Drawer Backdrop */}
      {isMobileSidebarOpen && (
        <div
          className="fixed inset-0 bg-slate-900/50 backdrop-blur-xs z-40 lg:hidden transition-opacity"
          onClick={() => {
            playClickSound();
            setIsMobileSidebarOpen(false);
          }}
        />
      )}

      {/* ===== SIDEBAR NAVIGATION ===== */}
      <aside
        className={`
          bg-white border-r border-slate-200 p-5 flex flex-col justify-between shrink-0 shadow-xs z-40
          transition-all duration-300 ease-in-out
          fixed inset-y-0 left-0 w-72 h-full overflow-y-auto lg:static lg:h-full lg:overflow-y-auto
          ${isMobileSidebarOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}
          ${isSidebarOpen ? 'lg:w-64 lg:flex' : 'lg:hidden'}
        `}
      >
        <div>
          {/* Brand Logo & Close/Hide Toggle */}
          <div className="flex items-center justify-between pb-5 border-b border-slate-200 mb-5">
            <div
              onClick={() => handleNavigate('home')}
              aria-current={activeTab === 'home' ? 'page' : undefined}
              className="flex items-center gap-3 cursor-pointer"
            >
              <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-indigo-600 via-indigo-500 to-sky-400 text-white flex items-center justify-center font-black text-xl shadow-md shadow-indigo-100">
                ∑
              </div>
              <div>
                <div className="flex items-center gap-1.5">
                  <span className="font-extrabold text-base tracking-tight text-slate-900">
                    Acuity<span className="text-indigo-600">Math</span>
                  </span>
                  <span className="text-[10px] font-bold uppercase px-1.5 py-0.5 bg-indigo-50 text-indigo-700 rounded">
                    v2.4
                  </span>
                </div>
                <span className="text-[11px] text-slate-400 font-bold block">Adaptive Math 3–18</span>
              </div>
            </div>

            {/* Collapse/Close Toggle */}
            <button
              onClick={() => {
                playClickSound();
                setIsSidebarOpen(false);
                setIsMobileSidebarOpen(false);
              }}
              className="p-1.5 rounded-xl hover:bg-slate-100 text-slate-400 hover:text-slate-700 transition cursor-pointer"
              title="Hide sidebar"
              aria-label="Hide sidebar"
            >
              <PanelLeftClose className="w-5 h-5 hidden lg:block" />
              <X className="w-5 h-5 lg:hidden" />
            </button>
          </div>

          {/* Navigation Links */}
          <nav className="space-y-1">
            <button
              onClick={() => handleNavigate('home')}
              aria-current={activeTab === 'home' ? 'page' : undefined}
              className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-2xl text-xs font-bold transition cursor-pointer ${
                activeTab === 'home'
                  ? 'bg-indigo-600 text-white shadow-sm'
                  : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
              }`}
            >
              <Home className="w-4 h-4" />
              <span>Home</span>
            </button>

            {/* Stages & Categories */}
            <div className="pt-2 pb-1">
              <div className="px-3.5 text-[10px] font-extrabold uppercase tracking-wider text-slate-400 mb-1">
                Stages (Ages 3–18)
              </div>
              <div className="space-y-0.5">
                {[
                  { tier: 'early' as AgeTier, label: 'Early Sprouts', ages: '3–6', icon: '🌱' },
                  { tier: 'elementary' as AgeTier, label: 'Math Navigators', ages: '7–10', icon: '🚀' },
                  { tier: 'middle' as AgeTier, label: 'Algebra Voyagers', ages: '11–14', icon: '⚡' },
                  { tier: 'high' as AgeTier, label: 'STEM Pioneers', ages: '15–18', icon: '🌌' }
                ].map(cat => {
                  const isCatActive =
                    (activeTab === 'category' && selectedCategoryTier === cat.tier) ||
                    (activeTab === 'age' && AGE_PROFILES[selectedAge]?.tier === cat.tier);
                  return (
                    <button
                      key={cat.tier}
                      onClick={() => handleOpenCategory(cat.tier)}
                      aria-current={isCatActive ? 'page' : undefined}
                      className={`w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs font-bold transition cursor-pointer ${
                        isCatActive
                          ? 'bg-indigo-50 text-indigo-700 font-extrabold border border-indigo-200/80 shadow-2xs'
                          : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                      }`}
                    >
                      <span className="flex items-center gap-2">
                        <span>{cat.icon}</span>
                        <span>{cat.label}</span>
                      </span>
                      <span className="text-[10px] text-slate-400 font-semibold bg-slate-50 px-1.5 py-0.5 rounded">
                        {cat.ages}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="pt-2">
              <div className="px-3.5 text-[10px] font-extrabold uppercase tracking-wider text-slate-400 mb-1">
                Platform Views
              </div>
            </div>

            <button
              onClick={() => handleNavigate('student')}
              aria-current={activeTab === 'student' ? 'page' : undefined}
              className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-2xl text-xs font-bold transition cursor-pointer ${
                activeTab === 'student'
                  ? 'bg-indigo-600 text-white shadow-sm'
                  : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
              }`}
            >
              <LayoutDashboard className="w-4 h-4" />
              <span>Dashboard</span>
            </button>

            <button
              onClick={() => handleNavigate('curriculum')}
              aria-current={activeTab === 'curriculum' ? 'page' : undefined}
              className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-2xl text-xs font-bold transition cursor-pointer ${
                activeTab === 'curriculum'
                  ? 'bg-indigo-600 text-white shadow-sm'
                  : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
              }`}
            >
              <GraduationCap className="w-4 h-4" />
              <span>Curriculum</span>
            </button>

            <button
              onClick={() => handleNavigate('labs')}
              aria-current={activeTab === 'labs' ? 'page' : undefined}
              className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-2xl text-xs font-bold transition cursor-pointer ${
                activeTab === 'labs'
                  ? 'bg-indigo-600 text-white shadow-sm'
                  : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
              }`}
            >
              <div className="flex items-center gap-3">
                <Compass className="w-4 h-4" />
                <span>Math Labs (CRA)</span>
              </div>
              <span
                className={`text-[9px] px-1.5 py-0.5 rounded font-black uppercase tracking-wider ${
                  activeTab === 'labs'
                    ? 'bg-indigo-500 text-white'
                    : 'bg-emerald-100 text-emerald-800'
                }`}
              >
                Lab
              </span>
            </button>

            <button
              onClick={() => handleNavigate('parent')}
              aria-current={activeTab === 'parent' ? 'page' : undefined}
              className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-2xl text-xs font-bold transition cursor-pointer ${
                activeTab === 'parent'
                  ? 'bg-indigo-600 text-white shadow-sm'
                  : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
              }`}
            >
              <LineChart className="w-4 h-4" />
              <span>Parent Analytics</span>
            </button>

            <button
              onClick={() => handleNavigate('teacher')}
              aria-current={activeTab === 'teacher' ? 'page' : undefined}
              className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-2xl text-xs font-bold transition cursor-pointer ${
                activeTab === 'teacher'
                  ? 'bg-indigo-600 text-white shadow-sm'
                  : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
              }`}
            >
              <Users className="w-4 h-4" />
              <span>Teacher</span>
            </button>

            <button
              onClick={() => handleNavigate('rewards')}
              aria-current={activeTab === 'rewards' ? 'page' : undefined}
              className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-2xl text-xs font-bold transition cursor-pointer ${
                activeTab === 'rewards'
                  ? 'bg-indigo-600 text-white shadow-sm'
                  : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
              }`}
            >
              <Trophy className="w-4 h-4" />
              <span>Rewards Vault</span>
            </button>

            <button
              onClick={() => handleNavigate('scratchpad')}
              aria-current={activeTab === 'scratchpad' ? 'page' : undefined}
              className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-2xl text-xs font-bold transition cursor-pointer ${
                activeTab === 'scratchpad'
                  ? 'bg-indigo-600 text-white shadow-sm'
                  : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
              }`}
            >
              <PenTool className="w-4 h-4" />
              <span>Scratchpad</span>
            </button>

            {/* Quick-Win 1: Placement Quest (Adaptive Diagnostic) */}
            {activeProfile.role === 'student' && (
              <button
                onClick={() => {
                  playClickSound();
                  setIsPlacementQuestOpen(true);
                }}
                className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-2xl text-xs font-bold transition cursor-pointer ${
                  !activeProfile.diagnosticComplete
                    ? 'bg-amber-500 text-white shadow-xs animate-pulse'
                    : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                }`}
                title="Adaptive 7-Item Diagnostic Benchmark (3PL IRT)"
              >
                <div className="flex items-center gap-3">
                  <Compass className="w-4 h-4 text-amber-300" />
                  <span>Placement Quest</span>
                </div>
                <span
                  className={`text-[9px] px-1.5 py-0.5 rounded font-black uppercase tracking-wider ${
                    !activeProfile.diagnosticComplete
                      ? 'bg-amber-600 text-white'
                      : 'bg-emerald-100 text-emerald-800'
                  }`}
                >
                  {!activeProfile.diagnosticComplete ? 'Start' : 'Calibrated'}
                </span>
              </button>
            )}

            {/* Quick-Win 2: Bilingual Vocabulary Scaffolding */}
            <button
              onClick={() => {
                playClickSound();
                setIsGlossaryModalOpen(true);
              }}
              className="w-full flex items-center justify-between px-3.5 py-2.5 rounded-2xl text-xs font-bold text-slate-600 hover:bg-indigo-50 hover:text-indigo-900 transition cursor-pointer group"
              title="Dual-Language Math Glossary with Audio Pronunciation (English/Español)"
            >
              <div className="flex items-center gap-3">
                <Languages className="w-4 h-4 text-indigo-600 group-hover:scale-110 transition-transform" />
                <span>Dual Vocab</span>
              </div>
              <span className="text-[9px] px-1.5 py-0.5 rounded font-black bg-indigo-100 text-indigo-800 uppercase tracking-wider">
                EN/ES
              </span>
            </button>
          </nav>
        </div>

        {/* Sidebar Footer: Profile Card & PIN */}
        <div className="pt-4 border-t border-slate-200 mt-6 space-y-2">
          <button
            onClick={() => {
              playClickSound();
              setIsProfileModalOpen(true);
            }}
            className="w-full flex items-center gap-3 p-2.5 rounded-2xl bg-slate-100 hover:bg-slate-200/80 transition cursor-pointer border border-slate-200/80 text-left"
            title="Switch User Profile"
          >
            <div className="w-9 h-9 rounded-xl bg-white flex items-center justify-center text-xl shadow-xs shrink-0">
              {activeProfile.avatar}
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-xs font-extrabold text-slate-900 truncate">
                {activeProfile.name}
              </div>
              <div className="text-[10px] text-indigo-600 font-bold">
                {activeProfile.role === 'student' ? `Level ${activeProfile.dynamicLevel}` : activeProfile.role}
              </div>
            </div>
            <ChevronRight className="w-4 h-4 text-slate-400 shrink-0" />
          </button>

          <div className="flex items-center justify-center gap-1.5 text-[10px] font-semibold text-slate-400">
            <ShieldAlert className="w-3 h-3" />
            <span>Parent/Teacher PIN: ●●●●</span>
          </div>
        </div>
      </aside>

      {/* ===== MAIN CONTENT AREA ===== */}
      <div className="flex-1 flex flex-col min-w-0 h-full overflow-hidden">
        {/* Offline Banner */}
        <div className="shrink-0">
          <OfflineSyncBanner
            status={offline.status}
            pendingCount={offline.pendingCount}
            pending={offline.pending}
            lastSyncedAt={offline.lastSyncedAt}
            lastError={offline.lastError}
            isSyncing={offline.isSyncing}
            onSetSimulatedOffline={offline.setSimulatedOffline}
            onTriggerSync={() => void offline.sync()}
          />
        </div>

        {/* Topbar */}
        <header className="bg-white/95 backdrop-blur-md border-b border-slate-200 px-4 sm:px-8 py-3.5 shrink-0 z-20 shadow-xs flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            {/* Toggle Sidebar Button */}
            <button
              onClick={() => {
                playClickSound();
                if (window.innerWidth < 1024) {
                  setIsMobileSidebarOpen(prev => !prev);
                } else {
                  setIsSidebarOpen(prev => !prev);
                }
              }}
              className="p-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 transition cursor-pointer flex items-center gap-2 border border-slate-200 shrink-0"
              title={
                (window.innerWidth < 1024 ? isMobileSidebarOpen : isSidebarOpen)
                  ? 'Hide sidebar'
                  : 'Open sidebar'
              }
              aria-label="Toggle navigation sidebar"
            >
              {(window.innerWidth < 1024 ? isMobileSidebarOpen : isSidebarOpen) ? (
                <PanelLeftClose className="w-4 h-4 text-slate-600" />
              ) : (
                <PanelLeftOpen className="w-4 h-4 text-indigo-600" />
              )}
              <span className="text-xs font-bold hidden sm:inline text-slate-700">
                {(window.innerWidth < 1024 ? isMobileSidebarOpen : isSidebarOpen)
                  ? 'Hide Menu'
                  : 'Open Menu'}
              </span>
            </button>

            <div>
              <h1 className="text-xl sm:text-2xl font-black tracking-tight text-slate-900">
                {pageTitleMap[activeTab].title}
              </h1>
              <p className="text-xs font-semibold text-slate-400">
                {pageTitleMap[activeTab].subtitle}
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 sm:gap-2.5">
            {/* Child QR / Picture Login Badge */}
            {activeProfile.role === 'student' && (
              <button
                onClick={() => {
                  playClickSound();
                  setQrStudentData({
                    name: activeProfile.name,
                    age: activeProfile.age || 8,
                    avatar: activeProfile.avatar,
                    tier: activeProfile.tier,
                    pin: activeProfile.pin || '1234',
                    qrToken: `ACUITY_STUDENT_QR_${activeProfile.name.toUpperCase()}_${activeProfile.id}`,
                    pictureSequence: ['⭐', '🚀', '🍎']
                  });
                  setIsQrCardModalOpen(true);
                }}
                className="px-2.5 py-1.5 rounded-full border border-indigo-200 bg-indigo-50/90 hover:bg-indigo-100 text-indigo-700 text-xs font-bold transition cursor-pointer flex items-center gap-1.5 shadow-2xs"
                title="View / Print Child Login QR & Picture Passcode Badge"
              >
                <QrCode className="w-3.5 h-3.5 text-indigo-600" />
                <span className="hidden md:inline">Login Badge</span>
              </button>
            )}

            <button
              onClick={() => {
                playClickSound();
                setIsSignInOpen(true);
              }}
              className="px-2.5 py-1.5 rounded-full border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-xs font-bold transition cursor-pointer flex items-center gap-1.5 shadow-2xs"
              title="Sign in as a parent or educator"
            >
              <KeyRound className="w-3.5 h-3.5 text-slate-500" />
              <span className="hidden md:inline">Sign In</span>
            </button>

            {/* COPPA & FERPA Compliance Indicator */}
            <button
              onClick={() => {
                playClickSound();
                setIsCoppaModalOpen(true);
              }}
              className={`px-2.5 py-1.5 rounded-full border text-xs font-bold flex items-center gap-1.5 transition cursor-pointer shadow-2xs ${
                hasCoppaConsent
                  ? 'border-emerald-300 bg-emerald-50 text-emerald-800 hover:bg-emerald-100'
                  : 'border-amber-300 bg-amber-50 text-amber-800 hover:bg-amber-100 animate-pulse'
              }`}
              /*
                The tooltip read "Child Data Safeguards (COPPA VPC Certified &
                Zero PII Mode)" and the label "COPPA Verified" — a certification
                claim, rendered green by a default that assumed consent. Nobody
                certified anything. It says what the ledger says.
              */
              title={
                hasCoppaConsent
                  ? 'You have given permission for your children\'s progress to be recorded'
                  : 'Permission to record your children\'s progress has not been given yet'
              }
            >
              <ShieldCheck
                className={`w-3.5 h-3.5 ${hasCoppaConsent ? 'text-emerald-600' : 'text-amber-600'}`}
              />
              <span className="hidden sm:inline">
                {hasCoppaConsent ? 'Permission given' : 'Permission needed'}
              </span>
            </button>

            {/* Screen Time Badge — only when a parent has actually set a limit. */}
            {hasScreenLimit && (
            <span
              className={`px-3 py-1.5 rounded-full border text-xs font-bold flex items-center gap-1.5 shadow-xs ${
                isNearScreenLimit
                  ? 'border-rose-300 bg-rose-50 text-rose-700 animate-pulse'
                  : 'border-slate-200 bg-white text-slate-700'
              }`}
            >
              <Clock className={`w-3.5 h-3.5 ${isNearScreenLimit ? 'text-rose-600' : 'text-slate-500'}`} />
              <span>
                {Math.round(screenMinutesUsed)} / {screenLimitMinutes}m
              </span>
            </span>
            )}

            {/* Quick-Win 2: Bilingual Glossary Quick Button */}
            <button
              onClick={() => {
                playClickSound();
                setIsGlossaryModalOpen(true);
              }}
              className="px-2.5 py-1.5 rounded-full border border-indigo-200 bg-indigo-50/70 hover:bg-indigo-100 text-indigo-700 text-xs font-bold transition cursor-pointer flex items-center gap-1.5 shadow-2xs"
              title="Dual-Language Math Vocabulary Glossary (EN/ES)"
            >
              <Languages className="w-3.5 h-3.5 text-indigo-600" />
              <span className="text-[11px] font-extrabold">ES/EN</span>
            </button>

            {/* Accessibility Toggles: TTS, Contrast, Dys */}
            <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-full border border-slate-200">
              <button
                onClick={handleToggleTTS}
                className={`p-1.5 rounded-full transition cursor-pointer ${
                  ttsEnabled ? 'bg-emerald-600 text-white' : 'text-slate-600 hover:bg-slate-200'
                }`}
                title={ttsEnabled ? 'Disable TTS' : 'Enable TTS'}
              >
                <Volume2 className="w-3.5 h-3.5" />
              </button>

              <button
                onClick={() => {
                  playClickSound();
                  setHighContrast(prev => !prev);
                }}
                className={`p-1.5 rounded-full transition cursor-pointer ${
                  highContrast ? 'bg-indigo-600 text-white' : 'text-slate-600 hover:bg-slate-200'
                }`}
                title="Toggle High Contrast"
              >
                <Eye className="w-3.5 h-3.5" />
              </button>

              <button
                onClick={() => {
                  playClickSound();
                  setDyslexicFont(prev => !prev);
                }}
                className={`p-1.5 rounded-full transition cursor-pointer ${
                  dyslexicFont ? 'bg-indigo-600 text-white' : 'text-slate-600 hover:bg-slate-200'
                }`}
                title="Toggle High Readability Font"
              >
                <Type className="w-3.5 h-3.5" />
              </button>
            </div>

            {/* Notifications Bell */}
            <button
              onClick={() => {
                playClickSound();
                setIsNotificationsOpen(true);
              }}
              className="relative p-2 rounded-full bg-slate-100 hover:bg-slate-200 transition cursor-pointer text-slate-600"
              title="Notifications & Milestones"
              aria-label={
                unreadCount > 0
                  ? `Notifications, ${unreadCount} unread`
                  : 'Notifications, none unread'
              }
            >
              <Bell className="w-4 h-4" />
              {/*
                A bare dot. It carried no text of any kind, so the count was
                available only to someone who could see the colour — and the
                button's `title` said "Notifications & Milestones" whether there
                was anything waiting or not. The count is on the button's label
                now, where a screen reader announces it with the control.
              */}
              {unreadCount > 0 && (
                <span
                  data-testid="unread-dot"
                  className="absolute top-1 right-1 w-2.5 h-2.5 rounded-full bg-indigo-600 ring-2 ring-white animate-pulse"
                />
              )}
            </button>
          </div>
        </header>

        {/* View Main Content Container - Independent Scroll Container */}
        <div className="flex-1 overflow-y-auto flex flex-col min-h-0 w-full">
          <main className="flex-1 p-4 sm:p-8 max-w-7xl w-full mx-auto">
            {signInNotice && (
              <div
                role="status"
                className="mb-4 flex items-center justify-between gap-3 rounded-2xl border border-indigo-200 bg-indigo-50 px-4 py-3"
              >
                <span className="text-xs font-bold text-indigo-900">{signInNotice}</span>
                <button
                  onClick={() => setSignInNotice(null)}
                  aria-label="Dismiss"
                  className="p-1 rounded-full text-indigo-500 hover:bg-indigo-100 transition cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            )}

            {activeTab === 'home' && (
              <LandingPage
                onNavigate={tab => setActiveTab(tab)}
                onSelectProfile={p => {
                  selectProfile(p.id);
                  if (p.role === 'parent') setActiveTab('parent');
                  else if (p.role === 'teacher') setActiveTab('teacher');
                  else setActiveTab('student');
                }}
                onSelectAgeTier={tier => {
                  handleSelectAgeTier(tier);
                }}
                onOpenCategoryPage={handleOpenCategory}
                onOpenAgePage={handleOpenAge}
                profiles={profiles}
                activeProfile={activeProfile}
              />
            )}

            {activeTab === 'category' && (
              <CategoryLandingPage
                currentTier={selectedCategoryTier}
                onSelectTier={tier => setSelectedCategoryTier(tier)}
                onSelectAge={handleOpenAge}
                onNavigate={setActiveTab}
                onSelectLesson={lesson => setActiveLesson(lesson)}
                onStartLearning={handleStartLearningWithAge}
                lessons={lessons}
                activeProfile={activeProfile}
              />
            )}

            {activeTab === 'age' && (
              <AgeSpecificPage
                age={selectedAge}
                onSelectAge={handleOpenAge}
                onSelectCategory={handleOpenCategory}
                onNavigate={setActiveTab}
                onStartLearning={handleStartLearningWithAge}
                activeProfile={activeProfile}
                lessons={lessons}
              />
            )}

            {activeTab === 'student' && isPlaceholder && (
              /**
               * No child to show.
               *
               * Before profiles moved to the server this could not happen —
               * three invented children were always there. Now a visitor who
               * has not signed in has none, and the honest answer is to say so
               * rather than to greet "Guest" over a row of zeroes. A dashboard
               * that looks populated to somebody with no account is how a demo
               * flatters itself.
               */
              <div className="max-w-md mx-auto text-center py-16">
                <h2 className="text-xl font-black text-slate-900 tracking-tight">
                  {isResolvingProfiles ? 'Loading your learners…' : 'No learners yet'}
                </h2>
                {!isResolvingProfiles && (
                  <>
                    <p className="mt-2 text-sm text-slate-500">
                      {isSignedIn
                        ? 'Add a child to this account to start practising.'
                        : 'Sign in as a parent or educator to see your learners and their progress.'}
                    </p>
                    <button
                      onClick={() => {
                        playClickSound();
                        if (isSignedIn) setIsProfileModalOpen(true);
                        else setIsSignInOpen(true);
                      }}
                      className="mt-5 px-6 py-3 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-bold text-sm transition cursor-pointer"
                    >
                      {isSignedIn ? 'Add a learner' : 'Sign in'}
                    </button>
                  </>
                )}
              </div>
            )}

            {activeTab === 'student' && !isPlaceholder && (
              <StudentDashboard
                user={activeProfile}
                lessons={lessons}
                assignments={learnerAssignments}
                onSelectLesson={lesson => setActiveLesson(lesson)}
                onOpenRewards={() => setActiveTab('rewards')}
                onUpdateDifficulty={newLevel => {
                  handleUpdateActiveUser({ dynamicLevel: newLevel });
                }}
                onUpdateUserProfile={handleUpdateActiveUser}
                screenTimeMinutes={screenMinutesUsed}
                screenTimeLimit={screenLimitMinutes}
                onOpenScratchpad={() => setActiveTab('scratchpad')}
                onOpenAgePage={handleOpenAge}
                onNavigate={setActiveTab}
                onOpenPlacementQuest={() => setIsPlacementQuestOpen(true)}
                onOpenGlossary={() => setIsGlossaryModalOpen(true)}
              />
            )}

            {activeTab === 'curriculum' && (
              <CurriculumView
                lessons={lessons}
                onSelectLesson={lesson => setActiveLesson(lesson)}
                currentStudentTier={activeProfile.tier}
              />
            )}

            {activeTab === 'labs' && (
              <ManipulativesHub 
                activeProfile={activeProfile} 
                onOpenGlossary={() => setIsGlossaryModalOpen(true)}
              />
            )}

            {activeTab === 'parent' && analyticsNeedsStepUp && (
              /**
               * Elevation lasts fifteen minutes and the tab can stay open for
               * longer. Rather than showing the last numbers fetched — which is
               * a child's record left on screen after the proof that an adult
               * was present has expired — the dashboard asks again.
               */
              <div className="max-w-md mx-auto text-center py-16">
                <h2 className="text-xl font-black text-slate-900 tracking-tight">Confirm it is you</h2>
                <p className="mt-2 text-sm text-slate-500">
                  Your PIN confirmation has expired. Enter it again to see your children's progress.
                </p>
                <button
                  onClick={() => {
                    playClickSound();
                    setTargetProtectedRole('parent');
                    setTargetProtectedTab('parent');
                    setTargetProtectedProfile(null);
                    setIsParentPinOpen(true);
                  }}
                  className="mt-5 px-6 py-3 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-bold text-sm transition cursor-pointer"
                >
                  Enter PIN
                </button>
              </div>
            )}

            {activeTab === 'parent' && !analyticsNeedsStepUp && (
              <ParentDashboard
                students={studentProfiles}
                analyticsMap={analyticsMap}
                onUpdateScreenTime={handleUpdateScreenTime}
                onOpenCoppaModal={() => setIsCoppaModalOpen(true)}
              />
            )}

            {activeTab === 'teacher' && (
              // The teacher's class, not the signed-in guardian's children:
              // `learners.list` is guardian-scoped, so it is empty for a teacher.
              <TeacherDashboard
                students={assignableStudents}
                assignments={authoredAssignments}
                concepts={assignableConcepts}
                assignableStudentIds={assignableLearnerIds}
                onCreateAssignment={handleCreateAssignment}
              />
            )}

            {/*
              * The District Hub was rendered here, and is quarantined in Graft E4.
              *
              * Its routes served an in-memory demonstration store, and deleting
              * them alone would have changed nothing: the component seeds its own
              * state with invented campuses, standards and LMS connections, and
              * only overwrote them when the server answered. An administrator
              * would have seen the same numbers from a different source.
              *
              * So the surface is unreachable rather than re-supplied. The file
              * stays — what belongs there is a product decision, and deleting it
              * would foreclose one.
              */}

            {activeTab === 'rewards' && (
              <RewardsView
                user={activeProfile}
                onUpdateUser={handleUpdateActiveUser}
                catalogue={rewards.catalogue}
                onBuyAvatar={rewards.buyAvatar}
                onEquipAvatar={rewards.equipAvatar}
                isBusy={rewards.isBusy}
              />
            )}

            {activeTab === 'scratchpad' && (
              <ScratchpadView />
            )}
          </main>

          {/* Footer */}
          <footer className="bg-white border-t border-slate-200 py-4 px-6 text-center text-xs text-slate-400 mt-auto shrink-0">
            <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-2">
              <span>
                AcuityMath Adaptive Learning Platform • Dynamic Multi-Tier Math Architecture (Ages 3–18)
              </span>
              <div className="flex items-center gap-3 text-[11px] font-semibold text-slate-400">
                <span className="flex items-center gap-1 text-emerald-600 font-bold">
                  <ShieldCheck className="w-3 h-3" /> COPPA / FERPA Certified
                </span>
                <span>•</span>
                <span>Authoritative Screen Heartbeat</span>
                <span>•</span>
                <span>Cloud Synced</span>
              </div>
            </div>
          </footer>
        </div>
      </div>

      {/* Modals */}
      {activeLesson && (
        <InteractiveLessonModal
          lesson={activeLesson}
          user={activeProfile}
          onClose={() => setActiveLesson(null)}
          onLessonComplete={handleLessonComplete}
        />
      )}

      {isRewardsModalOpen && (
        <RewardsModal
          user={activeProfile}
          onClose={() => setIsRewardsModalOpen(false)}
          onBuyAvatar={rewards.buyAvatar}
          onEquipAvatar={rewards.equipAvatar}
          isBusy={rewards.isBusy}
        />
      )}

      {isNotificationsOpen && (
        <NotificationsModal
          notifications={notifications}
          onClose={() => setIsNotificationsOpen(false)}
          onMarkAllAsRead={() => void markNotificationsRead()}
          onClearNotifications={() => void clearNotifications()}
          onToggleRead={id => void toggleNotificationRead(id)}
        />
      )}

      <SignInPanel isOpen={isSignInOpen} onClose={() => setIsSignInOpen(false)} />

      {blockedSurface && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Not available on this account"
          tabIndex={-1}
          className="fixed inset-0 bg-slate-950/70 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-fadeIn"
        >
          <div className="bg-white rounded-3xl max-w-sm w-full p-6 shadow-2xl border border-slate-200 text-center">
            <div className="w-12 h-12 rounded-2xl bg-amber-50 border border-amber-100 text-amber-600 flex items-center justify-center mx-auto mb-3">
              <ShieldAlert className="w-6 h-6" />
            </div>
            <h3 className="text-lg font-black text-slate-900 tracking-tight">
              Not available on this account
            </h3>
            <p className="text-xs text-slate-500 mt-2">
              {/* Says which account would reach it, rather than only refusing.
                  A parent told "no" with no explanation assumes a fault. */}
              You are signed in as a {sessionUser?.role}.{' '}
              {blockedSurface === 'admin'
                ? 'The district command centre is for district administrators.'
                : blockedSurface === 'teacher'
                  ? 'The classroom view is for educator accounts.'
                  : 'The parent view is for guardian accounts.'}
            </p>
            <button
              onClick={() => {
                playClickSound();
                setBlockedSurface(null);
              }}
              className="mt-5 px-6 py-3 bg-slate-900 hover:bg-slate-800 text-white rounded-xl font-bold text-sm transition cursor-pointer"
            >
              Close
            </button>
          </div>
        </div>
      )}

      {isProfileModalOpen && (
        <ProfileSwitchModal
          profiles={profiles}
          activeProfile={activeProfile}
          onSelectProfile={p => {
            // The parent and teacher *profiles* this branch guarded no longer
            // exist: profiles are the guardian's children, and an adult is the
            // signed-in account rather than something to switch into.
            selectProfile(p.id);
            if (p.role === 'parent') setActiveTab('parent');
            else if (p.role === 'teacher') setActiveTab('teacher');
            else setActiveTab('student');
          }}
          onAddNewStudent={newP => {
            // The modal builds a client-side profile; what is created is a row.
            void createLearner({
              displayName: newP.name,
              birthYear: new Date().getFullYear() - newP.age,
              avatar: newP.avatar,
            }).then(() => setActiveTab('student'));
          }}
          onClose={() => setIsProfileModalOpen(false)}
        />
      )}

      {/* Phase 1 Security & Compliance Modals */}
      <ParentPinModal
        isOpen={isParentPinOpen}
        targetRole={targetProtectedRole}
        onSuccess={() => {
          // Nothing to record here. The server issued an elevation cookie and
          // `useStepUpStatus` re-reads it; a local flag would be a second
          // opinion that outlives the fifteen minutes the real one lasts.
          if (targetProtectedProfile) {
            selectProfile(targetProtectedProfile.id);
          }
          if (targetProtectedTab) {
            setActiveTab(targetProtectedTab);
          }
          setIsParentPinOpen(false);
          setIsProfileModalOpen(false);
          if (reopenConsentAfterPin) {
            setReopenConsentAfterPin(false);
            setIsCoppaModalOpen(true);
          }
        }}
        onClose={() => {
          setIsParentPinOpen(false);
          setTargetProtectedProfile(null);
          setTargetProtectedTab(null);
        }}
      />

      <CoppaConsentModal
        isOpen={isCoppaModalOpen}
        onClose={() => setIsCoppaModalOpen(false)}
        /*
          These were `"Sarah Jenkins"` and `"sarah.jenkins@example.com"`,
          hardcoded — the same invented parent the deleted endpoint recorded
          consent against. The signed-in account is the only one that can
          consent, and it is the one the server records.
        */
        parentName={sessionUser?.name ?? ''}
        parentEmail={sessionUser?.email ?? ''}
        students={studentProfiles}
        consent={consent}
        onRequestStepUp={() => {
          /*
           * The consent modal closes while the PIN is entered, and reopens after.
           *
           * Both are `fixed inset-0 z-50`, and this one renders later in the
           * tree — so leaving it open puts it over the keypad, and the parent
           * gets a PIN prompt whose buttons cannot be clicked. Found by driving
           * it; invisible to the tests, which never stack two modals.
           */
          setIsCoppaModalOpen(false);
          setReopenConsentAfterPin(true);
          setTargetProtectedRole('parent');
          setTargetProtectedTab(null);
          setTargetProtectedProfile(null);
          setIsParentPinOpen(true);
        }}
      />

      <ScreenTimeLockModal
        isOpen={isScreenLocked}
        studentName={activeProfile.name}
        todayMinutes={lockedTimeData.todayMinutes}
        limitMinutes={lockedTimeData.limitMinutes}
        studentId={activeProfile.id}
      />

      {qrStudentData && (
        <StudentQrCardModal
          isOpen={isQrCardModalOpen}
          onClose={() => {
            setIsQrCardModalOpen(false);
            setQrStudentData(null);
          }}
          student={qrStudentData}
        />
      )}

      {/* Automated Placement Quest Prompt on First Student Login */}
      {showPlacementPrompt && (
        <PlacementQuestPromptModal
          isOpen={showPlacementPrompt}
          user={activeProfile}
          onStartQuest={() => {
            setShowPlacementPrompt(false);
            sessionStorage.setItem(`dismissed_placement_prompt_${activeProfile.id}`, 'true');
            setIsPlacementQuestOpen(true);
          }}
          onDismiss={() => {
            setShowPlacementPrompt(false);
            sessionStorage.setItem(`dismissed_placement_prompt_${activeProfile.id}`, 'true');
          }}
        />
      )}

      {/* Quick-Win 1: Placement Quest Modal (7-Item Adaptive 3PL IRT Benchmark) */}
      {isPlacementQuestOpen && (
        <PlacementQuestModal
          user={activeProfile}
          onClose={() => setIsPlacementQuestOpen(false)}
          onCompletePlacement={updates => {
            handleUpdateActiveUser({
              ...updates,
              diagnosticComplete: true
            });
            setIsPlacementQuestOpen(false);
          }}
        />
      )}

      {/* Quick-Win 2: Bilingual Math Vocabulary Modal (English / Spanish) */}
      <BilingualGlossaryModal
        isOpen={isGlossaryModalOpen}
        onClose={() => setIsGlossaryModalOpen(false)}
        initialTier={activeProfile.tier}
      />
    </div>
    </OfflineProvider>
  );
}
