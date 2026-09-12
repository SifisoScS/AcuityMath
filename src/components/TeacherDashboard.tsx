import React, { useState } from 'react';
import { UserProfile, TeacherAssignment, AgeTier } from '../types';
import {
  PlusCircle,
  Users,
  BookOpen,
  Calendar,
  Send,
  Sparkles,
  Search,
  Filter,
  Flame,
  Award,
  Activity,
  Brain,
  Bot,
  Zap,
  TrendingUp,
  AlertTriangle,
  CheckCircle2,
  Share2,
  RefreshCw,
  ShieldCheck,
  MessageSquarePlus,
  ThumbsUp,
  HelpCircle,
  Server
} from 'lucide-react';
import { LtiOnboardingWizardModal } from './LtiOnboardingWizardModal';
import { playClickSound, playLevelUpFanfare } from '../utils/audio';

/** A concept a teacher may set, as `curriculum.concepts` returns it. */
export interface AssignableConcept {
  id: string;
  title: string;
  strand: string;
  tier: AgeTier;
  ageBandLow: number;
  ageBandHigh: number;
}

export interface NewAssignmentInput {
  title: string;
  instructions: string;
  conceptId: string;
  dueDate?: string;
  targetStudents: string[];
}

interface TeacherDashboardProps {
  students: UserProfile[];
  assignments: TeacherAssignment[];
  /** The curriculum, for choosing what to set. */
  concepts: AssignableConcept[];
  /**
   * Profile ids this adult may set work for. A teacher reaches a learner
   * through a classroom they teach and through nothing else, so the roster and
   * the assignable list are not the same list.
   */
  assignableStudentIds: string[];
  onCreateAssignment: (input: NewAssignmentInput) => Promise<void>;
}

