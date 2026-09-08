import React, { useState } from 'react';
import { playClickSound, playSuccessSound, speakText } from '../../utils/audio';
import {
  PieChart,
  Layers,
  Sparkles,
  RotateCcw,
  CheckCircle2,
  ArrowRightLeft,
  Volume2,
  Plus,
  Minus,
  Equal
} from 'lucide-react';

/* ==========================================================================
   1. FRACTION PIZZA & STRIP VISUALIZER LAB (Ages 6–10)
   ========================================================================== */

export const FractionVisualizerLab: React.FC = () => {
  const [modelType, setModelType] = useState<'circle' | 'strip'>('circle');
  
  // Fraction 1
  const [num1, setNum1] = useState<number>(3);
  const [den1, setDen1] = useState<number>(4);

  // Fraction 2 (for comparison)
  const [compareMode, setCompareMode] = useState<boolean>(true);
  const [num2, setNum2] = useState<number>(6);
  const [den2, setDen2] = useState<number>(8);

  const val1 = den1 > 0 ? num1 / den1 : 0;
  const val2 = den2 > 0 ? num2 / den2 : 0;
  const isEquivalent = Math.abs(val1 - val2) < 0.0001;

  // Render SVG Circle Slices
  const renderCircleSlices = (num: number, den: number, color: string, radius = 70) => {
    const slices = [];
    const center = 85;
    const anglePerSlice = 360 / den;

    for (let i = 0; i < den; i++) {
      const isFilled = i < num;
      const startAngle = (i * anglePerSlice - 90) * (Math.PI / 180);
      const endAngle = ((i + 1) * anglePerSlice - 90) * (Math.PI / 180);

      const x1 = center + radius * Math.cos(startAngle);
      const y1 = center + radius * Math.sin(startAngle);
      const x2 = center + radius * Math.cos(endAngle);
      const y2 = center + radius * Math.sin(endAngle);

      const largeArcFlag = anglePerSlice > 180 ? 1 : 0;
      const pathData = `M ${center} ${center} L ${x1} ${y1} A ${radius} ${radius} 0 ${largeArcFlag} 1 ${x2} ${y2} Z`;

      slices.push(
        <path
          key={i}
          d={pathData}
          fill={isFilled ? color : '#f8fafc'}
          stroke="#cbd5e1"
          strokeWidth="1.5"
          className="transition-colors duration-200 cursor-pointer hover:opacity-80"
          onClick={() => {
            playClickSound();
            // Toggle slice count
            if (num === i + 1) setNum1(i);
            else setNum1(i + 1);
          }}
        />
      );
    }
    return (
      <svg width="170" height="170" className="drop-shadow-xs">
        {slices}
        <circle cx={center} cy={center} r="3" fill="#64748b" />
      </svg>
    );
  };

  // Render Rectangular Strip
  const renderStrip = (num: number, den: number, color: string) => {
    return (
      <div className="w-full h-12 bg-slate-100 rounded-xl border border-slate-300 flex overflow-hidden shadow-inner">
        {Array.from({ length: den }).map((_, i) => (
          <div
            key={i}
            onClick={() => {
              playClickSound();
              setNum1(i + 1);
            }}
            className={`flex-1 border-r border-slate-300 last:border-r-0 flex items-center justify-center font-bold text-xs transition-colors cursor-pointer ${
              i < num ? color + ' text-white font-extrabold' : 'bg-slate-50 text-slate-400 hover:bg-slate-200/60'
            }`}
          >
            1/{den}
          </div>
        ))}
      </div>
    );
  };

  return (
    <div className="bg-white rounded-3xl p-5 sm:p-7 border border-slate-200 shadow-sm space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-100 pb-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="px-2.5 py-1 rounded-full bg-indigo-100 text-indigo-800 text-xs font-bold">
              Ages 6–10
            </span>
            <span className="text-xs text-slate-500 font-semibold">Fractions & Proportional Reasoning</span>
          </div>
          <h3 className="text-xl font-extrabold text-slate-900 mt-1">Fraction Pizza & Strip Visualizer</h3>
          <p className="text-xs text-slate-500">
            Compare fractions visually, discover equivalent fractions, and connect fractions to decimals & percentages.
          </p>
        </div>

        <div className="flex items-center gap-2">
          {/* Model toggle */}
          <div className="flex items-center bg-slate-100 p-1 rounded-xl border border-slate-200">
            <button
              onClick={() => { playClickSound(); setModelType('circle'); }}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer flex items-center gap-1.5 ${
                modelType === 'circle' ? 'bg-white shadow-xs text-indigo-700' : 'text-slate-500'
              }`}
            >
              <PieChart className="w-3.5 h-3.5" />
              <span>Circle / Pizza</span>
            </button>
            <button
              onClick={() => { playClickSound(); setModelType('strip'); }}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer flex items-center gap-1.5 ${
                modelType === 'strip' ? 'bg-white shadow-xs text-indigo-700' : 'text-slate-500'
              }`}
            >
              <Layers className="w-3.5 h-3.5" />
              <span>Fraction Strip</span>
            </button>
          </div>

          <button
            onClick={() => {
              playClickSound();
              setCompareMode(prev => !prev);
            }}
            className={`px-3 py-1.5 rounded-xl border text-xs font-bold transition cursor-pointer flex items-center gap-1.5 ${
              compareMode
                ? 'bg-indigo-50 border-indigo-300 text-indigo-700'
                : 'bg-white border-slate-200 text-slate-600'
            }`}
          >
            <ArrowRightLeft className="w-3.5 h-3.5" />
            <span>{compareMode ? 'Dual Compare' : 'Single Fraction'}</span>
          </button>
        </div>
      </div>

      {/* Equivalence Notification Banner */}
      {compareMode && (
        <div className={`p-3.5 rounded-2xl border flex items-center justify-between gap-3 text-xs font-bold transition-all ${
          isEquivalent
            ? 'bg-emerald-50 border-emerald-300 text-emerald-900'
            : 'bg-slate-50 border-slate-200 text-slate-700'
        }`}>
          <div className="flex items-center gap-2">
            {isEquivalent ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            ) : (
              <Sparkles className="w-4 h-4 text-indigo-500 shrink-0" />
            )}
            <span>
              {isEquivalent ? (
                <>
                  <span className="font-extrabold text-emerald-800">Equivalent Fractions Match!</span> {num1}/{den1} equals {num2}/{den2} ({Math.round(val1 * 100)}%)
                </>
              ) : val1 > val2 ? (
                `${num1}/${den1} (${Math.round(val1 * 100)}%) is GREATER than ${num2}/${den2} (${Math.round(val2 * 100)}%)`
              ) : (
                `${num1}/${den1} (${Math.round(val1 * 100)}%) is LESS than ${num2}/${den2} (${Math.round(val2 * 100)}%)`
              )}
            </span>
          </div>

          <button
            onClick={() => {
              playClickSound();
              speakText(
                isEquivalent
                  ? `${num1} over ${den1} is equal to ${num2} over ${den2}!`
                  : `${num1} over ${den1} is ${val1 > val2 ? 'greater' : 'less'} than ${num2} over ${den2}`
              );
            }}
            className="p-1.5 rounded-lg bg-white hover:bg-slate-100 text-slate-600 border border-slate-200"
            title="Listen to fraction comparison"
          >
            <Volume2 className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Visual Canvas Area */}
      <div className={`grid gap-6 ${compareMode ? 'grid-cols-1 md:grid-cols-2' : 'grid-cols-1'}`}>
        {/* Fraction A Card */}
        <div className="p-5 rounded-3xl bg-slate-50 border border-slate-200 flex flex-col items-center space-y-4">
          <div className="flex items-center justify-between w-full border-b border-slate-200 pb-2">
            <span className="text-xs font-extrabold text-indigo-700 uppercase tracking-wider">
              {compareMode ? 'Fraction A (Indigo)' : 'Active Fraction'}
            </span>
            <div className="text-sm font-extrabold text-slate-900">
              = {(val1).toFixed(2)} ({Math.round(val1 * 100)}%)
            </div>
          </div>

          {/* Graphical Representation */}
          <div className="py-2 flex items-center justify-center w-full">
            {modelType === 'circle'
              ? renderCircleSlices(num1, den1, '#4f46e5')
              : renderStrip(num1, den1, 'bg-indigo-600')}
          </div>

          {/* Stepper Controls */}
          <div className="w-full space-y-2 pt-2">
            {/* Numerator */}
            <div className="flex items-center justify-between bg-white p-2.5 rounded-2xl border border-slate-200">
              <span className="text-xs font-bold text-slate-500">Numerator (Parts):</span>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => { playClickSound(); setNum1(p => Math.max(0, p - 1)); }}
                  className="w-7 h-7 rounded-lg bg-slate-100 hover:bg-slate-200 flex items-center justify-center text-slate-700 cursor-pointer"
                >
                  <Minus className="w-3.5 h-3.5" />
                </button>
                <span className="font-extrabold text-sm w-6 text-center text-indigo-700">{num1}</span>
                <button
                  onClick={() => { playClickSound(); setNum1(p => Math.min(den1, p + 1)); }}
                  className="w-7 h-7 rounded-lg bg-slate-100 hover:bg-slate-200 flex items-center justify-center text-slate-700 cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>

            {/* Denominator */}
            <div className="flex items-center justify-between bg-white p-2.5 rounded-2xl border border-slate-200">
              <span className="text-xs font-bold text-slate-500">Denominator (Total):</span>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => {
                    playClickSound();
                    const newDen = Math.max(1, den1 - 1);
                    setDen1(newDen);
                    if (num1 > newDen) setNum1(newDen);
                  }}
                  className="w-7 h-7 rounded-lg bg-slate-100 hover:bg-slate-200 flex items-center justify-center text-slate-700 cursor-pointer"
                >
                  <Minus className="w-3.5 h-3.5" />
                </button>
                <span className="font-extrabold text-sm w-6 text-center text-slate-900">{den1}</span>
                <button
                  onClick={() => { playClickSound(); setDen1(p => Math.min(12, p + 1)); }}
                  className="w-7 h-7 rounded-lg bg-slate-100 hover:bg-slate-200 flex items-center justify-center text-slate-700 cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Fraction B Card (Compare Mode) */}
        {compareMode && (
          <div className="p-5 rounded-3xl bg-slate-50 border border-slate-200 flex flex-col items-center space-y-4">
            <div className="flex items-center justify-between w-full border-b border-slate-200 pb-2">
              <span className="text-xs font-extrabold text-rose-600 uppercase tracking-wider">
                Fraction B (Rose)
              </span>
              <div className="text-sm font-extrabold text-slate-900">
                = {(val2).toFixed(2)} ({Math.round(val2 * 100)}%)
              </div>
            </div>

            {/* Graphical Representation */}
            <div className="py-2 flex items-center justify-center w-full">
              {modelType === 'circle'
                ? renderCircleSlices(num2, den2, '#e11d48')
                : renderStrip(num2, den2, 'bg-rose-600')}
            </div>

            {/* Stepper Controls */}
            <div className="w-full space-y-2 pt-2">
              {/* Numerator */}
              <div className="flex items-center justify-between bg-white p-2.5 rounded-2xl border border-slate-200">
                <span className="text-xs font-bold text-slate-500">Numerator (Parts):</span>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => { playClickSound(); setNum2(p => Math.max(0, p - 1)); }}
                    className="w-7 h-7 rounded-lg bg-slate-100 hover:bg-slate-200 flex items-center justify-center text-slate-700 cursor-pointer"
                  >
                    <Minus className="w-3.5 h-3.5" />
                  </button>
                  <span className="font-extrabold text-sm w-6 text-center text-rose-600">{num2}</span>
                  <button
                    onClick={() => { playClickSound(); setNum2(p => Math.min(den2, p + 1)); }}
                    className="w-7 h-7 rounded-lg bg-slate-100 hover:bg-slate-200 flex items-center justify-center text-slate-700 cursor-pointer"
                  >
                    <Plus className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>

              {/* Denominator */}
              <div className="flex items-center justify-between bg-white p-2.5 rounded-2xl border border-slate-200">
                <span className="text-xs font-bold text-slate-500">Denominator (Total):</span>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => {
                      playClickSound();
                      const newDen = Math.max(1, den2 - 1);
                      setDen2(newDen);
                      if (num2 > newDen) setNum2(newDen);
                    }}
                    className="w-7 h-7 rounded-lg bg-slate-100 hover:bg-slate-200 flex items-center justify-center text-slate-700 cursor-pointer"
                  >
                    <Minus className="w-3.5 h-3.5" />
                  </button>
                  <span className="font-extrabold text-sm w-6 text-center text-slate-900">{den2}</span>
                  <button
                    onClick={() => { playClickSound(); setDen2(p => Math.min(12, p + 1)); }}
                    className="w-7 h-7 rounded-lg bg-slate-100 hover:bg-slate-200 flex items-center justify-center text-slate-700 cursor-pointer"
                  >
                    <Plus className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Quick Benchmark Presets */}
      <div className="pt-2 flex flex-wrap items-center gap-2">
        <span className="text-xs font-bold text-slate-400">Benchmark Presets:</span>
        {[
          { label: '1/2 == 2/4', n1: 1, d1: 2, n2: 2, d2: 4 },
          { label: '2/3 == 4/6', n1: 2, d1: 3, n2: 4, d2: 6 },
          { label: '3/4 == 6/8', n1: 3, d1: 4, n2: 6, d2: 8 },
          { label: '1/4 vs 1/3', n1: 1, d1: 4, n2: 1, d2: 3 }
        ].map(p => (
          <button
            key={p.label}
            onClick={() => {
              playClickSound();
              setNum1(p.n1);
              setDen1(p.d1);
              setNum2(p.n2);
              setDen2(p.d2);
              setCompareMode(true);
            }}
            className="px-2.5 py-1.5 rounded-xl bg-slate-100 hover:bg-indigo-50 hover:text-indigo-700 hover:border-indigo-300 text-slate-700 text-xs font-bold border border-slate-200 transition cursor-pointer"
          >
            {p.label}
          </button>
        ))}
      </div>
    </div>
  );
};

