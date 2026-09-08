import React, { useState } from 'react';
import { MathProblem } from '../types';
import { playClickSound } from '../utils/audio';

interface ManipulativesProps {
  problem: MathProblem;
  onManipulativeAction?: (action: string) => void;
}

export const MathManipulatives: React.FC<ManipulativesProps> = ({ problem, onManipulativeAction }) => {
  const { visualType, visualData } = problem;

  // 1. COUNTERS STATE (Ages 3-6)
  const initialCount = visualData?.initialCount || 3;
  const [tappedIndices, setTappedIndices] = useState<number[]>([]);
  const [extraItems, setExtraItems] = useState<number>(0);

  // 2. FRACTION BAR STATE (Ages 7-10)
  const [fractionDenom, setFractionDenom] = useState<number>(visualData?.fractions?.denominator || 4);
  const [shadedSegments, setShadedSegments] = useState<number[]>(
    Array.from({ length: visualData?.fractions?.numerator || 3 }, (_, i) => i)
  );

  // 3. COORDINATE PLANE STATE (Ages 11-14)
  const [slope, setSlope] = useState<number>(visualData?.slope ?? 2);
  const [intercept, setIntercept] = useState<number>(visualData?.intercept ?? 1);

  // 4. CALCULUS TANGENT STATE (Ages 15-18)
  const [tangentX, setTangentX] = useState<number>(3);

  // 5. SHAPE EXPLORER
  const [highlightedVertex, setHighlightedVertex] = useState<number | null>(null);

  // Handle tap on item counter
  const toggleItemTap = (index: number) => {
    playClickSound();
    if (tappedIndices.includes(index)) {
      setTappedIndices(prev => prev.filter(i => i !== index));
    } else {
      setTappedIndices(prev => [...prev, index]);
      if (onManipulativeAction) onManipulativeAction(`tapped_counter_${index}`);
    }
  };

  // Toggle fraction segment
  const toggleSegment = (idx: number) => {
    playClickSound();
    if (shadedSegments.includes(idx)) {
      setShadedSegments(prev => prev.filter(i => i !== idx));
    } else {
      setShadedSegments(prev => [...prev, idx]);
    }
  };

  // Render based on visualType
  if (visualType === 'counters') {
    const totalCount = initialCount + extraItems;
    const itemSymbol = visualData?.itemType === 'star' ? '⭐' : visualData?.itemType === 'cookie' ? '🍪' : '🍎';

    return (
      <div className="w-full bg-amber-50/80 rounded-2xl p-4 sm:p-6 border border-amber-200/80 shadow-inner flex flex-col items-center">
        <div className="flex items-center justify-between w-full mb-3">
          <div className="flex items-center gap-2">
            <span className="text-xs uppercase font-bold text-amber-900 tracking-wider">
              Interactive Touch Counters
            </span>
            <span className="text-xs bg-amber-200 text-amber-900 font-semibold px-2 py-0.5 rounded-full">
              Counted: {tappedIndices.length} of {totalCount}
            </span>
          </div>
          <button
            onClick={() => {
              playClickSound();
              setExtraItems(prev => (prev < 4 ? prev + 1 : 0));
            }}
            className="text-xs bg-white hover:bg-amber-100 text-amber-900 font-bold px-3 py-1 rounded-lg border border-amber-300 shadow-sm transition"
          >
            + Add Object
          </button>
        </div>

        {/* Counter items row / grid */}
        <div className="flex flex-wrap items-center justify-center gap-3 sm:gap-4 my-2 min-h-[90px] w-full max-w-md bg-white/70 p-4 rounded-xl border border-dashed border-amber-300">
          {Array.from({ length: totalCount }).map((_, idx) => {
            const isTapped = tappedIndices.includes(idx);
            return (
              <button
                key={idx}
                onClick={() => toggleItemTap(idx)}
                className={`relative w-14 h-14 sm:w-16 sm:h-16 rounded-2xl flex flex-col items-center justify-center text-3xl sm:text-4xl transition-all duration-200 cursor-pointer shadow-sm select-none ${
                  isTapped
                    ? 'bg-emerald-100 ring-4 ring-emerald-400 scale-105 shadow-md -translate-y-1'
                    : 'bg-white hover:bg-amber-100/50 hover:scale-105'
                }`}
                title={`Item ${idx + 1}`}
              >
                <span>{itemSymbol}</span>
                <span
                  className={`absolute -bottom-1 -right-1 text-[11px] font-extrabold w-5 h-5 rounded-full flex items-center justify-center text-white ${
                    isTapped ? 'bg-emerald-600' : 'bg-slate-400'
                  }`}
                >
                  {idx + 1}
                </span>
              </button>
            );
          })}
        </div>

        <p className="text-xs text-amber-800 font-medium mt-2 text-center">
          Tap each {visualData?.itemType || 'apple'} to count out loud! Watch the counter badge update.
        </p>
      </div>
    );
  }

  if (visualType === 'shapes') {
    const shape = visualData?.shapeType || 'triangle';
    return (
      <div className="w-full bg-teal-50/80 rounded-2xl p-4 sm:p-6 border border-teal-200/80 shadow-inner flex flex-col items-center">
        <div className="flex items-center justify-between w-full mb-2">
          <span className="text-xs uppercase font-bold text-teal-900 tracking-wider">
            Geometric Shape Sandbox
          </span>
          <span className="text-xs bg-teal-200 text-teal-900 font-semibold px-2.5 py-0.5 rounded-full capitalize">
            {shape}
          </span>
        </div>

        <div className="relative w-48 h-48 sm:w-56 sm:h-56 flex items-center justify-center my-2">
          <svg viewBox="0 0 200 200" className="w-full h-full drop-shadow-md">
            {shape === 'triangle' && (
              <>
                <polygon
                  points="100,25 180,165 20,165"
                  className="fill-teal-200 stroke-teal-600 stroke-[4] transition-all hover:fill-teal-300"
                />
                {/* Vertices */}
                {[
                  { cx: 100, cy: 25, label: '1' },
                  { cx: 180, cy: 165, label: '2' },
                  { cx: 20, cy: 165, label: '3' }
                ].map((v, i) => (
                  <g
                    key={i}
                    onClick={() => {
                      playClickSound();
                      setHighlightedVertex(i);
                    }}
                    className="cursor-pointer"
                  >
                    <circle
                      cx={v.cx}
                      cy={v.cy}
                      r={highlightedVertex === i ? 12 : 9}
                      className={`${
                        highlightedVertex === i ? 'fill-amber-400 stroke-amber-700 stroke-2' : 'fill-teal-600'
                      } transition-all`}
                    />
                    <text
                      x={v.cx}
                      y={v.cy + 4}
                      textAnchor="middle"
                      className="fill-white text-[10px] font-extrabold select-none pointer-events-none"
                    >
                      {v.label}
                    </text>
                  </g>
                ))}
              </>
            )}

            {shape === 'square' && (
              <>
                <rect
                  x="35"
                  y="35"
                  width="130"
                  height="130"
                  rx="4"
                  className="fill-teal-200 stroke-teal-600 stroke-[4] hover:fill-teal-300 transition-all"
                />
                {[
                  { cx: 35, cy: 35, label: '1' },
                  { cx: 165, cy: 35, label: '2' },
                  { cx: 165, cy: 165, label: '3' },
                  { cx: 35, cy: 165, label: '4' }
                ].map((v, i) => (
                  <g
                    key={i}
                    onClick={() => {
                      playClickSound();
                      setHighlightedVertex(i);
                    }}
                    className="cursor-pointer"
                  >
                    <circle
                      cx={v.cx}
                      cy={v.cy}
                      r={highlightedVertex === i ? 12 : 9}
                      className={`${
                        highlightedVertex === i ? 'fill-amber-400 stroke-amber-700 stroke-2' : 'fill-teal-600'
                      } transition-all`}
                    />
                    <text
                      x={v.cx}
                      y={v.cy + 4}
                      textAnchor="middle"
                      className="fill-white text-[10px] font-extrabold select-none pointer-events-none"
                    >
                      {v.label}
                    </text>
                  </g>
                ))}
              </>
            )}
          </svg>
        </div>

        <p className="text-xs text-teal-800 font-medium text-center">
          Tap the numbered corner vertices to verify how many corners and sides this {shape} contains!
        </p>
      </div>
    );
  }

  if (visualType === 'fraction_bar') {
    const numerator = shadedSegments.length;
    const decimalVal = (numerator / fractionDenom).toFixed(2);
    const percentVal = Math.round((numerator / fractionDenom) * 100);

    return (
      <div className="w-full bg-sky-50/80 rounded-2xl p-4 sm:p-6 border border-sky-200/80 shadow-inner flex flex-col items-center">
        <div className="flex items-center justify-between w-full mb-3">
          <span className="text-xs uppercase font-bold text-sky-900 tracking-wider">
            Interactive Fraction Manipulative
          </span>
          <div className="flex items-center gap-2">
            <span className="text-xs font-mono font-bold bg-sky-200 text-sky-900 px-2 py-0.5 rounded-full">
              {numerator} / {fractionDenom} = {decimalVal} ({percentVal}%)
            </span>
          </div>
        </div>

        {/* Dynamic Fraction Bar */}
        <div className="w-full max-w-md bg-white p-2.5 rounded-xl border border-sky-300 shadow-sm my-2">
          <div className="flex w-full h-14 rounded-lg overflow-hidden border-2 border-sky-500 bg-slate-100">
            {Array.from({ length: fractionDenom }).map((_, idx) => {
              const isShaded = shadedSegments.includes(idx);
              return (
                <button
                  key={idx}
                  onClick={() => toggleSegment(idx)}
                  className={`flex-1 border-r last:border-r-0 border-sky-400 font-mono text-sm font-bold flex flex-col items-center justify-center transition-colors cursor-pointer select-none ${
                    isShaded
                      ? 'bg-sky-500 text-white hover:bg-sky-600'
                      : 'bg-white text-slate-400 hover:bg-sky-100/50'
                  }`}
                  title={`Piece ${idx + 1} of ${fractionDenom}`}
                >
                  <span>1/{fractionDenom}</span>
                  <span className="text-[10px] font-normal opacity-80">{isShaded ? 'Shaded' : 'Empty'}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Denominator adjuster controls */}
        <div className="flex items-center gap-3 mt-3">
          <span className="text-xs font-semibold text-slate-700">Total Slices (Denominator):</span>
          {[2, 3, 4, 6, 8].map(d => (
            <button
              key={d}
              onClick={() => {
                playClickSound();
                setFractionDenom(d);
                setShadedSegments(prev => prev.filter(idx => idx < d));
              }}
              className={`px-2.5 py-1 rounded-lg text-xs font-bold transition ${
                fractionDenom === d
                  ? 'bg-sky-600 text-white shadow-sm'
                  : 'bg-white text-slate-700 border border-slate-200 hover:bg-slate-100'
              }`}
            >
              {d}
            </button>
          ))}
        </div>

        <p className="text-xs text-sky-800 font-medium mt-3 text-center">
          Click individual segments to toggle shaded vs unshaded parts.
        </p>
      </div>
    );
  }

  if (visualType === 'coordinate_plane') {
    // Interactive Cartesian grapher
    const width = 300;
    const height = 240;
    const originX = width / 2;
    const originY = height / 2;
    const scale = 20; // 20px per 1 unit

    // Calculate line endpoints: for x = -5 and x = 5
    const x1 = -6;
    const y1 = slope * x1 + intercept;
    const x2 = 6;
    const y2 = slope * x2 + intercept;

    const screenX1 = originX + x1 * scale;
    const screenY1 = originY - y1 * scale;
    const screenX2 = originX + x2 * scale;
    const screenY2 = originY - y2 * scale;

    const yInterceptScreenX = originX;
    const yInterceptScreenY = originY - intercept * scale;

    return (
      <div className="w-full bg-slate-900 text-slate-100 rounded-2xl p-4 sm:p-6 border border-slate-700 shadow-xl flex flex-col items-center">
        <div className="flex items-center justify-between w-full mb-2">
          <span className="text-xs uppercase font-bold text-indigo-400 tracking-wider">
            Interactive Cartesian Grapher
          </span>
          <div className="font-mono text-xs font-bold text-emerald-400 bg-slate-800 px-3 py-1 rounded-full border border-slate-700">
            y = {slope}x {intercept >= 0 ? `+ ${intercept}` : `- ${Math.abs(intercept)}`}
          </div>
        </div>

        {/* SVG Grid */}
        <div className="relative bg-slate-950 rounded-xl border border-slate-800 p-2 my-2 overflow-hidden shadow-inner">
          <svg width={width} height={height} className="block select-none">
            {/* Grid lines */}
            {Array.from({ length: 13 }).map((_, i) => {
              const u = i - 6;
              const gx = originX + u * scale;
              const gy = originY - u * scale;
              return (
                <g key={i} className="opacity-20 stroke-slate-500">
                  <line x1={gx} y1={0} x2={gx} y2={height} strokeWidth={1} />
                  <line x1={0} y1={gy} x2={width} y2={gy} strokeWidth={1} />
                </g>
              );
            })}

            {/* X and Y Axes */}
            <line x1={0} y1={originY} x2={width} y2={originY} stroke="#94a3b8" strokeWidth={2} />
            <line x1={originX} y1={0} x2={originX} y2={height} stroke="#94a3b8" strokeWidth={2} />

            {/* Plotted Line */}
            <line
              x1={screenX1}
              y1={screenY1}
              x2={screenX2}
              y2={screenY2}
              stroke="#38bdf8"
              strokeWidth={3}
              strokeLinecap="round"
            />

            {/* Y-intercept point */}
            <circle cx={yInterceptScreenX} cy={yInterceptScreenY} r={6} fill="#f43f5e" stroke="#fff" strokeWidth={2} />
            <text
              x={yInterceptScreenX + 8}
              y={yInterceptScreenY - 6}
              fill="#fda4af"
              fontSize={11}
              fontFamily="monospace"
              fontWeight="bold"
            >
              (0, {intercept})
            </text>
          </svg>
        </div>

        {/* Real-time Sliders for slope & intercept */}
        <div className="w-full max-w-sm grid grid-cols-2 gap-3 mt-2">
          <div className="bg-slate-800/80 p-2.5 rounded-lg border border-slate-700">
            <div className="flex justify-between text-[11px] font-semibold text-slate-300 mb-1">
              <span>Slope (m):</span>
              <span className="font-mono text-sky-400">{slope}</span>
            </div>
            <input
              type="range"
              min="-4"
              max="4"
              step="1"
              value={slope}
              onChange={e => {
                setSlope(Number(e.target.value));
              }}
              className="w-full accent-sky-500 cursor-pointer"
            />
          </div>

          <div className="bg-slate-800/80 p-2.5 rounded-lg border border-slate-700">
            <div className="flex justify-between text-[11px] font-semibold text-slate-300 mb-1">
              <span>Y-Intercept (b):</span>
              <span className="font-mono text-rose-400">{intercept}</span>
            </div>
            <input
              type="range"
              min="-5"
              max="5"
              step="1"
              value={intercept}
              onChange={e => {
                setIntercept(Number(e.target.value));
              }}
              className="w-full accent-rose-500 cursor-pointer"
            />
          </div>
        </div>

        <p className="text-[11px] text-slate-400 mt-2 text-center">
          Slide the controls to observe how slope tilts the line and y-intercept shifts it vertically.
        </p>
      </div>
    );
  }

  if (visualType === 'calculus_graph') {
    // Parabola f(x) = 0.5x^2 - 2x + 1
    // Derivative f'(x) = x - 2
    const width = 300;
    const height = 220;
    const originX = width / 2;
    const originY = 170;
    const scale = 22;

    const f = (x: number) => 0.4 * x * x - 1.6 * x + 1;
    const fPrime = (x: number) => 0.8 * x - 1.6;

    const currentSlope = fPrime(tangentX);
    const currentY = f(tangentX);

    // Tangent line endpoints
    const dx = 2.5;
    const tx1 = tangentX - dx;
    const ty1 = currentY - currentSlope * dx;
    const tx2 = tangentX + dx;
    const ty2 = currentY + currentSlope * dx;

    // SVG path generator for the parabola
    const points: string[] = [];
    for (let x = -3; x <= 7; x += 0.2) {
      const sx = originX + x * scale;
      const sy = originY - f(x) * scale;
      points.push(`${sx},${sy}`);
    }
    const pathD = `M ${points.join(' L ')}`;

    return (
      <div className="w-full bg-slate-900 text-slate-100 rounded-2xl p-4 sm:p-6 border border-slate-700 shadow-xl flex flex-col items-center">
        <div className="flex items-center justify-between w-full mb-2">
          <span className="text-xs uppercase font-bold text-purple-400 tracking-wider">
            Calculus: Dynamic Tangent Simulator
          </span>
          <div className="font-mono text-xs font-bold text-emerald-400 bg-slate-800 px-3 py-1 rounded-full border border-slate-700">
            Slope f&apos;({tangentX.toFixed(1)}) = {currentSlope.toFixed(2)}
          </div>
        </div>

        <div className="relative bg-slate-950 rounded-xl border border-slate-800 p-2 my-2 shadow-inner">
          <svg width={width} height={height} className="block select-none">
            {/* Axis */}
            <line x1={0} y1={originY} x2={width} y2={originY} stroke="#475569" strokeWidth={1.5} />
            <line x1={originX} y1={0} x2={originX} y2={height} stroke="#475569" strokeWidth={1.5} />

            {/* Parabola Curve */}
            <path d={pathD} fill="none" stroke="#a855f7" strokeWidth={3} />

            {/* Tangent Line */}
            <line
              x1={originX + tx1 * scale}
              y1={originY - ty1 * scale}
              x2={originX + tx2 * scale}
              y2={originY - ty2 * scale}
              stroke="#fbbf24"
              strokeWidth={2.5}
              strokeDasharray="4 2"
            />

            {/* Point on Curve */}
            <circle
              cx={originX + tangentX * scale}
              cy={originY - currentY * scale}
              r={6}
              fill="#ec4899"
              stroke="#fff"
              strokeWidth={2}
            />
          </svg>
        </div>

        {/* Tangent Point Slider */}
        <div className="w-full max-w-xs bg-slate-800/80 p-2.5 rounded-lg border border-slate-700 mt-2">
          <div className="flex justify-between text-xs font-semibold text-slate-300 mb-1">
            <span>Evaluation Point x:</span>
            <span className="font-mono text-purple-300">{tangentX.toFixed(1)}</span>
          </div>
          <input
            type="range"
            min="-1"
            max="5"
            step="0.2"
            value={tangentX}
            onChange={e => setTangentX(Number(e.target.value))}
            className="w-full accent-purple-500 cursor-pointer"
          />
        </div>

        <p className="text-[11px] text-slate-400 mt-2 text-center">
          Notice where the tangent line turns completely flat (horizontal slope = 0) at the parabola vertex!
        </p>
      </div>
    );
  }

  // Default Equation card
  return (
    <div className="w-full bg-slate-100 rounded-2xl p-6 border border-slate-200 flex flex-col items-center justify-center my-2">
      <span className="text-xs uppercase font-bold text-slate-500 mb-2">Math Expression</span>
      <div className="font-mono-math text-2xl sm:text-3xl font-bold text-indigo-900 bg-white px-6 py-3 rounded-xl shadow-sm border border-slate-200 tracking-wider">
        {visualData?.formula || problem.question}
      </div>
    </div>
  );
};