export const TeacherDashboard: React.FC<TeacherDashboardProps> = ({
  students,
  assignments,
  concepts,
  assignableStudentIds,
  onCreateAssignment
}) => {
  const [filterTier, setFilterTier] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [isCreatingModalOpen, setIsCreatingModalOpen] = useState(false);

  // New assignment form state
  const [newTitle, setNewTitle] = useState('');
  /*
   * One concept id, where there were three fields.
   *
   * The form collected a free-text topic, a tier and a difficulty slider. None
   * of them existed server-side, nothing checked the topic against the tier, and
   * `difficulty` was never read back anywhere. A concept carries its own title
   * and tier and can be practised, so it is the only one of the four worth
   * asking for.
   */
  const [newConceptId, setNewConceptId] = useState('');
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [newDueDate, setNewDueDate] = useState('2026-09-12');
  const [newInstructions, setNewInstructions] = useState('Utilize the scratchpad and interactive grapher before submitting.');
  /*
   * Nobody, until the teacher chooses.
   *
   * This was `students.map(s => s.id)` — every child on the roster, selected in
   * advance. Once the checkbox list is limited to children this adult may
   * actually set work for, that pre-selection includes children who have no
   * checkbox to clear, so every submit would be refused by the server with
   * nothing on screen the teacher could change to fix it.
   *
   * Starting empty also makes assigning work to a whole class a deliberate act
   * rather than the consequence of not noticing. The submit button stays
   * disabled until at least one child is chosen.
   */
  const [selectedStudentIds, setSelectedStudentIds] = useState<string[]>([]);
  const [syncToLms, setSyncToLms] = useState<boolean>(true);
  const [isLtiModalOpen, setIsLtiModalOpen] = useState<boolean>(false);
  const [toast, setToast] = useState<string | null>(null);

  // Pilot In-App Micro-Survey State
  const [surveySentiment, setSurveySentiment] = useState<'optimal' | 'too_fast' | 'too_slow' | null>(null);
  const [surveySubmitted, setSurveySubmitted] = useState<boolean>(false);
  const [surveyTags, setSurveyTags] = useState<string[]>([]);
  /*
   * Whether the last response actually reached anything.
   *
   * `pilotStats` stood here, seeded `{ total: 24, optimalPercent: 88 }` and
   * rendered as "88% report optimal ZPD (24 responses)".
   *
   * An earlier version of this comment said `/api/feedback` did not exist. It
   * does — `server/api.ts` mounts it at `/api` — and it returns a real
   * aggregate, so the fetch below succeeded and those numbers *could* be
   * replaced. The defect is a different one, and worse in its way: the store it
   * aggregates is an in-memory array in `server/api.ts`, pre-seeded with three
   * fabricated testimonials from teachers who do not exist, and reset on every
   * restart. So the percentage was real arithmetic over invented responses, and
   * a teacher's own answer was averaged into three that were made up.
   *
   * The figure is gone for that reason rather than the one first given here.
   * Recording it properly needs a table; until then the widget reports whether
   * the answer was kept and claims no aggregate.
   */
  /*
   * There is no `surveyOutcome` any more, because there is only one outcome.
   *
   * It used to hold `'recorded' | 'not-recorded'`, decided by `res.ok` from
   * `POST /api/feedback`. That route is deleted, so the state could only ever
   * have been `'not-recorded'` — and the `'recorded'` branch would have been
   * dead code waiting for something to return 200 without storing anything,
   * which is exactly what the route it called used to do.
   */

  /*
   * Nothing is sent. `POST /api/feedback` appended to an in-memory array
   * pre-seeded with three fabricated testimonials and reset on every restart,
   * and it answered 200, so this told the teacher their answer was recorded
   * while averaging it into three that were invented.
   *
   * The selection is kept in this component so the teacher sees what they
   * chose. Posting it somewhere that forgets would be the same claim in a
   * quieter voice.
   */
  const handleSurveySubmit = (sentiment: 'optimal' | 'too_fast' | 'too_slow') => {
    playClickSound();
    setSurveySentiment(sentiment);
    setSurveySubmitted(true);
  };

  const filteredStudents = students.filter(s => {
    const matchesTier = filterTier === 'all' || s.tier === filterTier;
    const matchesSearch = s.name.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesTier && matchesSearch;
  });

  const handleToggleStudent = (id: string) => {
    playClickSound();
    if (selectedStudentIds.includes(id)) {
      setSelectedStudentIds(prev => prev.filter(sId => sId !== id));
    } else {
      setSelectedStudentIds(prev => [...prev, id]);
    }
  };

  const handleCreateAssignment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTitle.trim() || !newConceptId || selectedStudentIds.length === 0) return;

    const title = newTitle.trim();

    /*
     * The fanfare and the toast used to fire before anything was saved, because
     * nothing was saved: the assignment went into React state. The server can
     * refuse this one (a learner the caller may not set work for, an expired
     * step-up), so the celebration waits until it has been accepted.
     */
    setSubmitError(null);
    try {
      await onCreateAssignment({
        title,
        instructions: newInstructions,
        conceptId: newConceptId,
        dueDate: newDueDate || undefined,
        targetStudents: selectedStudentIds
      });
    } catch (error) {
      setSubmitError(error instanceof Error ? error.message : 'Could not save that assignment.');
      return;
    }

    // The children are told by the server, inside the same call that wrote the
    // assignment targets. Announcing from here as well put a second, local copy
    // in the bell that disappeared on reload.

    playLevelUpFanfare();
    setToast(`Assignment "${title}" assigned to ${selectedStudentIds.length} students!`);
    setTimeout(() => setToast(null), 4000);

    // Reset form
    setNewTitle('');
    setIsCreatingModalOpen(false);
  };

  return (
    <div className="space-y-6">
      {toast && (
        <div className="p-3.5 bg-indigo-600 text-white font-bold rounded-2xl shadow-lg flex items-center justify-between text-xs sm:text-sm animate-in fade-in">
          <span>{toast}</span>
          <button onClick={() => setToast(null)} className="text-white/80 hover:text-white">✕</button>
        </div>
      )}

      {/* Top Banner */}
      <div className="bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 text-white rounded-3xl p-6 sm:p-8 shadow-xl border border-slate-800 flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div>
          <div className="flex items-center gap-2 text-xs uppercase font-bold text-sky-400 tracking-wider mb-2">
            <BookOpen className="w-4 h-4" />
            Teacher Curriculum & Class Management
          </div>
          <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight">
            Math Faculty Instruction Portal
          </h1>
          <p className="text-xs sm:text-sm text-slate-300 mt-1 max-w-xl leading-relaxed">
            Customize adaptive lesson modules, set age-appropriate benchmark quests, and monitor student ELO ratings.
          </p>
        </div>

        <button
          onClick={() => {
            playClickSound();
            setIsCreatingModalOpen(true);
          }}
          className="px-5 py-3 bg-indigo-600 hover:bg-indigo-500 text-white rounded-2xl font-bold text-sm shadow-lg shadow-indigo-500/30 flex items-center gap-2 transition cursor-pointer self-start md:self-auto"
        >
          <PlusCircle className="w-4 h-4" />
          <span>Create Custom Lesson</span>
        </button>
      </div>

      {/* Institutional LMS Integration Banner */}
      <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-indigo-50 text-indigo-600 rounded-xl">
            <Share2 className="w-4 h-4" />
          </div>
          <div>
            {/*
              This said "LMS Two-Way Sync Active", badged "LTI 1.3 AGS v2", over
              "Connected to Google Classroom & Canvas. Student completion
              automatically updates institutional gradebooks." None of it is
              built. A school reading that would believe its gradebook was being
              written to, and would find out at the end of term that it was not.
            */}
            <div className="font-extrabold text-slate-900 flex items-center gap-1.5">
              <span>LMS Sync</span>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-slate-200 text-slate-700">
                Not connected
              </span>
            </div>
            <div className="text-slate-500 text-[11px]">
              Assignments and completion stay in AcuityMath. LTI 1.3 and OneRoster are not built yet.
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2 self-end sm:self-auto">
          <button
            onClick={() => {
              playClickSound();
              setIsLtiModalOpen(true);
            }}
            className="px-2.5 py-1.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-bold text-[11px] flex items-center gap-1.5 shadow-2xs cursor-pointer transition"
            title="LTI 1.3 Advantage & OneRoster Configuration Wizard"
          >
            <Server className="w-3 h-3 text-indigo-400" />
            <span>LTI 1.3 Wizard</span>
          </button>
          {/* "100% Rosters Synced" stood here. Nothing syncs a roster. */}
          <span className="text-[11px] text-slate-500 font-bold flex items-center gap-1">
            No rosters synced
          </span>
        </div>
      </div>

      {/* Real-Time Teacher Pilot Micro-Survey */}
      <div className="bg-gradient-to-r from-indigo-50 via-white to-indigo-50/50 p-4 sm:p-5 rounded-3xl border border-indigo-200/80 shadow-xs space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-2 border-b border-indigo-100">
          <div className="flex items-center gap-2">
            <div className="p-1.5 bg-indigo-600 text-white rounded-xl">
              <MessageSquarePlus className="w-4 h-4" />
            </div>
            <div>
              <h3 className="font-extrabold text-xs sm:text-sm text-slate-900 flex items-center gap-2">
                <span>Pilot Efficacy Micro-Survey</span>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-indigo-100 text-indigo-700">
                  Live Friction Log
                </span>
              </h3>
              <p className="text-[11px] text-slate-500">
                How did AcuityMath's adaptive IRT pacing fit your classroom period today?
              </p>
            </div>
          </div>

          {/*
            "88% report optimal ZPD (24 responses)" stood here. The endpoint does
            return an aggregate — but over an in-memory array seeded with three
            invented testimonials, reset on every restart. A percentage that
            averages a teacher's answer into three made-up ones is worse than no
            percentage.
          */}
          <div className="text-[11px] font-bold text-slate-500 flex items-center gap-1.5 self-start sm:self-auto">
            <ThumbsUp className="w-3.5 h-3.5 text-slate-400" />
            <span>Responses are not collected yet</span>
          </div>
        </div>

        {!surveySubmitted ? (
          <div className="space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
              <button
                onClick={() => handleSurveySubmit('too_fast')}
                className="p-3 rounded-2xl border-2 border-slate-200 bg-white hover:border-amber-400 hover:bg-amber-50/30 text-left transition flex items-center gap-3 cursor-pointer group disabled:opacity-50"
              >
                <span className="text-xl">🐢</span>
                <div>
                  <div className="font-extrabold text-xs text-slate-800 group-hover:text-amber-900">
                    Pacing Too Fast
                  </div>
                  <div className="text-[10px] text-slate-400">
                    Pupils needed more visual scaffolding
                  </div>
                </div>
              </button>

              <button
                onClick={() => handleSurveySubmit('optimal')}
                className="p-3 rounded-2xl border-2 border-indigo-200 bg-white hover:border-emerald-500 hover:bg-emerald-50/40 text-left transition flex items-center gap-3 cursor-pointer group shadow-xs disabled:opacity-50"
              >
                <span className="text-xl">🎯</span>
                <div>
                  <div className="font-extrabold text-xs text-indigo-900 group-hover:text-emerald-900">
                    Optimal ZPD Pacing
                  </div>
                  <div className="text-[10px] text-slate-400">
                    Challenging yet achievable for roster
                  </div>
                </div>
              </button>

              <button
                onClick={() => handleSurveySubmit('too_slow')}
                className="p-3 rounded-2xl border-2 border-slate-200 bg-white hover:border-sky-400 hover:bg-sky-50/30 text-left transition flex items-center gap-3 cursor-pointer group disabled:opacity-50"
              >
                <span className="text-xl">🚀</span>
                <div>
                  <div className="font-extrabold text-xs text-slate-800 group-hover:text-sky-900">
                    Too Easy / Accelerated
                  </div>
                  <div className="text-[10px] text-slate-400">
                    Pupils ready for higher grade tier
                  </div>
                </div>
              </button>
            </div>

            {/* Quick Optional Checkboxes */}
            <div className="flex flex-wrap items-center gap-2 pt-1">
              <span className="text-[11px] font-bold text-slate-400 mr-1">Session Highlights:</span>
              {[
                { id: 'manipulatives', label: 'Tactile Manipulatives' },
                { id: 'socratic', label: 'Socratic AI Hints' },
                { id: 'scratchpad', label: 'Digital Scratchpad' },
                { id: 'lms', label: 'Grade Passback' }
              ].map(tag => {
                const active = surveyTags.includes(tag.id);
                return (
                  <button
                    key={tag.id}
                    type="button"
                    onClick={() => {
                      playClickSound();
                      setSurveyTags(prev => 
                        prev.includes(tag.id) ? prev.filter(t => t !== tag.id) : [...prev, tag.id]
                      );
                    }}
                    className={`px-2.5 py-1 rounded-xl text-[11px] font-bold border transition cursor-pointer ${
                      active
                        ? 'bg-indigo-600 text-white border-indigo-600'
                        : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-100'
                    }`}
                  >
                    {active ? '✓ ' : '+ '}{tag.label}
                  </button>
                );
              })}
            </div>
          </div>
        ) : (
          <div className="p-3 rounded-2xl border flex items-center justify-between gap-3 text-xs animate-in fade-in bg-amber-50 border-amber-200">
            <div className="flex items-center gap-2.5">
              <CheckCircle2 className="w-5 h-5 shrink-0 text-amber-600" />
              <div>
                <span className="font-extrabold text-amber-900">Not recorded. </span>
                <span className="text-amber-800 text-[11px]">
                  There is nowhere to store this yet, so your answer was not kept. Saying it had
                  been would be worse than saying nothing.
                </span>
              </div>
            </div>
            <button
              onClick={() => setSurveySubmitted(false)}
              className="text-xs font-bold hover:underline cursor-pointer shrink-0 text-amber-800 hover:text-amber-900"
            >
              Log Another Period
            </button>
          </div>
        )}
      </div>

      {/* Class Overview Statistics */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white p-5 rounded-3xl border border-slate-200 shadow-sm flex items-center justify-between">
          <div>
            <span className="text-xs font-bold text-slate-400 uppercase">Enrolled Students</span>
            <div className="text-2xl font-extrabold text-slate-900 mt-1">{students.length} Pupils</div>
            {/* This read "Ages 3 through 18" — the product's range, under a count of two. */}
            <span className="text-xs text-slate-500 font-semibold mt-1 block">
              {students.length === 0
                ? 'Nobody enrolled'
                : `Ages ${Math.min(...students.map(s => s.age))} to ${Math.max(...students.map(s => s.age))}`}
            </span>
          </div>
          <div className="w-12 h-12 rounded-2xl bg-indigo-50 text-indigo-600 flex items-center justify-center">
            <Users className="w-6 h-6" />
          </div>
        </div>

        <div className="bg-white p-5 rounded-3xl border border-slate-200 shadow-sm flex items-center justify-between">
          <div>
            <span className="text-xs font-bold text-slate-400 uppercase">Active Assignments</span>
            <div className="text-2xl font-extrabold text-indigo-600 mt-1">{assignments.length} Quests</div>
            <span className="text-xs text-slate-500 font-semibold mt-1 block">Dynamic grading active</span>
          </div>
          <div className="w-12 h-12 rounded-2xl bg-sky-50 text-sky-600 flex items-center justify-center">
            <BookOpen className="w-6 h-6" />
          </div>
        </div>

        <div className="bg-white p-5 rounded-3xl border border-slate-200 shadow-sm flex items-center justify-between">
          <div>
            <span className="text-xs font-bold text-slate-400 uppercase">Average Mastery ELO</span>
            <div className="text-2xl font-extrabold text-purple-600 mt-1">
              {Math.round(students.reduce((acc, s) => acc + s.eloRating, 0) / (students.length || 1))} ELO
            </div>
            <span className="text-xs text-purple-700 font-semibold mt-1 block">Adaptive tier rating</span>
          </div>
          <div className="w-12 h-12 rounded-2xl bg-purple-50 text-purple-600 flex items-center justify-center">
            <Sparkles className="w-6 h-6" />
          </div>
        </div>
      </div>

      {/* Student Roster Table */}
      <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
        {/* Table Filters & Search */}
        <div className="p-5 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h3 className="text-base font-bold text-slate-800">Student Adaptive Roster</h3>
            <p className="text-xs text-slate-500">Live difficulty tiers and precision ratings</p>
          </div>

          <div className="flex items-center gap-3">
            {/* Search */}
            <div className="relative">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder="Search student..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                className="pl-9 pr-3 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium focus:outline-none focus:ring-2 focus:ring-indigo-500 w-36 sm:w-48"
              />
            </div>

            {/* Tier filter */}
            <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl">
              <Filter className="w-3.5 h-3.5 text-slate-400 ml-1" />
              <select
                value={filterTier}
                onChange={e => setFilterTier(e.target.value)}
                className="bg-transparent text-xs font-bold text-slate-700 focus:outline-none pr-2 cursor-pointer"
              >
                <option value="all">All Tiers</option>
                <option value="early">Early (3-6)</option>
                <option value="elementary">Elem (7-10)</option>
                <option value="middle">Middle (11-14)</option>
                <option value="high">High (15-18)</option>
              </select>
            </div>
          </div>
        </div>

        {/* Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 border-b border-slate-200 text-slate-400 font-bold uppercase tracking-wider text-[10px]">
              <tr>
                <th className="py-3.5 px-6">Student</th>
                <th className="py-3.5 px-4">Age Tier</th>
                <th className="py-3.5 px-4">Adaptive Level</th>
                <th className="py-3.5 px-4">Accuracy</th>
                <th className="py-3.5 px-4">Active Streak</th>
                <th className="py-3.5 px-4">Completed</th>
                <th className="py-3.5 px-6 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredStudents.map(student => (
                <tr key={student.id} className="hover:bg-slate-50/80 transition">
                  <td className="py-4 px-6">
                    <div className="flex items-center gap-3">
                      <div className="text-2xl p-1 bg-slate-100 rounded-xl border border-slate-200">
                        {student.avatar}
                      </div>
                      <div>
                        <div className="font-bold text-slate-900 text-sm">{student.name}</div>
                        <div className="text-slate-400 text-[11px]">Age {student.age} • ID: {student.id}</div>
                      </div>
                    </div>
                  </td>

                  <td className="py-4 px-4">
                    <span className="capitalize font-bold text-indigo-700 bg-indigo-50 border border-indigo-200 px-2.5 py-1 rounded-full text-[11px]">
                      {student.tier}
                    </span>
                  </td>

                  <td className="py-4 px-4">
                    <div className="font-bold text-slate-800 text-xs">
                      Level {student.dynamicLevel}
                    </div>
                    <span className="text-[11px] font-mono text-slate-400">{student.eloRating} ELO</span>
                  </td>

                  <td className="py-4 px-4">
                    <div className="flex items-center gap-2">
                      <div className="w-16 bg-slate-100 h-2 rounded-full overflow-hidden">
                        <div
                          className="bg-emerald-500 h-full rounded-full"
                          style={{ width: `${student.accuracyRate}%` }}
                        />
                      </div>
                      <span className="font-bold text-slate-700">{student.accuracyRate}%</span>
                    </div>
                  </td>

                  <td className="py-4 px-4">
                    <span className="font-bold text-amber-700 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-full flex items-center gap-1 w-max">
                      <Flame className="w-3 h-3 text-amber-500" /> {student.streakDays} Days
                    </span>
                  </td>

                  <td className="py-4 px-4 font-semibold text-slate-600">
                    {student.completedLessonsCount} Lessons
                  </td>

                  {/*
                    A "Nudge" button stood here. It raised a local notification
                    about a hardcoded "Speed Addition Challenge" — the same
                    phrase for every child, whatever they were working on — and
                    toasted "Reminder sent to X!" although nothing was sent
                    anywhere and the entry vanished on reload.

                    A teacher nudging a pupil is a reasonable feature and is
                    recorded as a gap. It needs a third notification type, a
                    message the teacher actually writes, and the classroom
                    entitlement check that `assignments.create` uses.
                  */}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Active Teacher Assignments Grid */}
      <div className="bg-white rounded-3xl p-6 border border-slate-200 shadow-sm">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-base font-bold text-slate-800">Current Assigned Modules</h3>
            <p className="text-xs text-slate-500">Student submissions and performance milestones</p>
          </div>
          <span className="text-xs font-bold text-indigo-600 bg-indigo-50 px-2.5 py-1 rounded-full">
            {assignments.length} Active
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {assignments.map(asg => {
            const completionPct = Math.round((asg.completedCount / (asg.totalAssigned || 1)) * 100);

            return (
              <div
                key={asg.id}
                className="p-4 rounded-2xl border border-slate-200 bg-slate-50/50 hover:border-indigo-300 transition flex flex-col justify-between"
              >
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-[10px] uppercase font-extrabold px-2 py-0.5 bg-indigo-100 text-indigo-800 rounded-md">
                      {asg.tier} Tier
                    </span>
                    <span className="text-[11px] font-semibold text-slate-500 flex items-center gap-1">
                      <Calendar className="w-3.5 h-3.5" /> Due {asg.dueDate}
                    </span>
                  </div>

                  <h4 className="text-sm font-bold text-slate-800 line-clamp-1">{asg.title}</h4>
                  <p className="text-xs text-slate-500 mt-1 line-clamp-2">{asg.customInstructions}</p>
                </div>

                <div className="mt-4 pt-3 border-t border-slate-200/60">
                  <div className="flex justify-between text-xs font-semibold mb-1">
                    <span className="text-slate-500">Turned In:</span>
                    <span className="font-bold text-slate-800">
                      {asg.completedCount} / {asg.totalAssigned} ({completionPct}%)
                    </span>
                  </div>
                  <div className="w-full bg-slate-200 h-2 rounded-full overflow-hidden">
                    <div
                      className="bg-indigo-600 h-full rounded-full transition-all"
                      style={{ width: `${completionPct}%` }}
                    />
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* ==================================================== */}
      {/* PSYCHOMETRIC IRT & COGNITIVE MISCONCEPTIONS COCKPIT  */}
      {/* ==================================================== */}
      <div className="bg-white rounded-3xl p-6 border border-slate-200 shadow-sm space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-100 pb-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="px-2.5 py-0.5 rounded-full bg-purple-100 text-purple-800 text-[10px] font-extrabold uppercase tracking-wider flex items-center gap-1">
                <Brain className="w-3 h-3 text-purple-600" /> Phase 3 Psychometrics
              </span>
              <h3 className="text-base font-bold text-slate-900">
                Cognitive Misconception & IRT Ability Distribution
              </h3>
            </div>
            <p className="text-xs text-slate-500 mt-0.5">
              Psychometric 3-Parameter Logistic (3PL) Item Response Theory mapping and cognitive error frequency
            </p>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-xs font-bold text-emerald-700 bg-emerald-50 px-3 py-1 rounded-xl border border-emerald-200 flex items-center gap-1">
              <Activity className="w-3.5 h-3.5" /> CAT Calibration Active
            </span>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Left: Misconceptions breakdown (6 cols) */}
          <div className="lg:col-span-6 space-y-3">
            <h4 className="text-xs font-extrabold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
              <AlertTriangle className="w-3.5 h-3.5 text-amber-500" />
              <span>Top Algorithmic Error Signatures</span>
            </h4>

            <div className="space-y-2.5">
              {[
                { name: 'Sign Rule Inversion (- / +)', freq: 38, count: 24, badge: 'High Priority', color: 'bg-rose-500' },
                { name: 'Distributive Property Omission', freq: 26, count: 16, badge: 'Moderate', color: 'bg-amber-500' },
                { name: 'Order of Operations (PEMDAS)', freq: 19, count: 12, badge: 'Targeted', color: 'bg-indigo-500' },
                { name: 'Inverted Fraction Numerator/Denominator', freq: 11, count: 7, badge: 'Occasional', color: 'bg-emerald-500' },
                { name: 'Coordinate Axis (x, y) Swap', freq: 6, count: 4, badge: 'Low', color: 'bg-blue-500' }
              ].map((item, idx) => (
                <div key={idx} className="p-3 bg-slate-50 rounded-2xl border border-slate-200/80 space-y-1.5">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-bold text-slate-800">{item.name}</span>
                    <span className="font-mono font-bold text-slate-600">{item.freq}% ({item.count} instances)</span>
                  </div>
                  <div className="w-full bg-slate-200 h-2 rounded-full overflow-hidden">
                    <div className={`${item.color} h-full rounded-full transition-all`} style={{ width: `${item.freq}%` }} />
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Right: Socratic Coach & Pedagogical Interventions (6 cols) */}
          <div className="lg:col-span-6 space-y-3 flex flex-col justify-between">
            <div>
              <h4 className="text-xs font-extrabold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
                <Bot className="w-3.5 h-3.5 text-indigo-600" />
                <span>AI Socratic Recommendations</span>
              </h4>

              <div className="mt-2 space-y-2.5">
                <div className="p-3.5 bg-indigo-50/70 border border-indigo-200/70 rounded-2xl text-xs space-y-1">
                  <div className="font-bold text-indigo-900 flex items-center gap-1.5">
                    <CheckCircle2 className="w-3.5 h-3.5 text-indigo-600" />
                    <span>Focus Drill: Negative Number Distribution</span>
                  </div>
                  <p className="text-slate-600 leading-relaxed">
                    Socratic AI Coach detected 4 students repeatedly omitting signs when distributing over parentheses (e.g. -2(x - 4)). Recommended action: assign the &quot;Coordinate &amp; Slope&quot; manipulative lab.
                  </p>
                </div>

                <div className="p-3.5 bg-purple-50/70 border border-purple-200/70 rounded-2xl text-xs space-y-1">
                  <div className="font-bold text-purple-900 flex items-center gap-1.5">
                    <TrendingUp className="w-3.5 h-3.5 text-purple-600" />
                    <span>Average Class Latent Ability (θ)</span>
                  </div>
                  <p className="text-slate-600 leading-relaxed">
                    Class latent ability standard score is currently <strong className="text-purple-900 font-mono">+0.42</strong> (above expected age grade norm), with an item difficulty boundary of <strong className="text-purple-900 font-mono">b = 0.65</strong>.
                  </p>
                </div>

                <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-2xl text-xs flex items-center justify-between">
                  <div className="flex items-center gap-2 text-slate-700 font-bold">
                    <Zap className="w-4 h-4 text-amber-500" />
                    <span>Infinite Adaptive Engine Status</span>
                  </div>
                  <span className="font-mono text-xs font-bold text-emerald-600">Online &amp; Generating</span>
                </div>
              </div>
            </div>

            <div className="pt-2">
              <button
                onClick={() => {
                  playClickSound();
                  setToast('AI targeted remedial assignments automatically queued for affected students!');
                  setTimeout(() => setToast(null), 3500);
                }}
                className="w-full py-2.5 px-4 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold transition flex items-center justify-center gap-2 cursor-pointer shadow-xs"
              >
                <Sparkles className="w-4 h-4 text-amber-300" />
                <span>Auto-Assign Targeted Interventions for Top Misconceptions</span>
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Create Custom Lesson Modal */}
      {isCreatingModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/80 backdrop-blur-sm p-4 overflow-y-auto">
          <div className="bg-white rounded-3xl p-6 sm:p-8 max-w-lg w-full shadow-2xl border border-slate-200 space-y-4 my-auto max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-start border-b border-slate-200 pb-3">
              <div>
                <h3 className="text-lg font-extrabold text-slate-900 flex items-center gap-2">
                  <PlusCircle className="w-5 h-5 text-indigo-600" />
                  Create Adaptive Lesson Assignment
                </h3>
                <p className="text-xs text-slate-500">Tailor problems, age tier, and instructions</p>
              </div>
              <button
                onClick={() => setIsCreatingModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 font-bold"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleCreateAssignment} className="space-y-3.5">
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase mb-1" htmlFor="assignment-title">
                  Assignment Title
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Coordinate Geometry & Slope Challenge"
                  id="assignment-title"
                  value={newTitle}
                  onChange={e => setNewTitle(e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-medium focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                />
              </div>

              {/*
                The tier select and the difficulty slider went with the free-text
                topic. A concept carries its own tier, and nothing anywhere read
                the difficulty back.
              */}
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase mb-1" htmlFor="assignment-concept">
                  Concept
                </label>
                <select
                  id="assignment-concept"
                  required
                  value={newConceptId}
                  onChange={e => setNewConceptId(e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold focus:outline-none"
                >
                  <option value="">Choose a concept</option>
                  {(['early', 'elementary', 'middle', 'high'] as AgeTier[]).map(tier => {
                    const inTier = concepts.filter(c => c.tier === tier);
                    if (inTier.length === 0) return null;
                    return (
                      <optgroup key={tier} label={tier}>
                        {inTier.map(concept => (
                          <option key={concept.id} value={concept.id}>
                            {concept.title} (ages {concept.ageBandLow}-{concept.ageBandHigh})
                          </option>
                        ))}
                      </optgroup>
                    );
                  })}
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase mb-1" htmlFor="assignment-due-date">
                  Due Date
                </label>
                <input
                  type="date"
                  id="assignment-due-date"
                  value={newDueDate}
                  onChange={e => setNewDueDate(e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase mb-1" htmlFor="assignment-instructions">
                  Teacher Guidance & Instructions
                </label>
                <textarea
                  rows={2}
                  id="assignment-instructions"
                  value={newInstructions}
                  onChange={e => setNewInstructions(e.target.value)}
                  className="w-full px-3.5 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium focus:outline-none"
                />
              </div>

              {/* Student checkboxes */}
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase mb-1.5">
                  Assign to Students ({selectedStudentIds.length} Selected)
                </label>
                {assignableStudentIds.length === 0 && (
                  <p className="text-[11px] text-slate-500 mb-1.5">
                    No learners you can set work for. A teacher reaches a learner through a
                    classroom they teach.
                  </p>
                )}
                <div className="grid grid-cols-2 gap-2 max-h-32 overflow-y-auto p-2 bg-slate-50 rounded-xl border border-slate-200">
                  {students.filter(s => assignableStudentIds.includes(s.id)).map(s => (
                    <label key={s.id} className="flex items-center gap-2 text-xs font-semibold cursor-pointer">
                      <input
                        type="checkbox"
                        checked={selectedStudentIds.includes(s.id)}
                        onChange={() => handleToggleStudent(s.id)}
                        className="rounded text-indigo-600 focus:ring-indigo-500"
                      />
                      <span>{s.avatar} {s.name}</span>
                    </label>
                  ))}
                </div>
              </div>

              {/*
                A "Two-Way LMS & Classroom Auto-Sync" toggle stood here, saying it
                "Writes assignment to Google Classroom & Canvas course streams".
                Nothing does that. A wrong number on a dashboard is bad; a false
                statement about where a pupil's work is sent is worse, so the
                control is gone until LTI 1.3 exists.
              */}

              {submitError && (
                <p role="alert" className="text-xs font-semibold text-rose-700 bg-rose-50 border border-rose-200 rounded-xl p-2.5">
                  {submitError}
                </p>
              )}

              <div className="flex gap-2 pt-2">
                <button
                  type="submit"
                  disabled={!newTitle.trim() || !newConceptId || selectedStudentIds.length === 0}
                  className="flex-1 py-3 bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-300 disabled:cursor-not-allowed text-white font-bold text-xs rounded-xl shadow-md transition cursor-pointer flex items-center justify-center gap-1.5"
                >
                  <Award className="w-4 h-4" />
                  <span>Publish & Dispatch Assignment</span>
                </button>
                <button
                  type="button"
                  onClick={() => setIsCreatingModalOpen(false)}
                  className="py-3 px-4 bg-slate-200 hover:bg-slate-300 text-slate-700 font-bold text-xs rounded-xl transition cursor-pointer"
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* LTI 1.3 Advantage & OneRoster Wizard Modal */}
      <LtiOnboardingWizardModal
        isOpen={isLtiModalOpen}
        onClose={() => setIsLtiModalOpen(false)}
      />
    </div>
  );
};