/* ==========================================================================
   2. BASE-10 PLACE VALUE BLOCKS LAB (Ages 6–10)
   ========================================================================== */

export const BaseTenBlocksLab: React.FC = () => {
  const [thousands, setThousands] = useState<number>(0);
  const [hundreds, setHundreds] = useState<number>(3);
  const [tens, setTens] = useState<number>(4);
  const [ones, setOnes] = useState<number>(7);

  const totalValue = thousands * 1000 + hundreds * 100 + tens * 10 + ones;

  // Regroup / Trade up: 10 ones -> 1 ten
  const handleRegroupOnes = () => {
    if (ones >= 10) {
      playSuccessSound();
      setOnes(p => p - 10);
      setTens(p => p + 1);
    }
  };

  // Regroup / Trade up: 10 tens -> 1 hundred
  const handleRegroupTens = () => {
    if (tens >= 10) {
      playSuccessSound();
      setTens(p => p - 10);
      setHundreds(p => p + 1);
    }
  };

  // Unbundle: 1 ten -> 10 ones
  const handleUnbundleTen = () => {
    if (tens > 0) {
      playClickSound();
      setTens(p => p - 1);
      setOnes(p => p + 10);
    }
  };

  // Unbundle: 1 hundred -> 10 tens
  const handleUnbundleHundred = () => {
    if (hundreds > 0) {
      playClickSound();
      setHundreds(p => p - 1);
      setTens(p => p + 10);
    }
  };

  const handleClear = () => {
    playClickSound();
    setThousands(0);
    setHundreds(0);
    setTens(0);
    setOnes(0);
  };

  return (
    <div className="bg-white rounded-3xl p-5 sm:p-7 border border-slate-200 shadow-sm space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-100 pb-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="px-2.5 py-1 rounded-full bg-indigo-100 text-indigo-800 text-xs font-bold">
              Ages 6–10
            </span>
            <span className="text-xs text-slate-500 font-semibold">Place Value & Regrouping</span>
          </div>
          <h3 className="text-xl font-extrabold text-slate-900 mt-1">Base-10 Blocks Lab</h3>
          <p className="text-xs text-slate-500">
            Build numbers using Units, Rods, Flats, and Cubes. Practice regrouping and unbundling.
          </p>
        </div>

        <button
          onClick={() => {
            playClickSound();
            speakText(`The number is ${totalValue}. That is ${hundreds} hundreds, ${tens} tens, and ${ones} ones!`);
          }}
          className="p-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 transition cursor-pointer flex items-center gap-2 text-xs font-bold"
        >
          <Volume2 className="w-4 h-4 text-indigo-600" />
          <span>Speak Number</span>
        </button>
      </div>

      {/* Value Summary Display */}
      <div className="p-4 sm:p-5 rounded-2xl bg-indigo-950 text-white flex flex-wrap items-center justify-between gap-4 shadow-sm">
        <div>
          <span className="text-[11px] font-bold text-indigo-300 uppercase tracking-wider">Standard Form</span>
          <div className="text-3xl sm:text-4xl font-black text-amber-300 mt-0.5">
            {totalValue.toLocaleString()}
          </div>
        </div>

        <div className="space-y-1 text-right">
          <span className="text-[11px] font-bold text-indigo-300 uppercase tracking-wider block">Expanded Form</span>
          <div className="text-sm sm:text-base font-extrabold text-indigo-100">
            {thousands > 0 && `${thousands * 1000} + `}
            {hundreds * 100} + {tens * 10} + {ones}
          </div>
        </div>
      </div>

      {/* Regroup Notice */}
      {(ones >= 10 || tens >= 10) && (
        <div className="p-3.5 rounded-2xl bg-amber-50 border border-amber-300 text-amber-900 text-xs font-bold flex flex-wrap items-center justify-between gap-2">
          <span>⚠️ You have 10 or more blocks in a column! Trade them up for easier counting.</span>
          <div className="flex items-center gap-2">
            {ones >= 10 && (
              <button
                onClick={handleRegroupOnes}
                className="px-3 py-1.5 rounded-xl bg-amber-500 hover:bg-amber-600 text-white font-extrabold cursor-pointer"
              >
                Trade 10 Units ➔ 1 Rod
              </button>
            )}
            {tens >= 10 && (
              <button
                onClick={handleRegroupTens}
                className="px-3 py-1.5 rounded-xl bg-amber-500 hover:bg-amber-600 text-white font-extrabold cursor-pointer"
              >
                Trade 10 Rods ➔ 1 Flat
              </button>
            )}
          </div>
        </div>
      )}

      {/* Base-10 Columns Playmat */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {/* Hundreds (Flats) */}
        <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between border-b border-slate-200 pb-2 mb-3">
              <span className="text-xs font-extrabold text-indigo-700">Hundreds (Flats)</span>
              <span className="text-xs font-bold text-slate-400">× 100</span>
            </div>

            {/* Blocks render */}
            <div className="min-h-[100px] flex flex-wrap gap-2 items-center justify-center p-2 bg-white rounded-xl border border-slate-200 shadow-inner">
              {hundreds === 0 ? (
                <span className="text-xs text-slate-300 italic">No flats</span>
              ) : (
                Array.from({ length: hundreds }).map((_, i) => (
                  <div
                    key={i}
                    className="w-12 h-12 bg-indigo-500/90 border-2 border-indigo-700 rounded-md grid grid-cols-5 grid-rows-5 gap-0.5 p-0.5 shadow-xs"
                    title="1 Flat = 100 Units"
                  >
                    {Array.from({ length: 25 }).map((_, sq) => (
                      <div key={sq} className="bg-indigo-300/60 rounded-[1px]" />
                    ))}
                  </div>
                ))
              )}
            </div>
          </div>

          <div className="mt-4 flex items-center justify-between pt-2 border-t border-slate-200">
            <div className="flex items-center gap-1.5">
              <button
                onClick={() => { playClickSound(); setHundreds(p => Math.max(0, p - 1)); }}
                className="w-8 h-8 rounded-lg bg-white border border-slate-200 hover:bg-slate-100 flex items-center justify-center text-slate-700 font-bold"
              >
                -
              </button>
              <span className="font-extrabold text-base w-7 text-center">{hundreds}</span>
              <button
                onClick={() => { playClickSound(); setHundreds(p => Math.min(9, p + 1)); }}
                className="w-8 h-8 rounded-lg bg-white border border-slate-200 hover:bg-slate-100 flex items-center justify-center text-slate-700 font-bold"
              >
                +
              </button>
            </div>
            {hundreds > 0 && (
              <button
                onClick={handleUnbundleHundred}
                className="text-[10px] font-bold text-indigo-600 hover:underline cursor-pointer"
                title="Break 1 flat into 10 rods"
              >
                Break ➔ 10 Rods
              </button>
            )}
          </div>
        </div>

        {/* Tens (Rods) */}
        <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between border-b border-slate-200 pb-2 mb-3">
              <span className="text-xs font-extrabold text-emerald-700">Tens (Rods)</span>
              <span className="text-xs font-bold text-slate-400">× 10</span>
            </div>

            {/* Blocks render */}
            <div className="min-h-[100px] flex flex-wrap gap-2 items-center justify-center p-2 bg-white rounded-xl border border-slate-200 shadow-inner">
              {tens === 0 ? (
                <span className="text-xs text-slate-300 italic">No rods</span>
              ) : (
                Array.from({ length: tens }).map((_, i) => (
                  <div
                    key={i}
                    className="w-3.5 h-16 bg-emerald-500 border-2 border-emerald-700 rounded flex flex-col justify-between p-0.5 shadow-xs"
                    title="1 Rod = 10 Units"
                  >
                    {Array.from({ length: 8 }).map((_, sq) => (
                      <div key={sq} className="h-1 bg-emerald-300 rounded-[1px]" />
                    ))}
                  </div>
                ))
              )}
            </div>
          </div>

          <div className="mt-4 flex items-center justify-between pt-2 border-t border-slate-200">
            <div className="flex items-center gap-1.5">
              <button
                onClick={() => { playClickSound(); setTens(p => Math.max(0, p - 1)); }}
                className="w-8 h-8 rounded-lg bg-white border border-slate-200 hover:bg-slate-100 flex items-center justify-center text-slate-700 font-bold"
              >
                -
              </button>
              <span className="font-extrabold text-base w-7 text-center">{tens}</span>
              <button
                onClick={() => { playClickSound(); setTens(p => p + 1); }}
                className="w-8 h-8 rounded-lg bg-white border border-slate-200 hover:bg-slate-100 flex items-center justify-center text-slate-700 font-bold"
              >
                +
              </button>
            </div>
            {tens > 0 && (
              <button
                onClick={handleUnbundleTen}
                className="text-[10px] font-bold text-emerald-600 hover:underline cursor-pointer"
                title="Break 1 rod into 10 ones"
              >
                Break ➔ 10 Units
              </button>
            )}
          </div>
        </div>

        {/* Ones (Units) */}
        <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between border-b border-slate-200 pb-2 mb-3">
              <span className="text-xs font-extrabold text-amber-700">Ones (Units)</span>
              <span className="text-xs font-bold text-slate-400">× 1</span>
            </div>

            {/* Blocks render */}
            <div className="min-h-[100px] flex flex-wrap gap-1.5 items-center justify-center p-2 bg-white rounded-xl border border-slate-200 shadow-inner">
              {ones === 0 ? (
                <span className="text-xs text-slate-300 italic">No units</span>
              ) : (
                Array.from({ length: ones }).map((_, i) => (
                  <div
                    key={i}
                    className="w-3.5 h-3.5 bg-amber-400 border border-amber-600 rounded-xs shadow-2xs"
                    title="1 Unit"
                  />
                ))
              )}
            </div>
          </div>

          <div className="mt-4 flex items-center justify-between pt-2 border-t border-slate-200">
            <div className="flex items-center gap-1.5">
              <button
                onClick={() => { playClickSound(); setOnes(p => Math.max(0, p - 1)); }}
                className="w-8 h-8 rounded-lg bg-white border border-slate-200 hover:bg-slate-100 flex items-center justify-center text-slate-700 font-bold"
              >
                -
              </button>
              <span className="font-extrabold text-base w-7 text-center">{ones}</span>
              <button
                onClick={() => { playClickSound(); setOnes(p => p + 1); }}
                className="w-8 h-8 rounded-lg bg-white border border-slate-200 hover:bg-slate-100 flex items-center justify-center text-slate-700 font-bold"
              >
                +
              </button>
            </div>
            {ones >= 10 && (
              <button
                onClick={handleRegroupOnes}
                className="text-[10px] font-bold text-amber-600 hover:underline cursor-pointer"
              >
                Regroup 10
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Preset Numbers & Reset */}
      <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-bold text-slate-400">Try Sample Numbers:</span>
          {[
            { label: '245', h: 2, t: 4, o: 5 },
            { label: '408', h: 4, t: 0, o: 8 },
            { label: '12', h: 0, t: 1, o: 2 },
            { label: '350', h: 3, t: 5, o: 0 }
          ].map(s => (
            <button
              key={s.label}
              onClick={() => {
                playClickSound();
                setHundreds(s.h);
                setTens(s.t);
                setOnes(s.o);
              }}
              className="px-2.5 py-1.5 rounded-xl bg-slate-100 hover:bg-indigo-100 hover:text-indigo-700 text-slate-700 text-xs font-bold border border-slate-200 cursor-pointer"
            >
              {s.label}
            </button>
          ))}
        </div>

        <button
          onClick={handleClear}
          className="px-3 py-1.5 rounded-xl border border-slate-300 hover:bg-slate-100 text-slate-600 text-xs font-bold flex items-center gap-1.5 cursor-pointer"
        >
          <RotateCcw className="w-3.5 h-3.5" />
          <span>Reset Mat</span>
        </button>
      </div>
    </div>
  );
};
