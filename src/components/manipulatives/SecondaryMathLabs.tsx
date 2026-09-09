import React, { useState } from 'react';
import { playClickSound, playSuccessSound, speakText } from '../../utils/audio';
import {
  Compass,
  LineChart,
  Activity,
  Sparkles,
  RotateCcw,
  Volume2,
  Sliders,
  CheckCircle2,
  HelpCircle
} from 'lucide-react';

/* ==========================================================================
   1. COORDINATE PLANE & LINEAR GRAPHER LAB (Ages 11–13)
   ========================================================================== */

export const CoordinateGrapherLab: React.FC = () => {
  // Line equation: y = mx + b
  const [slope, setSlope] = useState<number>(2); // m
  const [intercept, setIntercept] = useState<number>(1); // b

  // Interactive Point A & B on the line
  const x1 = -2;
  const y1 = slope * x1 + intercept;
  const x2 = 2;
  const y2 = slope * x2 + intercept;

  const rise = y2 - y1;
  const run = x2 - x1;

  // Grid dimensions: -8 to 8 on both axes
  const minCoord = -8;
  const maxCoord = 8;
  const scale = 20; // 20px per unit
  const center = 180; // 360 x 360 canvas center

  const toSvgX = (x: number) => center + x * scale;
  const toSvgY = (y: number) => center - y * scale;

  return (
    <div className="bg-white rounded-3xl p-5 sm:p-7 border border-slate-200 shadow-sm space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-100 pb-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="px-2.5 py-1 rounded-full bg-violet-100 text-violet-800 text-xs font-bold">
              Ages 11–13
            </span>
            <span className="text-xs text-slate-500 font-semibold">Linear Equations & Cartesian Geometry</span>
          </div>
          <h3 className="text-xl font-extrabold text-slate-900 mt-1">Coordinate Plane & Linear Grapher</h3>
          <p className="text-xs text-slate-500">
            Adjust slope ($m$) and y-intercept ($b$) to explore the slope-intercept equation $y = mx + b$.
          </p>
        </div>

        <button
          onClick={() => {
            playClickSound();
            speakText(`The line equation is y equals ${slope} x plus ${intercept}. The slope is ${slope} and y-intercept is at 0 comma ${intercept}.`);
          }}
          className="p-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 transition cursor-pointer flex items-center gap-2 text-xs font-bold"
        >
          <Volume2 className="w-4 h-4 text-indigo-600" />
          <span>Speak Equation</span>
        </button>
      </div>

      {/* Main Grapher Area */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-center">
        {/* SVG Cartesian Canvas */}
        <div className="lg:col-span-7 flex flex-col items-center">
          <div className="relative bg-slate-900 rounded-3xl p-2 border-2 border-slate-700 shadow-lg overflow-hidden select-none">
            <svg width="360" height="360" className="w-[320px] h-[320px] sm:w-[360px] sm:h-[360px]">
              {/* Minor Grid Lines */}
              {Array.from({ length: 17 }).map((_, i) => {
                const val = minCoord + i;
                const pos = toSvgX(val);
                return (
                  <g key={i}>
                    {/* Vertical grid line */}
                    <line
                      x1={pos}
                      y1="0"
                      x2={pos}
                      y2="360"
                      stroke={val === 0 ? '#94a3b8' : '#334155'}
                      strokeWidth={val === 0 ? '2' : '0.5'}
                      strokeDasharray={val === 0 ? undefined : '2,2'}
                    />
                    {/* Horizontal grid line */}
                    <line
                      x1="0"
                      y1={toSvgY(val)}
                      x2="360"
                      y2={toSvgY(val)}
                      stroke={val === 0 ? '#94a3b8' : '#334155'}
                      strokeWidth={val === 0 ? '2' : '0.5'}
                      strokeDasharray={val === 0 ? undefined : '2,2'}
                    />
                  </g>
                );
              })}

              {/* Slope Triangle (Rise over Run) */}
              <polygon
                points={`${toSvgX(x1)},${toSvgY(y1)} ${toSvgX(x2)},${toSvgY(y1)} ${toSvgX(x2)},${toSvgY(y2)}`}
                fill="rgba(245, 158, 11, 0.15)"
                stroke="#f59e0b"
                strokeWidth="1.5"
                strokeDasharray="3,3"
              />

              {/* The Graph Line: extends across bounds */}
              {(() => {
                const lineX1 = -8;
                const lineY1 = slope * lineX1 + intercept;
                const lineX2 = 8;
                const lineY2 = slope * lineX2 + intercept;
                return (
                  <line
                    x1={toSvgX(lineX1)}
                    y1={toSvgY(lineY1)}
                    x2={toSvgX(lineX2)}
                    y2={toSvgY(lineY2)}
                    stroke="#6366f1"
                    strokeWidth="3.5"
                    strokeLinecap="round"
                  />
                );
              })()}

              {/* Point A (x1, y1) */}
              <circle cx={toSvgX(x1)} cy={toSvgY(y1)} r="6" fill="#f59e0b" stroke="#ffffff" strokeWidth="2" />
              <text x={toSvgX(x1) - 30} y={toSvgY(y1) - 10} fill="#fde68a" fontSize="10" fontWeight="bold">
                A({x1}, {y1})
              </text>

              {/* Point B (x2, y2) */}
              <circle cx={toSvgX(x2)} cy={toSvgY(y2)} r="6" fill="#f59e0b" stroke="#ffffff" strokeWidth="2" />
              <text x={toSvgX(x2) + 10} y={toSvgY(y2) - 10} fill="#fde68a" fontSize="10" fontWeight="bold">
                B({x2}, {y2})
              </text>

              {/* Y-Intercept Point (0, b) */}
              <circle cx={toSvgX(0)} cy={toSvgY(intercept)} r="6" fill="#10b981" stroke="#ffffff" strokeWidth="2" />
              <text x={toSvgX(0) + 10} y={toSvgY(intercept) + 4} fill="#a7f3d0" fontSize="10" fontWeight="bold">
                (0, {intercept})
              </text>

              {/* Axis Labels */}
              <text x="345" y="195" fill="#94a3b8" fontSize="11" fontWeight="bold">X</text>
              <text x="185" y="16" fill="#94a3b8" fontSize="11" fontWeight="bold">Y</text>
            </svg>
          </div>
        </div>

        {/* Slope & Intercept Controls */}
        <div className="lg:col-span-5 space-y-4">
          {/* Active Equation Display */}
          <div className="p-4 rounded-2xl bg-indigo-50 border border-indigo-200">
            <span className="text-[11px] font-bold text-indigo-400 uppercase tracking-wider block">Line Equation</span>
            <div className="text-2xl sm:text-3xl font-black text-indigo-900 mt-1">
              y = <span className="text-indigo-600">{slope === 1 ? '' : slope === -1 ? '-' : slope}x</span>{' '}
              <span className="text-emerald-600">
                {intercept >= 0 ? `+ ${intercept}` : `- ${Math.abs(intercept)}`}
              </span>
            </div>
          </div>

          {/* Slope Slider (m) */}
          <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200 space-y-2">
            <div className="flex items-center justify-between text-xs">
              <span className="font-extrabold text-slate-700">Slope (m = Rise / Run):</span>
              <span className="font-black text-indigo-600 text-sm">{slope}</span>
            </div>
            <input
              type="range"
              min="-4"
              max="4"
              step="0.5"
              value={slope}
              onChange={e => {
                playClickSound();
                setSlope(parseFloat(e.target.value));
              }}
              className="w-full accent-indigo-600 cursor-pointer"
            />
            <div className="flex justify-between text-[10px] text-slate-400 font-semibold">
              <span>-4 (Steep Negative)</span>
              <span>0 (Flat)</span>
              <span>+4 (Steep Positive)</span>
            </div>
          </div>

          {/* Y-Intercept Slider (b) */}
          <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200 space-y-2">
            <div className="flex items-center justify-between text-xs">
              <span className="font-extrabold text-slate-700">Y-Intercept (b = (0, b)):</span>
              <span className="font-black text-emerald-600 text-sm">{intercept}</span>
            </div>
            <input
              type="range"
              min="-6"
              max="6"
              step="1"
              value={intercept}
              onChange={e => {
                playClickSound();
                setIntercept(parseInt(e.target.value, 10));
              }}
              className="w-full accent-emerald-600 cursor-pointer"
            />
            <div className="flex justify-between text-[10px] text-slate-400 font-semibold">
              <span>-6</span>
              <span>0</span>
              <span>+6</span>
            </div>
          </div>

          {/* Slope Triangle Math Box */}
          <div className="p-3.5 rounded-2xl bg-amber-50/70 border border-amber-200 text-xs text-amber-900 space-y-1">
            <div className="font-bold flex items-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5 text-amber-600" />
              <span>Slope Calculation ($\Delta y / \Delta x$):</span>
            </div>
            <div className="text-[11px] font-mono">
              Rise = {y2} - ({y1}) = <span className="font-bold">{rise}</span> | Run = {x2} - ({x1}) = <span className="font-bold">{run}</span>
            </div>
            <div className="font-bold text-amber-800">
              m = {rise} / {run} = {slope}
            </div>
          </div>

          {/* Presets */}
          <div className="flex flex-wrap items-center gap-1.5 pt-1">
            <span className="text-[11px] font-bold text-slate-400">Presets:</span>
            {[
              { label: 'y = x', m: 1, b: 0 },
              { label: 'y = 2x + 1', m: 2, b: 1 },
              { label: 'y = -x + 3', m: -1, b: 3 },
              { label: 'y = 0.5x - 2', m: 0.5, b: -2 }
            ].map(p => (
              <button
                key={p.label}
                onClick={() => {
                  playClickSound();
                  setSlope(p.m);
                  setIntercept(p.b);
                }}
                className="px-2 py-1 rounded-lg bg-slate-100 hover:bg-indigo-100 hover:text-indigo-700 text-slate-700 text-[11px] font-bold border border-slate-200 transition cursor-pointer"
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

/* ==========================================================================
   2. TRIGONOMETRIC UNIT CIRCLE LAB (Ages 14–18)
   ========================================================================== */

export const UnitCircleLab: React.FC = () => {
  const [angleDeg, setAngleDeg] = useState<number>(45);

  const angleRad = (angleDeg * Math.PI) / 180;
  const sinVal = Math.sin(angleRad);
  const cosVal = Math.cos(angleRad);
  const tanVal = Math.abs(cosVal) > 0.0001 ? Math.tan(angleRad) : Infinity;

  // Exact radical lookup for benchmark angles
  const exactValues: Record<number, { rad: string; sin: string; cos: string }> = {
    0: { rad: '0', sin: '0', cos: '1' },
    30: { rad: 'π/6', sin: '1/2', cos: '√3/2' },
    45: { rad: 'π/4', sin: '√2/2', cos: '√2/2' },
    60: { rad: 'π/3', sin: '√3/2', cos: '1/2' },
    90: { rad: 'π/2', sin: '1', cos: '0' },
    120: { rad: '2π/3', sin: '√3/2', cos: '-1/2' },
    135: { rad: '3π/4', sin: '√2/2', cos: '-√2/2' },
    150: { rad: '5π/6', sin: '1/2', cos: '-√3/2' },
    180: { rad: 'π', sin: '0', cos: '-1' },
    210: { rad: '7π/6', sin: '-1/2', cos: '-√3/2' },
    225: { rad: '5π/4', sin: '-√2/2', cos: '-√2/2' },
    240: { rad: '4π/3', sin: '-√3/2', cos: '-1/2' },
    270: { rad: '3π/2', sin: '-1', cos: '0' },
    300: { rad: '5π/3', sin: '-√3/2', cos: '1/2' },
    315: { rad: '7π/4', sin: '-√2/2', cos: '√2/2' },
    330: { rad: '11π/6', sin: '-1/2', cos: '√3/2' },
    360: { rad: '2π', sin: '0', cos: '1' }
  };

  const currentExact = exactValues[angleDeg];

  // SVG Geometry Constants
  const circleRadius = 120;
  const center = 160;
  const px = center + circleRadius * cosVal;
  const py = center - circleRadius * sinVal;

  return (
    <div className="bg-white rounded-3xl p-5 sm:p-7 border border-slate-200 shadow-sm space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-100 pb-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="px-2.5 py-1 rounded-full bg-cyan-100 text-cyan-800 text-xs font-bold">
              Ages 14–18
            </span>
            <span className="text-xs text-slate-500 font-semibold">Trigonometry & Polar Coordinates</span>
          </div>
          <h3 className="text-xl font-extrabold text-slate-900 mt-1">Trigonometric Unit Circle Explorer</h3>
          <p className="text-xs text-slate-500">
            Rotate the angle ray $\theta$ to project sine (vertical green), cosine (horizontal blue), and exact radicals.
          </p>
        </div>

        <button
          onClick={() => {
            playClickSound();
            speakText(`At ${angleDeg} degrees, cosine is ${cosVal.toFixed(3)} and sine is ${sinVal.toFixed(3)}.`);
          }}
          className="p-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 transition cursor-pointer flex items-center gap-2 text-xs font-bold"
        >
          <Volume2 className="w-4 h-4 text-indigo-600" />
          <span>Read Values</span>
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-center">
        {/* SVG Unit Circle Stage */}
        <div className="lg:col-span-6 flex flex-col items-center">
          <div className="relative bg-slate-950 rounded-3xl p-3 border-2 border-slate-800 shadow-xl overflow-hidden select-none">
            <svg width="320" height="320" className="w-[280px] h-[280px] sm:w-[320px] sm:h-[320px]">
              {/* Axes */}
              <line x1="0" y1={center} x2="320" y2={center} stroke="#475569" strokeWidth="1" />
              <line x1={center} y1="0" x2={center} y2="320" stroke="#475569" strokeWidth="1" />

              {/* Unit Circle */}
              <circle
                cx={center}
                cy={center}
                r={circleRadius}
                fill="none"
                stroke="#64748b"
                strokeWidth="2"
              />

              {/* Right Reference Triangle */}
              {/* Horizontal Cosine Line (Blue) */}
              <line
                x1={center}
                y1={center}
                x2={px}
                y2={center}
                stroke="#38bdf8"
                strokeWidth="3.5"
                strokeLinecap="round"
              />

              {/* Vertical Sine Line (Green) */}
              <line
                x1={px}
                y1={center}
                x2={px}
                y2={py}
                stroke="#4ade80"
                strokeWidth="3.5"
                strokeLinecap="round"
              />

              {/* Radius Ray (White) */}
              <line
                x1={center}
                y1={center}
                x2={px}
                y2={py}
                stroke="#ffffff"
                strokeWidth="2.5"
              />

              {/* Arc for Angle θ */}
              <circle cx={center} cy={center} r="3" fill="#ffffff" />
              <circle cx={px} cy={py} r="6" fill="#f43f5e" stroke="#ffffff" strokeWidth="2" />

              {/* Coordinate Labels */}
              <text x="300" y={center - 8} fill="#94a3b8" fontSize="10" fontWeight="bold">(1, 0)</text>
              <text x={center + 6} y="20" fill="#94a3b8" fontSize="10" fontWeight="bold">(0, 1)</text>
              <text x="5" y={center - 8} fill="#94a3b8" fontSize="10" fontWeight="bold">(-1, 0)</text>
              <text x={center + 6} y="310" fill="#94a3b8" fontSize="10" fontWeight="bold">(0, -1)</text>

              {/* Dynamic Point Coordinate Tag */}
              <text
                x={px > center ? px - 70 : px + 10}
                y={py > center ? py + 20 : py - 10}
                fill="#fde047"
                fontSize="11"
                fontWeight="extrabold"
              >
                ({cosVal.toFixed(2)}, {sinVal.toFixed(2)})
              </text>
            </svg>
          </div>
        </div>

        {/* Dynamic Trigonometric Readout */}
        <div className="lg:col-span-6 space-y-4">
          {/* Angle Display */}
          <div className="p-4 rounded-2xl bg-slate-900 text-white flex items-center justify-between">
            <div>
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Angle θ</span>
              <div className="text-3xl font-black text-amber-300">{angleDeg}°</div>
            </div>
            <div className="text-right">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Radians</span>
              <div className="text-lg font-extrabold text-cyan-300">
                {currentExact ? currentExact.rad : `${angleRad.toFixed(2)} rad`}
              </div>
            </div>
          </div>

          {/* Sine, Cosine, Tangent Cards */}
          <div className="grid grid-cols-3 gap-2.5">
            <div className="p-3 rounded-2xl bg-sky-50 border border-sky-200 text-center">
              <span className="text-[11px] font-extrabold text-sky-700 block">cos(θ)</span>
              <div className="text-lg font-black text-slate-900 mt-1">
                {currentExact ? currentExact.cos : cosVal.toFixed(3)}
              </div>
              <span className="text-[10px] text-slate-500 font-semibold">x = {cosVal.toFixed(3)}</span>
            </div>

            <div className="p-3 rounded-2xl bg-emerald-50 border border-emerald-200 text-center">
              <span className="text-[11px] font-extrabold text-emerald-700 block">sin(θ)</span>
              <div className="text-lg font-black text-slate-900 mt-1">
                {currentExact ? currentExact.sin : sinVal.toFixed(3)}
              </div>
              <span className="text-[10px] text-slate-500 font-semibold">y = {sinVal.toFixed(3)}</span>
            </div>

            <div className="p-3 rounded-2xl bg-purple-50 border border-purple-200 text-center">
              <span className="text-[11px] font-extrabold text-purple-700 block">tan(θ)</span>
              <div className="text-lg font-black text-slate-900 mt-1">
                {Math.abs(cosVal) < 0.0001 ? 'undef' : tanVal.toFixed(3)}
              </div>
              <span className="text-[10px] text-slate-500 font-semibold">sin / cos</span>
            </div>
          </div>

          {/* Angle Slider */}
          <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200 space-y-2">
            <div className="flex items-center justify-between text-xs">
              <span className="font-extrabold text-slate-700">Rotate Angle Slider:</span>
              <span className="font-bold text-indigo-600">{angleDeg}°</span>
            </div>
            <input
              type="range"
              min="0"
              max="360"
              step="5"
              value={angleDeg}
              onChange={e => {
                playClickSound();
                setAngleDeg(parseInt(e.target.value, 10));
              }}
              className="w-full accent-indigo-600 cursor-pointer"
            />
          </div>

          {/* Benchmark Special Angles */}
          <div className="space-y-1.5">
            <span className="text-[11px] font-bold text-slate-400 block">Special Benchmark Angles:</span>
            <div className="flex flex-wrap gap-1.5">
              {[0, 30, 45, 60, 90, 120, 135, 180, 270, 360].map(ang => (
                <button
                  key={ang}
                  onClick={() => {
                    playClickSound();
                    setAngleDeg(ang);
                  }}
                  className={`px-2 py-1 rounded-lg text-xs font-bold transition cursor-pointer border ${
                    angleDeg === ang
                      ? 'bg-indigo-600 text-white border-indigo-600 shadow-xs'
                      : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-100'
                  }`}
                >
                  {ang}°
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

/* ==========================================================================
   3. CALCULUS DERIVATIVE TANGENT-LINE LAB (Ages 14–18)
   ========================================================================== */

export const CalculusDerivativeLab: React.FC = () => {
  const [x0, setX0] = useState<number>(1);
  const [h, setH] = useState<number>(1); // step size for secant
  const [funcChoice, setFuncChoice] = useState<'quadratic' | 'cubic' | 'sine'>('quadratic');

  // Mathematical functions
  const f = (x: number) => {
    if (funcChoice === 'quadratic') return 0.5 * x * x;
    if (funcChoice === 'cubic') return 0.2 * (x * x * x - 3 * x);
    return Math.sin(x) * 2;
  };

  const fPrime = (x: number) => {
    if (funcChoice === 'quadratic') return x;
    if (funcChoice === 'cubic') return 0.2 * (3 * x * x - 3);
    return Math.cos(x) * 2;
  };

  const y0 = f(x0);
  const xSec = x0 + h;
  const ySec = f(xSec);
  const secantSlope = (ySec - y0) / h;
  const tangentSlope = fPrime(x0);

  // SVG dimensions
  const center = 160;
  const scale = 25;
  const toSvgX = (x: number) => center + x * scale;
  const toSvgY = (y: number) => center - y * scale;

  // Generate curve path
  const points: string[] = [];
  for (let x = -5; x <= 5; x += 0.2) {
    points.push(`${toSvgX(x)},${toSvgY(f(x))}`);
  }
  const curveD = `M ${points.join(' L ')}`;

  return (
    <div className="bg-white rounded-3xl p-5 sm:p-7 border border-slate-200 shadow-sm space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-100 pb-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="px-2.5 py-1 rounded-full bg-rose-100 text-rose-800 text-xs font-bold">
              Ages 14–18
            </span>
            <span className="text-xs text-slate-500 font-semibold">Calculus & Rate of Change</span>
          </div>
          <h3 className="text-xl font-extrabold text-slate-900 mt-1">Derivative Tangent & Secant Visualizer</h3>
          <p className="text-xs text-slate-500">
            Shrink the step size $h \to 0$ to observe the secant line converge to the true instantaneous tangent derivative $f'(x)$.
          </p>
        </div>

        {/* Function Chooser */}
        <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl border border-slate-200">
          {[
            { id: 'quadratic', label: 'f(x) = 0.5x²' },
            { id: 'cubic', label: 'f(x) = 0.2(x³-3x)' },
            { id: 'sine', label: 'f(x) = 2 sin(x)' }
          ].map(fc => (
            <button
              key={fc.id}
              onClick={() => { playClickSound(); setFuncChoice(fc.id as any); }}
              className={`px-2.5 py-1.5 rounded-lg text-xs font-bold cursor-pointer transition ${
                funcChoice === fc.id ? 'bg-white text-indigo-700 shadow-xs' : 'text-slate-500'
              }`}
            >
              {fc.label}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-center">
        {/* SVG Graph Canvas */}
        <div className="lg:col-span-7 flex flex-col items-center">
          <div className="relative bg-slate-900 rounded-3xl p-2 border-2 border-slate-700 shadow-lg overflow-hidden select-none">
            <svg width="340" height="320" className="w-[300px] h-[280px] sm:w-[340px] sm:h-[320px]">
              {/* Axes */}
              <line x1="0" y1={center} x2="340" y2={center} stroke="#475569" strokeWidth="1" />
              <line x1={center} y1="0" x2={center} y2="320" stroke="#475569" strokeWidth="1" />

              {/* Function Curve */}
              <path d={curveD} fill="none" stroke="#60a5fa" strokeWidth="3" />

              {/* Secant Line (Amber) */}
              {(() => {
                const sx1 = -5;
                const sy1 = y0 + secantSlope * (sx1 - x0);
                const sx2 = 5;
                const sy2 = y0 + secantSlope * (sx2 - x0);
                return (
                  <line
                    x1={toSvgX(sx1)}
                    y1={toSvgY(sy1)}
                    x2={toSvgX(sx2)}
                    y2={toSvgY(sy2)}
                    stroke="#f59e0b"
                    strokeWidth="2"
                    strokeDasharray="4,4"
                  />
                );
              })()}

              {/* True Tangent Line (Rose) */}
              {(() => {
                const tx1 = -5;
                const ty1 = y0 + tangentSlope * (tx1 - x0);
                const tx2 = 5;
                const ty2 = y0 + tangentSlope * (tx2 - x0);
                return (
                  <line
                    x1={toSvgX(tx1)}
                    y1={toSvgY(ty1)}
                    x2={toSvgX(tx2)}
                    y2={toSvgY(ty2)}
                    stroke="#f43f5e"
                    strokeWidth="2.5"
                  />
                );
              })()}

              {/* Fixed Point P(x0, y0) */}
              <circle cx={toSvgX(x0)} cy={toSvgY(y0)} r="5" fill="#f43f5e" stroke="#ffffff" strokeWidth="2" />
              <text x={toSvgX(x0) + 8} y={toSvgY(y0) - 8} fill="#fca5a5" fontSize="10" fontWeight="bold">
                P({x0.toFixed(1)}, {y0.toFixed(1)})
              </text>

              {/* Secant Neighbor Point Q(x0 + h, ySec) */}
              <circle cx={toSvgX(xSec)} cy={toSvgY(ySec)} r="5" fill="#f59e0b" stroke="#ffffff" strokeWidth="2" />
              <text x={toSvgX(xSec) + 8} y={toSvgY(ySec) + 12} fill="#fde68a" fontSize="10" fontWeight="bold">
                Q
              </text>
            </svg>
          </div>
        </div>

        {/* Dynamic Calculus Controls & Comparison */}
        <div className="lg:col-span-5 space-y-4">
          {/* Tangent vs Secant Readout */}
          <div className="grid grid-cols-2 gap-3">
            <div className="p-3.5 rounded-2xl bg-rose-50 border border-rose-200">
              <span className="text-[10px] font-bold text-rose-700 uppercase tracking-wider block">
                True Derivative f'(x₀)
              </span>
              <div className="text-2xl font-black text-rose-900 mt-0.5">
                {tangentSlope.toFixed(3)}
              </div>
              <span className="text-[10px] text-rose-600 font-semibold">Instantaneous Rate</span>
            </div>

            <div className="p-3.5 rounded-2xl bg-amber-50 border border-amber-200">
              <span className="text-[10px] font-bold text-amber-700 uppercase tracking-wider block">
                Secant Slope (Δy / h)
              </span>
              <div className="text-2xl font-black text-amber-900 mt-0.5">
                {secantSlope.toFixed(3)}
              </div>
              <span className="text-[10px] text-amber-600 font-semibold">Average Rate</span>
            </div>
          </div>

          {/* Convergence Meter */}
          <div className="p-3.5 rounded-2xl bg-slate-50 border border-slate-200 text-xs space-y-1">
            <div className="flex justify-between font-bold">
              <span className="text-slate-600">Approximation Error (|Secant - Tangent|):</span>
              <span className="text-indigo-600 font-black">
                {Math.abs(secantSlope - tangentSlope).toFixed(4)}
              </span>
            </div>
            <p className="text-[11px] text-slate-500">
              As step size $h \to 0$, the error vanishes and the secant slope converges to the true tangent slope.
            </p>
          </div>

          {/* Point Slider x0 */}
          <div className="space-y-1.5">
            <div className="flex justify-between text-xs font-bold text-slate-700">
              <span>Point Location (x₀):</span>
              <span className="text-rose-600">{x0.toFixed(1)}</span>
            </div>
            <input
              type="range"
              min="-3"
              max="3"
              step="0.2"
              value={x0}
              onChange={e => {
                playClickSound();
                setX0(parseFloat(e.target.value));
              }}
              className="w-full accent-rose-600 cursor-pointer"
            />
          </div>

          {/* Step Size Slider h */}
          <div className="space-y-1.5">
            <div className="flex justify-between text-xs font-bold text-slate-700">
              <span>Step Size (h):</span>
              <span className="text-amber-600">{h.toFixed(2)}</span>
            </div>
            <input
              type="range"
              min="0.05"
              max="2.5"
              step="0.05"
              value={h}
              onChange={e => {
                playClickSound();
                setH(parseFloat(e.target.value));
              }}
              className="w-full accent-amber-500 cursor-pointer"
            />
            <div className="flex justify-between text-[10px] text-slate-400 font-semibold">
              <span className="text-indigo-600 font-bold">h = 0.05 (Infinitesimal)</span>
              <span>h = 2.5 (Coarse)</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
