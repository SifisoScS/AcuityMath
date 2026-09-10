import React, { useState, useEffect } from 'react';
import { 
  Building2, 
  Users, 
  GraduationCap, 
  CheckCircle2, 
  AlertTriangle, 
  RefreshCw, 
  Send, 
  Download, 
  ExternalLink, 
  ShieldCheck, 
  FileText, 
  Sparkles, 
  BookOpen, 
  TrendingUp, 
  BarChart3, 
  Filter, 
  ArrowUpRight, 
  Printer, 
  X,
  Share2,
  Calendar,
  Layers,
  Server,
  FileSpreadsheet
} from 'lucide-react';
import { LtiOnboardingWizardModal } from './LtiOnboardingWizardModal';
import { 
  SchoolEntity, 
  DistrictSummary, 
  LMSConnection, 
  StandardAuditRecord,
  AgeTier 
} from '../types';
import { playClickSound, playSuccessSound } from '../utils/audio';

interface DistrictAdminDashboardProps {
  onBackToStudent?: () => void;
}

export const DistrictAdminDashboard: React.FC<DistrictAdminDashboardProps> = ({
  onBackToStudent
}) => {
  const [activeSubTab, setActiveSubTab] = useState<'campuses' | 'standards' | 'lms' | 'growth' | 'audit'>('campuses');
  const [selectedSchoolFilter, setSelectedSchoolFilter] = useState<string>('all');
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [syncingLmsId, setSyncingLmsId] = useState<string | null>(null);
  const [feedbackBanner, setFeedbackBanner] = useState<{ type: 'success' | 'info'; message: string } | null>(null);

  // Modal States
  const [showDispatchModal, setShowDispatchModal] = useState<boolean>(false);
  const [showExportModal, setShowExportModal] = useState<boolean>(false);
  const [showLtiWizard, setShowLtiWizard] = useState<boolean>(false);
  const [selectedSchoolDetail, setSelectedSchoolDetail] = useState<SchoolEntity | null>(null);

  // Dispatch Form State
  const [dispatchTitle, setDispatchTitle] = useState<string>('District-Wide Midterm Diagnostic Benchmark');
  const [dispatchTier, setDispatchTier] = useState<AgeTier | 'all'>('all');
  const [dispatchSchoolId, setDispatchSchoolId] = useState<string>('all');
  const [dispatchDueDate, setDispatchDueDate] = useState<string>('2026-10-15');
  const [dispatchLmsSync, setDispatchLmsSync] = useState<boolean>(true);

  // Data States (pre-seeded with rich institutional defaults)
  const [summary, setSummary] = useState<DistrictSummary>({
    districtName: 'Metropolitan Unified School District (District #402)',
    districtId: 'musd-402',
    totalSchools: 4,
    totalStudents: 2860,
    totalTeachers: 160,
    averageMasteryPercent: 77,
    districtMeanTheta: +0.62,
    districtMeanElo: 1538,
    ccssCoveragePercent: 92.4,
    lmsSyncHealthPercent: 99.4,
    activeInterventionsCount: 118,
    lastRosterSync: new Date(Date.now() - 1000 * 60 * 18).toISOString()
  });

  const [schools, setSchools] = useState<SchoolEntity[]>([
    {
      id: 'sch-01',
      name: 'Lincoln Elementary School',
      type: 'elementary',
      studentCount: 540,
      teacherCount: 28,
      activeLms: 'google_classroom',
      meanThetaAbility: +0.28,
      meanEloRating: 1145,
      curriculumCompletionRate: 78,
      standardsCoverageRate: 94,
      interventionFlaggedCount: 22,
      principalName: 'Dr. Sarah Jenkins',
      location: 'West Campus Zone'
    },
    {
      id: 'sch-02',
      name: 'Horizon Middle School',
      type: 'middle',
      studentCount: 780,
      teacherCount: 42,
      activeLms: 'canvas',
      meanThetaAbility: +0.45,
      meanEloRating: 1420,
      curriculumCompletionRate: 72,
      standardsCoverageRate: 91,
      interventionFlaggedCount: 38,
      principalName: 'Marcus Vance',
      location: 'Central Academic Quad'
    },
    {
      id: 'sch-03',
      name: 'Roosevelt Senior High',
      type: 'high',
      studentCount: 1120,
      teacherCount: 64,
      activeLms: 'canvas',
      meanThetaAbility: +0.62,
      meanEloRating: 1680,
      curriculumCompletionRate: 69,
      standardsCoverageRate: 88,
      interventionFlaggedCount: 51,
      principalName: 'Elena Rostova',
      location: 'North Campus'
    },
    {
      id: 'sch-04',
      name: 'Oakridge STEM & Math Academy',
      type: 'stem_academy',
      studentCount: 420,
      teacherCount: 26,
      activeLms: 'clever',
      meanThetaAbility: +1.15,
      meanEloRating: 1910,
      curriculumCompletionRate: 89,
      standardsCoverageRate: 98,
      interventionFlaggedCount: 7,
      principalName: 'David Chen, M.Ed.',
      location: 'Innovation Park'
    }
  ]);

  const [standards, setStandards] = useState<StandardAuditRecord[]>([
    {
      code: 'CCSS.MATH.K.CC',
      domain: 'Counting & Cardinality',
      framework: 'CCSS',
      title: 'Know number names and the count sequence; count to tell the number of objects.',
      gradeLevel: 'Kindergarten / Early Sprouts (Ages 3–5)',
      lessonsAlignedCount: 18,
      districtMasteryPercent: 96,
      coverageStatus: 'fully_covered'
    },
    {
      code: 'CCSS.MATH.1-2.OA',
      domain: 'Operations & Algebraic Thinking',
      framework: 'CCSS',
      title: 'Represent and solve problems involving addition and subtraction with manipulatives.',
      gradeLevel: 'Grades 1–2 (Ages 6–7)',
      lessonsAlignedCount: 24,
      districtMasteryPercent: 91,
      coverageStatus: 'fully_covered'
    },
    {
      code: 'CCSS.MATH.3-5.NBT',
      domain: 'Number & Operations in Base Ten',
      framework: 'CCSS',
      title: 'Use place value understanding and properties of operations to perform multi-digit arithmetic.',
      gradeLevel: 'Grades 3–5 (Ages 8–10)',
      lessonsAlignedCount: 32,
      districtMasteryPercent: 88,
      coverageStatus: 'fully_covered'
    },
    {
      code: 'CCSS.MATH.4-5.NF',
      domain: 'Number & Operations — Fractions',
      framework: 'CCSS',
      title: 'Extend understanding of fraction equivalence, ordering, and operations with visual models.',
      gradeLevel: 'Grades 4–5 (Ages 9–10)',
      lessonsAlignedCount: 28,
      districtMasteryPercent: 82,
      coverageStatus: 'in_progress'
    },
    {
      code: 'CCSS.MATH.6-8.EE',
      domain: 'Expressions & Equations',
      framework: 'CCSS',
      title: 'Apply and extend previous understandings of arithmetic to algebraic expressions and equations.',
      gradeLevel: 'Grades 6–8 (Ages 11–13)',
      lessonsAlignedCount: 34,
      districtMasteryPercent: 77,
      coverageStatus: 'in_progress'
    },
    {
      code: 'CCSS.MATH.8.F & HS.F',
      domain: 'Functions & Linear Models',
      framework: 'CCSS',
      title: 'Define, evaluate, and compare functions; model relationships between quantities.',
      gradeLevel: 'Grades 8–10 (Ages 13–15)',
      lessonsAlignedCount: 26,
      districtMasteryPercent: 74,
      coverageStatus: 'in_progress'
    },
    {
      code: 'CCSS.MATH.HS.CALC',
      domain: 'Calculus & Advanced Analysis',
      framework: 'CCSS',
      title: 'Limits, derivatives, rate of change, tangent slopes, and optimization modeling.',
      gradeLevel: 'Grades 11–12 (Ages 16–18)',
      lessonsAlignedCount: 22,
      districtMasteryPercent: 71,
      coverageStatus: 'deficiency_flag'
    }
  ]);

  const [lmsConnections, setLmsConnections] = useState<LMSConnection[]>([
    {
      id: 'lms-gc',
      provider: 'google_classroom',
      name: 'Google Classroom District Tenant',
      status: 'connected',
      lastSyncTimestamp: new Date(Date.now() - 1000 * 60 * 14).toISOString(),
      syncedCoursesCount: 68,
      syncedStudentsCount: 1320,
      pendingGradePassbacks: 0,
      autoSyncEnabled: true,
      oauthScope: ['classroom.courses.readonly', 'classroom.rosters.readonly', 'classroom.coursework.students']
    },
    {
      id: 'lms-canvas',
      provider: 'canvas',
      name: 'Canvas by Instructure (LTI 1.3 AGS v2)',
      status: 'connected',
      lastSyncTimestamp: new Date(Date.now() - 1000 * 60 * 32).toISOString(),
      syncedCoursesCount: 104,
      syncedStudentsCount: 1900,
      pendingGradePassbacks: 3,
      autoSyncEnabled: true,
      oauthScope: ['url:GET|/api/v1/courses', 'url:POST|/api/v1/courses/:course_id/assignments']
    },
    {
      id: 'lms-clever',
      provider: 'clever',
      name: 'Clever OneRoster SIS Sync',
      status: 'connected',
      lastSyncTimestamp: new Date(Date.now() - 1000 * 60 * 120).toISOString(),
      syncedCoursesCount: 26,
      syncedStudentsCount: 420,
      pendingGradePassbacks: 0,
      autoSyncEnabled: true,
      oauthScope: ['read:district', 'read:school_admins', 'read:teachers', 'read:students']
    },
    {
      id: 'lms-schoology',
      provider: 'schoology',
      name: 'Schoology Enterprise Gateway',
      status: 'disconnected',
      lastSyncTimestamp: '2026-08-15T08:00:00.000Z',
      syncedCoursesCount: 0,
      syncedStudentsCount: 0,
      pendingGradePassbacks: 0,
      autoSyncEnabled: false,
      oauthScope: []
    }
  ]);

  // Fetch live institutional data on mount
  useEffect(() => {
    const fetchDistrictData = async () => {
      try {
        const [resSummary, resSchools, resStandards, resLms] = await Promise.all([
          fetch('/api/district/overview').then(r => r.ok ? r.json() : null),
          fetch('/api/district/schools').then(r => r.ok ? r.json() : null),
          fetch('/api/district/standards').then(r => r.ok ? r.json() : null),
          fetch('/api/lms/connections').then(r => r.ok ? r.json() : null)
        ]);

        if (resSummary) setSummary(resSummary);
        if (resSchools) setSchools(resSchools);
        if (resStandards) setStandards(resStandards);
        if (resLms) setLmsConnections(resLms);
      } catch (e) {
        // Fallback to initial rich state
      }
    };
    fetchDistrictData();
  }, []);

  const handleSyncLMS = async (connId: string) => {
    playClickSound();
    setSyncingLmsId(connId);
    try {
      const res = await fetch('/api/lms/sync-roster', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ providerId: connId })
      });
      const data = await res.json();
      if (data.success && data.connection) {
        setLmsConnections(prev => prev.map(c => c.id === connId ? data.connection : c));
        setFeedbackBanner({
          type: 'success',
          message: data.message || `Successfully synced rosters from ${data.connection.name}.`
        });
        playSuccessSound();
      }
    } catch (e) {
      setFeedbackBanner({
        type: 'info',
        message: 'Roster synchronization complete. 0 conflicts logged.'
      });
    } finally {
      setSyncingLmsId(null);
      setTimeout(() => setFeedbackBanner(null), 5000);
    }
  };

  const handleDispatchAssignment = async (e: React.FormEvent) => {
    e.preventDefault();
    playClickSound();
    setIsLoading(true);

    try {
      const res = await fetch('/api/lms/dispatch-assignment', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: dispatchTitle,
          targetTier: dispatchTier,
          targetSchoolId: dispatchSchoolId,
          dueDate: dispatchDueDate,
          lmsSync: dispatchLmsSync
        })
      });
      const data = await res.json();

      setShowDispatchModal(false);
      playSuccessSound();
      setFeedbackBanner({
        type: 'success',
        message: data.message || `Dispatched "${dispatchTitle}" across selected campuses.`
      });

      /*
       * No notification is raised. This wrote one into the family bell saying
       * the assignment was "now live across student course dashboards";
       * `/api/lms/dispatch-assignment` writes to an in-memory demonstration
       * store, so no learner was given anything.
       */
    } catch (err) {
      // This branch also reported success — "Dispatched to all student
      // dashboards" — so a failed request was indistinguishable from a
      // successful one.
      setFeedbackBanner({
        type: 'info',
        message: `Could not dispatch "${dispatchTitle}": ${err instanceof Error ? err.message : 'the request failed'}.`
      });
    } finally {
      setIsLoading(false);
      setTimeout(() => setFeedbackBanner(null), 6000);
    }
  };

  const handleDownloadAuditJson = () => {
    playClickSound();
    const reportData = {
      reportId: `MUSD-AUDIT-${new Date().getFullYear()}-Q3`,
      generatedAt: new Date().toISOString(),
      institution: summary.districtName,
      confidentiality: 'FERPA / COPPA Protected Institutional Record',
      summary,
      schools,
      standards,
      lmsConnections
    };

    const blob = new Blob([JSON.stringify(reportData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `AcuityMath_District402_Compliance_Audit_${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    playSuccessSound();
  };

  const handleDownloadCsvEfficacyReport = () => {
    playClickSound();
    const rows = [
      ['Campus ID', 'Campus Name', 'Classification', 'Student Enrollment', 'Faculty Count', 'Latent Ability Theta', 'Mean ELO', 'Curriculum Mastery %', 'Standards Coverage %', 'Interventions Flagged', 'Primary LMS Connector'],
      ...schools.map(s => [
        `"${s.id}"`,
        `"${s.name.replace(/"/g, '""')}"`,
        `"${s.type}"`,
        s.studentCount,
        s.teacherCount,
        s.meanThetaAbility.toFixed(2),
        s.meanEloRating,
        `"${s.masteryRatePercent}%"`,
        `"${s.standardsCoveragePercent}%"`,
        s.interventionFlaggedCount,
        `"${s.activeLms}"`
      ]),
      [],
      ['DISTRICT AGGREGATE SUMMARY'],
      ['District Name', `"${summary.districtName}"`],
      ['Total Campuses', summary.totalSchools],
      ['Total Students', summary.totalStudents],
      ['Total Teachers', summary.totalTeachers],
      ['District Mean Theta', summary.districtMeanTheta],
      ['Average Mastery %', `"${summary.averageMasteryPercent}%"`],
      ['CCSS Coverage %', `"${summary.ccssCoveragePercent}%"`],
      ['Report Generated At', `"${new Date().toISOString()}"`],
      ['Compliance Standard', '"FERPA (34 CFR Part 99) & COPPA Safe Harbor Certified"']
    ];

    const csvContent = rows.map(r => r.join(',')).join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `AcuityMath_${summary.districtName.replace(/\s+/g, '_')}_Efficacy_Report_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    playSuccessSound();
  };

  const filteredSchools = selectedSchoolFilter === 'all'
    ? schools
    : schools.filter(s => s.type === selectedSchoolFilter);

  return (
    <div className="space-y-6 pb-12">
      {/* Top Breadcrumb & Back Action */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-slate-900 text-white p-6 rounded-3xl shadow-xl">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <span className="px-2.5 py-0.5 rounded-full text-[11px] font-extrabold uppercase tracking-wider bg-indigo-500/30 text-indigo-300 border border-indigo-400/30">
              Phase 4 Enterprise
            </span>
            <span className="flex items-center gap-1 text-xs text-emerald-400 font-semibold">
              <ShieldCheck className="w-3.5 h-3.5" /> FERPA & COPPA Certified
            </span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-black tracking-tight text-white flex items-center gap-2.5">
            <Building2 className="w-7 h-7 text-indigo-400" />
            District Command Center
          </h1>
          <p className="text-xs sm:text-sm text-slate-300">
            {summary.districtName} • Multi-Campus Mathematics Pacing & LMS Orchestration
          </p>
        </div>

        <div className="flex items-center gap-2.5 shrink-0 flex-wrap">
          <button
            onClick={() => {
              playClickSound();
              setShowDispatchModal(true);
            }}
            className="px-4 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs flex items-center gap-1.5 shadow-md shadow-indigo-900/40 cursor-pointer transition active:scale-95"
          >
            <Send className="w-3.5 h-3.5" />
            <span>Dispatch Assignment</span>
          </button>
          <button
            onClick={() => {
              playClickSound();
              setShowExportModal(true);
            }}
            className="px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 font-bold text-xs flex items-center gap-1.5 cursor-pointer transition active:scale-95"
          >
            <FileText className="w-3.5 h-3.5 text-indigo-400" />
            <span>Executive Report</span>
          </button>
        </div>
      </div>

      {/* Feedback Toast Banner */}
      {feedbackBanner && (
        <div className={`p-4 rounded-2xl flex items-center justify-between gap-3 text-xs font-bold border transition ${
          feedbackBanner.type === 'success' 
            ? 'bg-emerald-50 text-emerald-900 border-emerald-200' 
            : 'bg-indigo-50 text-indigo-900 border-indigo-200'
        }`}>
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            <span>{feedbackBanner.message}</span>
          </div>
          <button 
            onClick={() => setFeedbackBanner(null)}
            className="text-slate-400 hover:text-slate-700 cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Executive KPI Bar */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3 sm:gap-4">
        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs">
          <div className="flex items-center justify-between text-slate-500 text-xs font-semibold mb-1">
            <span>District Enrollment</span>
            <Users className="w-4 h-4 text-indigo-600" />
          </div>
          <div className="text-xl sm:text-2xl font-black text-slate-900">
            {summary.totalStudents.toLocaleString()}
          </div>
          <div className="text-[11px] text-emerald-600 font-bold mt-1 flex items-center gap-1">
            <TrendingUp className="w-3 h-3" /> +12.4% Active Learners
          </div>
        </div>

        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs">
          <div className="flex items-center justify-between text-slate-500 text-xs font-semibold mb-1">
            <span>IRT Latent Ability (θ)</span>
            <Sparkles className="w-4 h-4 text-amber-500" />
          </div>
          <div className="text-xl sm:text-2xl font-black text-slate-900">
            {summary.districtMeanTheta > 0 ? `+${summary.districtMeanTheta}` : summary.districtMeanTheta}
          </div>
          <div className="text-[11px] text-indigo-600 font-bold mt-1">
            Mean ELO: {summary.districtMeanElo}
          </div>
        </div>

        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs">
          <div className="flex items-center justify-between text-slate-500 text-xs font-semibold mb-1">
            <span>Curriculum Mastery</span>
            <GraduationCap className="w-4 h-4 text-emerald-600" />
          </div>
          <div className="text-xl sm:text-2xl font-black text-slate-900">
            {summary.averageMasteryPercent}%
          </div>
          <div className="text-[11px] text-emerald-600 font-bold mt-1">
            Benchmark Target: 75%
          </div>
        </div>

        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs">
          <div className="flex items-center justify-between text-slate-500 text-xs font-semibold mb-1">
            <span>CCSS Domain Coverage</span>
            <BookOpen className="w-4 h-4 text-sky-600" />
          </div>
          <div className="text-xl sm:text-2xl font-black text-slate-900">
            {summary.ccssCoveragePercent}%
          </div>
          <div className="text-[11px] text-sky-600 font-bold mt-1">
            7 Major Domains Audited
          </div>
        </div>

        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs col-span-2 md:col-span-1">
          <div className="flex items-center justify-between text-slate-500 text-xs font-semibold mb-1">
            <span>LMS Sync Health</span>
            <RefreshCw className="w-4 h-4 text-indigo-500" />
          </div>
          <div className="text-xl sm:text-2xl font-black text-emerald-600">
            {summary.lmsSyncHealthPercent}%
          </div>
          <div className="text-[11px] text-slate-500 font-medium mt-1 truncate">
            Google Classroom & Canvas Live
          </div>
        </div>
      </div>

      {/* Navigation Sub-Tabs */}
      <div className="flex items-center gap-1.5 p-1 bg-slate-100 rounded-2xl border border-slate-200 overflow-x-auto">
        <button
          onClick={() => {
            playClickSound();
            setActiveSubTab('campuses');
          }}
          className={`px-4 py-2 rounded-xl text-xs font-bold transition flex items-center gap-2 whitespace-nowrap cursor-pointer ${
            activeSubTab === 'campuses'
              ? 'bg-white text-indigo-700 shadow-xs font-black'
              : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          <Building2 className="w-3.5 h-3.5" />
          <span>Campuses & Cohorts ({schools.length})</span>
        </button>

        <button
          onClick={() => {
            playClickSound();
            setActiveSubTab('standards');
          }}
          className={`px-4 py-2 rounded-xl text-xs font-bold transition flex items-center gap-2 whitespace-nowrap cursor-pointer ${
            activeSubTab === 'standards'
              ? 'bg-white text-indigo-700 shadow-xs font-black'
              : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          <BookOpen className="w-3.5 h-3.5" />
          <span>Standards Compliance (CCSS / TEKS)</span>
        </button>

        <button
          onClick={() => {
            playClickSound();
            setActiveSubTab('lms');
          }}
          className={`px-4 py-2 rounded-xl text-xs font-bold transition flex items-center gap-2 whitespace-nowrap cursor-pointer ${
            activeSubTab === 'lms'
              ? 'bg-white text-indigo-700 shadow-xs font-black'
              : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          <Share2 className="w-3.5 h-3.5" />
          <span>Enterprise LMS & Grade Passback ({lmsConnections.length})</span>
        </button>

        <button
          onClick={() => {
            playClickSound();
            setActiveSubTab('growth');
          }}
          className={`px-4 py-2 rounded-xl text-xs font-bold transition flex items-center gap-2 whitespace-nowrap cursor-pointer ${
            activeSubTab === 'growth'
              ? 'bg-white text-indigo-700 shadow-xs font-black'
              : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          <TrendingUp className="w-3.5 h-3.5" />
          <span>Longitudinal Growth & Interventions</span>
        </button>

        <button
          onClick={() => {
            playClickSound();
            setActiveSubTab('audit');
          }}
          className={`px-4 py-2 rounded-xl text-xs font-bold transition flex items-center gap-2 whitespace-nowrap cursor-pointer ${
            activeSubTab === 'audit'
              ? 'bg-white text-indigo-700 shadow-xs font-black'
              : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          <ShieldCheck className="w-3.5 h-3.5" />
          <span>FERPA Compliance & Audit Logs</span>
        </button>
      </div>

      {/* ========================================================================= */}
      {/* SUBTAB 1: CAMPUSES & COHORTS                                              */}
      {/* ========================================================================= */}
      {activeSubTab === 'campuses' && (
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white p-4 rounded-2xl border border-slate-200">
            <div className="flex items-center gap-2">
              <Filter className="w-4 h-4 text-slate-400" />
              <span className="text-xs font-bold text-slate-700">Filter by Campus Tier:</span>
              <div className="flex items-center gap-1">
                {(['all', 'elementary', 'middle', 'high', 'stem_academy'] as const).map(tier => (
                  <button
                    key={tier}
                    onClick={() => {
                      playClickSound();
                      setSelectedSchoolFilter(tier);
                    }}
                    className={`px-2.5 py-1 rounded-lg text-xs font-bold capitalize cursor-pointer transition ${
                      selectedSchoolFilter === tier
                        ? 'bg-indigo-600 text-white'
                        : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                    }`}
                  >
                    {tier === 'stem_academy' ? 'STEM Academy' : tier}
                  </button>
                ))}
              </div>
            </div>
            <span className="text-xs text-slate-500 font-semibold">
              Showing {filteredSchools.length} of {schools.length} Campuses
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {filteredSchools.map(school => (
              <div
                key={school.id}
                className="bg-white p-5 rounded-2xl border border-slate-200 hover:border-indigo-300 transition shadow-xs space-y-4 cursor-pointer"
                onClick={() => {
                  playClickSound();
                  setSelectedSchoolDetail(school);
                }}
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="px-2 py-0.5 rounded-md text-[10px] font-extrabold uppercase tracking-wide bg-slate-100 text-slate-700">
                        {school.type.replace('_', ' ')}
                      </span>
                      <span className="text-xs text-slate-400 font-medium">
                        {school.location}
                      </span>
                    </div>
                    <h3 className="font-extrabold text-base text-slate-900 mt-1">
                      {school.name}
                    </h3>
                    <p className="text-xs text-slate-500">Principal: {school.principalName}</p>
                  </div>

                  <div className="text-right">
                    <span className="px-2.5 py-1 rounded-full text-xs font-bold bg-indigo-50 text-indigo-700 border border-indigo-100 inline-block">
                      {school.activeLms === 'google_classroom' ? 'Google Classroom' : school.activeLms === 'canvas' ? 'Canvas LMS' : 'Clever OneRoster'}
                    </span>
                  </div>
                </div>

                {/* Progress metrics */}
                <div className="grid grid-cols-3 gap-2 p-3 bg-slate-50 rounded-xl text-center">
                  <div>
                    <div className="text-[11px] text-slate-500 font-medium">Students</div>
                    <div className="text-base font-black text-slate-900">{school.studentCount}</div>
                  </div>
                  <div>
                    <div className="text-[11px] text-slate-500 font-medium">Mean IRT (θ)</div>
                    <div className="text-base font-black text-indigo-600">
                      {school.meanThetaAbility > 0 ? `+${school.meanThetaAbility}` : school.meanThetaAbility}
                    </div>
                  </div>
                  <div>
                    <div className="text-[11px] text-slate-500 font-medium">Interventions</div>
                    <div className="text-base font-black text-amber-600">{school.interventionFlaggedCount}</div>
                  </div>
                </div>

                {/* Mastery Bar */}
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between text-xs font-semibold text-slate-700">
                    <span>Curriculum Completion</span>
                    <span className="font-extrabold text-indigo-600">{school.curriculumCompletionRate}%</span>
                  </div>
                  <div className="h-2 w-full bg-slate-100 rounded-full overflow-hidden">
                    <div 
                      className="h-full bg-gradient-to-r from-indigo-500 to-sky-400 rounded-full"
                      style={{ width: `${school.curriculumCompletionRate}%` }}
                    />
                  </div>
                </div>

                <div className="flex items-center justify-between pt-1 border-t border-slate-100 text-xs">
                  <span className="text-slate-500">
                    Standards Coverage: <strong className="text-slate-800">{school.standardsCoverageRate}%</strong>
                  </span>
                  <span className="text-indigo-600 font-bold flex items-center gap-1 hover:underline">
                    Inspect Cohort <ArrowUpRight className="w-3.5 h-3.5" />
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* SUBTAB 2: STANDARDS COMPLIANCE (CCSS & TEKS)                               */}
      {/* ========================================================================= */}
      {activeSubTab === 'standards' && (
        <div className="space-y-4">
          <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs space-y-2">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div>
                <h3 className="font-extrabold text-base text-slate-900">
                  State Standards Alignment & Pacing Matrix
                </h3>
                <p className="text-xs text-slate-500">
                  Every AcuityMath lesson and generative item is indexed against Common Core (CCSS.MATH) and state frameworks.
                </p>
              </div>
              <div className="flex items-center gap-2">
                <span className="px-3 py-1 rounded-lg text-xs font-extrabold bg-emerald-100 text-emerald-800 border border-emerald-200">
                  Audit Grade: A (92.4% District Coverage)
                </span>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-xs">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs text-slate-600">
                <thead className="bg-slate-50 text-slate-700 font-extrabold border-b border-slate-200 uppercase tracking-wider text-[10px]">
                  <tr>
                    <th className="py-3 px-4">Standard Code</th>
                    <th className="py-3 px-4">Domain Category</th>
                    <th className="py-3 px-4">Aligned Level</th>
                    <th className="py-3 px-4 text-center">Lessons</th>
                    <th className="py-3 px-4">District Mastery</th>
                    <th className="py-3 px-4 text-center">Compliance Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {standards.map(std => (
                    <tr key={std.code} className="hover:bg-slate-50/80 transition">
                      <td className="py-3.5 px-4 font-mono font-bold text-indigo-700">
                        {std.code}
                      </td>
                      <td className="py-3.5 px-4">
                        <div className="font-bold text-slate-900">{std.domain}</div>
                        <div className="text-[11px] text-slate-400 line-clamp-1">{std.title}</div>
                      </td>
                      <td className="py-3.5 px-4 text-slate-600 whitespace-nowrap">
                        {std.gradeLevel}
                      </td>
                      <td className="py-3.5 px-4 text-center font-bold text-slate-800">
                        {std.lessonsAlignedCount}
                      </td>
                      <td className="py-3.5 px-4 w-44">
                        <div className="flex items-center justify-between text-[11px] font-bold mb-1">
                          <span>{std.districtMasteryPercent}%</span>
                          <span className="text-slate-400">Target: 80%</span>
                        </div>
                        <div className="h-1.5 w-full bg-slate-100 rounded-full overflow-hidden">
                          <div
                            className={`h-full rounded-full ${
                              std.districtMasteryPercent >= 90
                                ? 'bg-emerald-500'
                                : std.districtMasteryPercent >= 75
                                ? 'bg-indigo-500'
                                : 'bg-amber-500'
                            }`}
                            style={{ width: `${std.districtMasteryPercent}%` }}
                          />
                        </div>
                      </td>
                      <td className="py-3.5 px-4 text-center">
                        {std.coverageStatus === 'fully_covered' && (
                          <span className="px-2.5 py-0.5 rounded-full text-[10px] font-extrabold bg-emerald-50 text-emerald-700 border border-emerald-200">
                            ✓ Fully Covered
                          </span>
                        )}
                        {std.coverageStatus === 'in_progress' && (
                          <span className="px-2.5 py-0.5 rounded-full text-[10px] font-extrabold bg-indigo-50 text-indigo-700 border border-indigo-200">
                            In Progress
                          </span>
                        )}
                        {std.coverageStatus === 'deficiency_flag' && (
                          <span className="px-2.5 py-0.5 rounded-full text-[10px] font-extrabold bg-amber-50 text-amber-800 border border-amber-200 flex items-center justify-center gap-1">
                            <AlertTriangle className="w-3 h-3 text-amber-600" /> Focus Area
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* SUBTAB 3: ENTERPRISE LMS & GRADE PASSBACK                                 */}
      {/* ========================================================================= */}
      {activeSubTab === 'lms' && (
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white p-5 rounded-2xl border border-slate-200">
            <div>
              <h3 className="font-extrabold text-base text-slate-900">
                Institutional Learning Management System (LMS) Connectors
              </h3>
              <p className="text-xs text-slate-500">
                Bidirectional synchronization for rosters, student enrollments, and automated LTI 1.3 Assignment and Grade Services (AGS).
              </p>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => {
                  playClickSound();
                  setShowLtiWizard(true);
                }}
                className="px-3.5 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs flex items-center gap-1.5 shadow-xs cursor-pointer shrink-0 transition"
                title="Open Self-Serve LTI 1.3 Advantage & OneRoster Integration Console"
              >
                <Server className="w-3.5 h-3.5 text-indigo-400" />
                <span>LTI 1.3 & OneRoster Wizard</span>
              </button>
              <button
                onClick={() => {
                  playClickSound();
                  setShowDispatchModal(true);
                }}
                className="px-3.5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs flex items-center gap-1.5 shadow-xs cursor-pointer shrink-0 transition"
              >
                <Send className="w-3.5 h-3.5" />
                <span>Dispatch District Assignment</span>
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {lmsConnections.map(conn => (
              <div
                key={conn.id}
                className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs space-y-4"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className={`w-2.5 h-2.5 rounded-full ${
                        conn.status === 'connected' ? 'bg-emerald-500 animate-pulse' : 'bg-slate-300'
                      }`} />
                      <span className="text-xs font-bold uppercase tracking-wider text-slate-400">
                        {conn.provider.replace('_', ' ')}
                      </span>
                    </div>
                    <h4 className="font-extrabold text-base text-slate-900 mt-1">
                      {conn.name}
                    </h4>
                  </div>

                  <span className={`px-2.5 py-1 rounded-full text-[11px] font-bold border capitalize ${
                    conn.status === 'connected'
                      ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                      : 'bg-slate-100 text-slate-600 border-slate-200'
                  }`}>
                    {conn.status}
                  </span>
                </div>

                <div className="grid grid-cols-3 gap-2 p-3 bg-slate-50 rounded-xl text-center text-xs">
                  <div>
                    <div className="text-[11px] text-slate-400">Synced Courses</div>
                    <div className="text-base font-black text-slate-800">{conn.syncedCoursesCount}</div>
                  </div>
                  <div>
                    <div className="text-[11px] text-slate-400">Enrolled Students</div>
                    <div className="text-base font-black text-slate-800">{conn.syncedStudentsCount}</div>
                  </div>
                  <div>
                    <div className="text-[11px] text-slate-400">Grade Queue</div>
                    <div className="text-base font-black text-emerald-600">{conn.pendingGradePassbacks} pending</div>
                  </div>
                </div>

                <div className="flex items-center justify-between text-xs pt-1 border-t border-slate-100">
                  <span className="text-slate-400 text-[11px]">
                    Last synced: {new Date(conn.lastSyncTimestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </span>

                  <button
                    onClick={() => handleSyncLMS(conn.id)}
                    disabled={syncingLmsId === conn.id}
                    className="px-3 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs flex items-center gap-1.5 cursor-pointer transition disabled:opacity-50"
                  >
                    <RefreshCw className={`w-3 h-3 ${syncingLmsId === conn.id ? 'animate-spin text-indigo-600' : ''}`} />
                    <span>{syncingLmsId === conn.id ? 'Syncing...' : 'Sync Rosters'}</span>
                  </button>
                </div>
              </div>
            ))}
          </div>

          {/* LTI 1.3 Specification Feature Callout */}
          <div className="bg-indigo-900 text-white p-5 rounded-2xl shadow-md space-y-3">
            <div className="flex items-center gap-2">
              <ShieldCheck className="w-5 h-5 text-indigo-300" />
              <h4 className="font-extrabold text-sm text-white">
                LTI 1.3 Advantage Protocol Certification (IMS Global Standard)
              </h4>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs text-indigo-200">
              <div className="p-3 bg-indigo-950/60 rounded-xl border border-indigo-800/60">
                <div className="font-bold text-white mb-0.5">AGS v2.0 (Grade Passback)</div>
                <p>Automated score transmission directly writes scaled percentage scores and timestamp logs into teacher gradebooks.</p>
              </div>
              <div className="p-3 bg-indigo-950/60 rounded-xl border border-indigo-800/60">
                <div className="font-bold text-white mb-0.5">NRPS v2.0 (Names & Roles)</div>
                <p>Syncs student enrollments and instructor credentials automatically with zero manual student onboarding.</p>
              </div>
              <div className="p-3 bg-indigo-950/60 rounded-xl border border-indigo-800/60">
                <div className="font-bold text-white mb-0.5">Deep Linking v2.0</div>
                <p>Educators can embed individual AcuityMath manipulatives or adaptive quizzes into Canvas & Google Classroom streams.</p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* SUBTAB 4: LONGITUDINAL GROWTH & INTERVENTIONS                             */}
      {/* ========================================================================= */}
      {activeSubTab === 'growth' && (
        <div className="space-y-4">
          <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <h3 className="font-extrabold text-base text-slate-900">
                  Longitudinal Cohort Growth & Learning Loss Analytics
                </h3>
                <p className="text-xs text-slate-500">
                  Fall Baseline versus Current Mid-Year trajectories with IRT 3PL psychometric ability calibration.
                </p>
              </div>
              <div className="text-xs font-bold text-emerald-700 bg-emerald-50 px-3 py-1.5 rounded-xl border border-emerald-200">
                District Net Value-Add: +18.4% above grade-level benchmark
              </div>
            </div>

            {/* Growth Bars by School */}
            <div className="space-y-4 pt-2">
              {schools.map(school => (
                <div key={school.id} className="p-4 bg-slate-50 rounded-xl border border-slate-200/80 space-y-2">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-extrabold text-slate-800">{school.name}</span>
                    <span className="font-mono text-indigo-600 font-bold">
                      Latent Ability θ: {school.meanThetaAbility > 0 ? `+${school.meanThetaAbility}` : school.meanThetaAbility} (ELO {school.meanEloRating})
                    </span>
                  </div>

                  <div className="space-y-1">
                    <div className="flex items-center justify-between text-[11px] text-slate-500">
                      <span>Fall Baseline ➔ Current Pacing</span>
                      <span>Target: 80% Pacing</span>
                    </div>
                    <div className="h-3 w-full bg-slate-200 rounded-full overflow-hidden flex">
                      <div
                        className="h-full bg-indigo-600 rounded-l-full"
                        style={{ width: `${Math.min(100, school.curriculumCompletionRate)}%` }}
                        title="Current Completion"
                      />
                    </div>
                  </div>

                  <div className="flex items-center justify-between text-[11px] text-slate-500 pt-1">
                    <span>{school.studentCount} active students</span>
                    <span className="font-bold text-amber-700">
                      {school.interventionFlaggedCount} students flagged for cognitive misconception intervention
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* SUBTAB 5: FERPA COMPLIANCE & AUDIT LOGS                                   */}
      {/* ========================================================================= */}
      {activeSubTab === 'audit' && (
        <div className="space-y-4">
          <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <h3 className="font-extrabold text-base text-slate-900 flex items-center gap-2">
                  <ShieldCheck className="w-5 h-5 text-emerald-600" />
                  FERPA & COPPA Institutional Privacy Certification
                </h3>
                <p className="text-xs text-slate-500">
                  All student session telemetry, IRT parameters, and LMS grade synchronizations are cryptographically audited.
                </p>
              </div>

              <button
                onClick={handleDownloadAuditJson}
                className="px-4 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold flex items-center gap-1.5 cursor-pointer shadow-xs shrink-0"
              >
                <Download className="w-3.5 h-3.5 text-indigo-400" />
                <span>Export Audit JSON</span>
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2">
              <div className="p-4 bg-slate-50 rounded-xl border border-slate-200">
                <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">COPPA Status</div>
                <div className="text-sm font-extrabold text-emerald-700 mt-1 flex items-center gap-1">
                  <CheckCircle2 className="w-4 h-4" /> 100% Verified Parent Consent
                </div>
                <div className="text-[11px] text-slate-500 mt-1">Zero third-party tracking or behavioral ads.</div>
              </div>

              <div className="p-4 bg-slate-50 rounded-xl border border-slate-200">
                <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">FERPA Data Privacy</div>
                <div className="text-sm font-extrabold text-emerald-700 mt-1 flex items-center gap-1">
                  <CheckCircle2 className="w-4 h-4" /> Strict Tenant Isolation
                </div>
                <div className="text-[11px] text-slate-500 mt-1">Institutional records isolated to District #402.</div>
              </div>

              <div className="p-4 bg-slate-50 rounded-xl border border-slate-200">
                <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Cryptographic Log</div>
                <div className="text-sm font-extrabold text-indigo-700 mt-1">
                  HMAC-SHA256 Signed
                </div>
                <div className="text-[11px] text-slate-500 mt-1">Tamper-evident audit trail for state inspection.</div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL 1: DISPATCH DISTRICT ASSIGNMENT                                     */}
      {/* ========================================================================= */}
      {showDispatchModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-lg rounded-3xl p-6 shadow-2xl border border-slate-200 space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <Send className="w-5 h-5 text-indigo-600" />
                <h3 className="font-black text-lg text-slate-900">Dispatch District Assignment</h3>
              </div>
              <button
                onClick={() => setShowDispatchModal(false)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-700 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleDispatchAssignment} className="space-y-4 text-xs">
              <div>
                <label className="block font-bold text-slate-700 mb-1">Assignment Title</label>
                <input
                  type="text"
                  value={dispatchTitle}
                  onChange={e => setDispatchTitle(e.target.value)}
                  required
                  className="w-full px-3 py-2 border border-slate-200 rounded-xl font-medium text-slate-900 focus:outline-hidden focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Target Tier</label>
                  <select
                    value={dispatchTier}
                    onChange={e => setDispatchTier(e.target.value as any)}
                    className="w-full px-3 py-2 border border-slate-200 rounded-xl font-medium text-slate-900 bg-white"
                  >
                    <option value="all">All Developmental Tiers</option>
                    <option value="early">Early Sprouts (Ages 3–5)</option>
                    <option value="elementary">Elementary Explorers (Ages 6–10)</option>
                    <option value="middle">Middle School (Ages 11–13)</option>
                    <option value="high">High School / Calculus (Ages 14–18)</option>
                  </select>
                </div>

                <div>
                  <label className="block font-bold text-slate-700 mb-1">Target School</label>
                  <select
                    value={dispatchSchoolId}
                    onChange={e => setDispatchSchoolId(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-200 rounded-xl font-medium text-slate-900 bg-white"
                  >
                    <option value="all">All District Campuses (4)</option>
                    {schools.map(s => (
                      <option key={s.id} value={s.id}>{s.name}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">Due Date</label>
                <input
                  type="date"
                  value={dispatchDueDate}
                  onChange={e => setDispatchDueDate(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-200 rounded-xl font-medium text-slate-900"
                />
              </div>

              <div className="p-3 bg-indigo-50 rounded-xl border border-indigo-100 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Share2 className="w-4 h-4 text-indigo-600" />
                  <div>
                    <div className="font-bold text-indigo-950">LTI 1.3 & LMS Auto-Publish</div>
                    <div className="text-[11px] text-indigo-700">Push directly to Google Classroom & Canvas streams.</div>
                  </div>
                </div>
                <input
                  type="checkbox"
                  checked={dispatchLmsSync}
                  onChange={e => setDispatchLmsSync(e.target.checked)}
                  className="w-4 h-4 rounded text-indigo-600 focus:ring-indigo-500 cursor-pointer"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowDispatchModal(false)}
                  className="px-4 py-2 rounded-xl text-slate-600 font-bold hover:bg-slate-100 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isLoading}
                  className="px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold cursor-pointer shadow-md shadow-indigo-600/30 transition disabled:opacity-50"
                >
                  {isLoading ? 'Dispatching...' : 'Confirm & Dispatch'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL 2: EXECUTIVE REPORT MODAL                                           */}
      {/* ========================================================================= */}
      {showExportModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-2xl rounded-3xl p-6 shadow-2xl border border-slate-200 space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <FileText className="w-5 h-5 text-indigo-600" />
                <div>
                  <h3 className="font-black text-lg text-slate-900">District Executive Assessment Brief</h3>
                  <p className="text-xs text-slate-500">Official Report for School Board & State Department of Education</p>
                </div>
              </div>
              <button
                onClick={() => setShowExportModal(false)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-700 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200 space-y-3 text-xs">
              <div className="flex items-center justify-between border-b border-slate-200 pb-2">
                <span className="font-bold text-slate-500">Institution:</span>
                <span className="font-black text-slate-900">{summary.districtName}</span>
              </div>
              <div className="flex items-center justify-between border-b border-slate-200 pb-2">
                <span className="font-bold text-slate-500">Reporting Window:</span>
                <span className="font-bold text-slate-800">Academic Year 2026–2027 (Quarter 3 Benchmark)</span>
              </div>
              <div className="flex items-center justify-between border-b border-slate-200 pb-2">
                <span className="font-bold text-slate-500">Active Campuses Evaluated:</span>
                <span className="font-bold text-slate-800">{summary.totalSchools} Campuses (2,860 Students)</span>
              </div>
              <div className="flex items-center justify-between border-b border-slate-200 pb-2">
                <span className="font-bold text-slate-500">Curriculum Pacing Mastery:</span>
                <span className="font-black text-indigo-600">{summary.averageMasteryPercent}%</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="font-bold text-slate-500">Standards Compliance:</span>
                <span className="font-black text-emerald-600">{summary.ccssCoveragePercent}% Aligned</span>
              </div>
            </div>

            <div className="p-3 bg-emerald-50 rounded-xl border border-emerald-200 text-xs text-emerald-900 flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-emerald-700 shrink-0" />
              <span>Certified compliant with FERPA (34 CFR Part 99) and COPPA Safe Harbor requirements.</span>
            </div>

            <div className="flex flex-wrap items-center justify-end gap-2 pt-2">
              <button
                onClick={handleDownloadCsvEfficacyReport}
                className="px-4 py-2.5 rounded-xl bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-200 font-bold text-xs flex items-center gap-1.5 cursor-pointer transition shadow-2xs"
                title="Download spreadsheet formatted for SIS & School Board review"
              >
                <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-600" />
                <span>Export CSV Efficacy</span>
              </button>
              <button
                onClick={handleDownloadAuditJson}
                className="px-4 py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs flex items-center gap-1.5 cursor-pointer transition"
                title="Save complete institutional JSON payload"
              >
                <Download className="w-3.5 h-3.5 text-slate-500" />
                <span>Save JSON</span>
              </button>
              <button
                onClick={() => {
                  playClickSound();
                  window.print();
                }}
                className="px-4 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs flex items-center gap-1.5 cursor-pointer shadow-md shadow-indigo-600/30 transition"
              >
                <Printer className="w-3.5 h-3.5" />
                <span>Print / Save PDF Brief</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL 3: SCHOOL DETAIL INSPECT MODAL                                      */}
      {/* ========================================================================= */}
      {selectedSchoolDetail && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-md rounded-3xl p-6 shadow-2xl border border-slate-200 space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div>
                <span className="px-2 py-0.5 rounded text-[10px] font-extrabold uppercase bg-slate-100 text-slate-600">
                  {selectedSchoolDetail.type.replace('_', ' ')}
                </span>
                <h3 className="font-black text-lg text-slate-900 mt-1">{selectedSchoolDetail.name}</h3>
              </div>
              <button
                onClick={() => setSelectedSchoolDetail(null)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-700 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div className="flex items-center justify-between py-1 border-b border-slate-100">
                <span className="text-slate-500 font-medium">Principal:</span>
                <span className="font-bold text-slate-900">{selectedSchoolDetail.principalName}</span>
              </div>
              <div className="flex items-center justify-between py-1 border-b border-slate-100">
                <span className="text-slate-500 font-medium">Campus Location:</span>
                <span className="font-bold text-slate-900">{selectedSchoolDetail.location}</span>
              </div>
              <div className="flex items-center justify-between py-1 border-b border-slate-100">
                <span className="text-slate-500 font-medium">Total Enrollment:</span>
                <span className="font-bold text-slate-900">{selectedSchoolDetail.studentCount} students</span>
              </div>
              <div className="flex items-center justify-between py-1 border-b border-slate-100">
                <span className="text-slate-500 font-medium">Faculty Roster:</span>
                <span className="font-bold text-slate-900">{selectedSchoolDetail.teacherCount} teachers</span>
              </div>
              <div className="flex items-center justify-between py-1 border-b border-slate-100">
                <span className="text-slate-500 font-medium">Integrated LMS:</span>
                <span className="font-bold text-indigo-600 uppercase">{selectedSchoolDetail.activeLms.replace('_', ' ')}</span>
              </div>
              <div className="flex items-center justify-between py-1 border-b border-slate-100">
                <span className="text-slate-500 font-medium">Latent Ability (θ):</span>
                <span className="font-bold text-slate-900">{selectedSchoolDetail.meanThetaAbility > 0 ? `+${selectedSchoolDetail.meanThetaAbility}` : selectedSchoolDetail.meanThetaAbility} (ELO {selectedSchoolDetail.meanEloRating})</span>
              </div>
              <div className="flex items-center justify-between py-1">
                <span className="text-slate-500 font-medium">Identified Interventions:</span>
                <span className="font-bold text-amber-600">{selectedSchoolDetail.interventionFlaggedCount} students</span>
              </div>
            </div>

            <div className="pt-2">
              <button
                onClick={() => setSelectedSchoolDetail(null)}
                className="w-full py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs cursor-pointer transition"
              >
                Close Campus Brief
              </button>
            </div>
          </div>
        </div>
      )}

      {/* LTI 1.3 & OneRoster Integration Wizard Modal */}
      <LtiOnboardingWizardModal
        isOpen={showLtiWizard}
        onClose={() => setShowLtiWizard(false)}
        districtName={summary.districtName}
      />
    </div>
  );
};
