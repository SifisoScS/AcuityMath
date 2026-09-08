import React, { useState } from 'react';
import { AgeTier, UserProfile } from '../../types';
import { LabToolId, ManipulativeToolMeta } from '../../types/manipulatives';
import { TenFrameLab, SubitizingLab } from './EarlyMathLabs';
import { FractionVisualizerLab, BaseTenBlocksLab } from './ElementaryMathLabs';
import { CoordinateGrapherLab, UnitCircleLab, CalculusDerivativeLab } from './SecondaryMathLabs';
import { playClickSound, speakText } from '../../utils/audio';
import {
  Sparkles,
  Layers,
  PieChart,
  Compass,
  LineChart,
  Activity,
  Zap,
  Grid,
  Filter,
  CheckCircle2,
  BookOpen,
  HelpCircle,
  Volume2,
  Languages
} from 'lucide-react';

interface ManipulativesHubProps {
  activeProfile: UserProfile;
  initialToolId?: LabToolId;
  onOpenGlossary?: () => void;
}

const LAB_TOOLS: ManipulativeToolMeta[] = [
  {
    id: 'ten_frame',
    tier: 'early',
    title: 'Ten-Frame Counter',
    subtitle: 'Dual-token 10-slot grid with bonds to 10 and subitizing',
    ageRange: 'Ages 3–5',
    badge: 'Concrete Number Sense',
    category: 'Counting & Number Sense',
    concepts: ['Bonds to 10', 'Even/Odd Arrays', 'Dual Partitions']
  },
  {
    id: 'subitizing',
    tier: 'early',
    title: 'Rapid Dot Flash',
    subtitle: 'Flash card perception trainer for instant quantity recognition',
    ageRange: 'Ages 3–5',
    badge: 'Perceptual Estimation',
    category: 'Counting & Number Sense',
    concepts: ['Subitizing', 'Dice Patterns', 'Ten-Frame Flash']
  },
  {
    id: 'fraction_visualizer',
    tier: 'elementary',
    title: 'Fraction Pizza & Strips',
    subtitle: 'Live circular and rectangular fraction equivalence comparator',
    ageRange: 'Ages 6–10',
    badge: 'Proportional Reasoning',
    category: 'Fractions & Place Value',
    concepts: ['Equivalent Fractions', 'Circle Slices', 'Fraction Strips']
  },
  {
    id: 'base_ten',
    tier: 'elementary',
    title: 'Base-10 Blocks Lab',
    subtitle: 'Units, Rods, Flats, and Cubes with live regrouping & trading',
    ageRange: 'Ages 6–10',
    badge: 'Place Value & Operations',
    category: 'Fractions & Place Value',
    concepts: ['Place Value', 'Regrouping', 'Expanded Form']
  },
  {
    id: 'coordinate_grapher',
    tier: 'middle',
    title: 'Linear Coordinate Grapher',
    subtitle: 'Interactive Cartesian plane with slope triangles & y = mx + b',
    ageRange: 'Ages 11–13',
    badge: 'Cartesian Algebra',
    category: 'Algebra & Geometry',
    concepts: ['Slope m = Δy/Δx', 'Y-Intercept', 'Quadrant Grid']
  },
  {
    id: 'unit_circle',
    tier: 'high',
    title: 'Trigonometric Unit Circle',
    subtitle: '360°/2π radian explorer with sine/cosine rays and exact radicals',
    ageRange: 'Ages 14–18',
    badge: 'Trigonometry & Radians',
    category: 'Trigonometry & Calculus',
    concepts: ['sin(θ) / cos(θ)', 'Special Angles', 'Unit Circle Projections']
  },
  {
    id: 'calculus_derivative',
    tier: 'high',
    title: 'Derivative Tangent Lab',
    subtitle: 'Secant-to-tangent convergence showing instantaneous rate h ➔ 0',
    ageRange: 'Ages 14–18',
    badge: 'Calculus Limits',
    category: 'Trigonometry & Calculus',
    concepts: ['Difference Quotient', 'Tangent Lines', 'f\'(x) Rate of Change']
  }
];

export const ManipulativesHub: React.FC<ManipulativesHubProps> = ({
  activeProfile,
  initialToolId,
  onOpenGlossary
}) => {
  // Determine default tool based on student tier if not specified
  const getDefaultTool = (): LabToolId => {
    if (initialToolId) return initialToolId;
    if (activeProfile.tier === 'early') return 'ten_frame';
    if (activeProfile.tier === 'elementary') return 'fraction_visualizer';
    if (activeProfile.tier === 'middle') return 'coordinate_grapher';
    return 'unit_circle';
  };

  const [activeToolId, setActiveToolId] = useState<LabToolId>(getDefaultTool);
  const [tierFilter, setTierFilter] = useState<AgeTier | 'all'>('all');

  const filteredTools = LAB_TOOLS.filter(
    tool => tierFilter === 'all' || tool.tier === tierFilter
  );

  const activeToolMeta = LAB_TOOLS.find(t => t.id === activeToolId) || LAB_TOOLS[0];

  const getToolIcon = (id: LabToolId) => {
    switch (id) {
      case 'ten_frame':
        return <Grid className="w-5 h-5 text-rose-600" />;
      case 'subitizing':
        return <Zap className="w-5 h-5 text-amber-500" />;
      case 'fraction_visualizer':
        return <PieChart className="w-5 h-5 text-indigo-600" />;
      case 'base_ten':
        return <Layers className="w-5 h-5 text-emerald-600" />;
      case 'coordinate_grapher':
        return <LineChart className="w-5 h-5 text-violet-600" />;
      case 'unit_circle':
        return <Compass className="w-5 h-5 text-cyan-600" />;
      case 'calculus_derivative':
        return <Activity className="w-5 h-5 text-rose-600" />;
    }
  };

  return (
    <div className="space-y-6 pb-12">
      {/* Top Banner */}
      <div className="bg-gradient-to-r from-indigo-900 via-slate-900 to-indigo-950 text-white p-6 sm:p-8 rounded-3xl border border-indigo-800/80 shadow-md flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
        <div className="space-y-2 max-w-2xl">
          <div className="flex items-center gap-2">
            <span className="px-3 py-1 rounded-full bg-indigo-500/30 text-indigo-200 border border-indigo-400/40 text-xs font-extrabold flex items-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5 text-amber-300" />
              Phase 2 • Virtual Math Laboratories
            </span>
            <span className="text-xs text-indigo-300 font-semibold hidden sm:inline">
              Concrete ➔ Representational ➔ Abstract
            </span>
          </div>
          <h2 className="text-2xl sm:text-3xl font-black tracking-tight text-white">
            Interactive Math Manipulatives & Labs
          </h2>
          <p className="text-xs sm:text-sm text-indigo-200/90 leading-relaxed">
            Direct manipulation environments that transform abstract mathematical equations into tactile, visual, and intuitive experiments spanning early childhood through advanced calculus.
          </p>
        </div>

        {/* Pedagogical CRA Badge */}
        <div className="bg-white/10 backdrop-blur-md p-4 rounded-2xl border border-white/15 shrink-0 text-center space-y-1">
          <div className="text-[10px] font-bold text-amber-300 uppercase tracking-wider">CRA Sequence</div>
          <div className="text-xs font-black text-white flex items-center gap-1">
            <span>Play</span> ➔ <span>Visualize</span> ➔ <span>Master</span>
          </div>
          <p className="text-[10px] text-indigo-200">Aligned with NCTM standards</p>
        </div>
      </div>

      {/* Tier Filter Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 bg-white p-3 rounded-2xl border border-slate-200 shadow-xs">
        <div className="flex items-center gap-2 text-xs font-bold text-slate-500 pl-2">
          <Filter className="w-4 h-4 text-indigo-600" />
          <span>Stage Tier:</span>
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          {[
            { id: 'all', label: 'All Labs (7)' },
            { id: 'early', label: 'Early (Ages 3–5)' },
            { id: 'elementary', label: 'Elementary (6–10)' },
            { id: 'middle', label: 'Middle (11–13)' },
            { id: 'high', label: 'High School (14–18)' }
          ].map(tf => (
            <button
              key={tf.id}
              onClick={() => {
                playClickSound();
                setTierFilter(tf.id as any);
              }}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition cursor-pointer ${
                tierFilter === tf.id
                  ? 'bg-indigo-600 text-white shadow-xs'
                  : 'bg-slate-100 hover:bg-slate-200 text-slate-700'
              }`}
            >
              {tf.label}
            </button>
          ))}
        </div>

        {onOpenGlossary && (
          <button
            onClick={() => {
              playClickSound();
              onOpenGlossary();
            }}
            className="px-3 py-1.5 rounded-xl text-xs font-bold bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 transition cursor-pointer flex items-center gap-1.5 ml-auto sm:ml-0"
            title="Open Dual-Language Math Vocabulary Glossary"
          >
            <Languages className="w-3.5 h-3.5 text-indigo-600" />
            <span>Dual Vocab (EN/ES)</span>
          </button>
        )}
      </div>

      {/* Primary Active Manipulative Tool Stage */}
      <div className="animate-in fade-in-50 duration-200">
        {activeToolId === 'ten_frame' && <TenFrameLab />}
        {activeToolId === 'subitizing' && <SubitizingLab />}
        {activeToolId === 'fraction_visualizer' && <FractionVisualizerLab />}
        {activeToolId === 'base_ten' && <BaseTenBlocksLab />}
        {activeToolId === 'coordinate_grapher' && <CoordinateGrapherLab />}
        {activeToolId === 'unit_circle' && <UnitCircleLab />}
        {activeToolId === 'calculus_derivative' && <CalculusDerivativeLab />}
      </div>

      {/* Tool Selector Gallery Grid */}
      <div className="space-y-3 pt-4">
        <div className="flex items-center justify-between">
          <h3 className="text-base font-extrabold text-slate-900 flex items-center gap-2">
            <BookOpen className="w-4 h-4 text-indigo-600" />
            <span>Virtual Manipulative Catalog</span>
          </h3>
          <span className="text-xs font-semibold text-slate-400">
            {filteredTools.length} tools available
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3.5">
          {filteredTools.map(tool => {
            const isCurrent = tool.id === activeToolId;
            return (
              <button
                key={tool.id}
                onClick={() => {
                  playClickSound();
                  setActiveToolId(tool.id);
                  window.scrollTo({ top: 0, behavior: 'smooth' });
                }}
                className={`p-4 rounded-2xl border text-left transition-all cursor-pointer flex flex-col justify-between group ${
                  isCurrent
                    ? 'bg-indigo-50/90 border-indigo-400 ring-2 ring-indigo-500/20 shadow-sm'
                    : 'bg-white border-slate-200 hover:border-indigo-300 hover:bg-slate-50 shadow-xs'
                }`}
              >
                <div>
                  <div className="flex items-center justify-between gap-2 mb-2.5">
                    <div className="w-9 h-9 rounded-xl bg-white border border-slate-200 flex items-center justify-center shadow-2xs group-hover:scale-105 transition-transform">
                      {getToolIcon(tool.id)}
                    </div>
                    <span className="px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 text-[10px] font-extrabold">
                      {tool.ageRange}
                    </span>
                  </div>

                  <h4 className="text-sm font-extrabold text-slate-900 group-hover:text-indigo-600 transition-colors">
                    {tool.title}
                  </h4>
                  <p className="text-[11px] text-slate-500 font-medium line-clamp-2 mt-1">
                    {tool.subtitle}
                  </p>
                </div>

                <div className="mt-4 pt-2.5 border-t border-slate-100 flex flex-wrap gap-1">
                  {tool.concepts.slice(0, 2).map((c, idx) => (
                    <span
                      key={idx}
                      className="text-[9px] font-bold px-1.5 py-0.5 rounded-md bg-slate-100 text-slate-600"
                    >
                      {c}
                    </span>
                  ))}
                </div>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
};
