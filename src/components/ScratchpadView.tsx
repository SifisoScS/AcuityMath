import React, { useRef, useState, useEffect } from 'react';
import {
  PenTool,
  Eraser,
  RotateCcw,
  Download,
  Grid,
  Sparkles,
  Maximize2,
  CheckCircle2,
  Palette
} from 'lucide-react';
import { playClickSound, playSuccessSound } from '../utils/audio';

export const ScratchpadView: React.FC = () => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [tool, setTool] = useState<'pen' | 'eraser'>('pen');
  const [color, setColor] = useState('#2a6df4');
  const [lineWidth, setLineWidth] = useState(3);
  const [showGrid, setShowGrid] = useState(true);
  const [copiedNotification, setCopiedNotification] = useState(false);

  const colors = ['#2a6df4', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#0f172a'];

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const parent = canvas.parentElement;
    if (parent) {
      canvas.width = parent.clientWidth;
      canvas.height = 480;
    }

    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
    }

    const handleResize = () => {
      if (!canvas || !parent) return;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      canvas.width = parent.clientWidth;
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.putImageData(imgData, 0, 0);
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const getCoordinates = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
    const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;
    return {
      x: (clientX - rect.left) * (canvas.width / rect.width),
      y: (clientY - rect.top) * (canvas.height / rect.height)
    };
  };

  const startDrawing = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    setIsDrawing(true);
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const { x, y } = getCoordinates(e);
    ctx.beginPath();
    ctx.moveTo(x, y);
  };

  const draw = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    if (!isDrawing) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const { x, y } = getCoordinates(e);
    ctx.strokeStyle = tool === 'eraser' ? '#ffffff' : color;
    ctx.lineWidth = tool === 'eraser' ? 24 : lineWidth;
    ctx.lineTo(x, y);
    ctx.stroke();
  };

  const stopDrawing = () => {
    setIsDrawing(false);
  };

  const handleClear = () => {
    playClickSound();
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  };

  const handleExport = () => {
    playSuccessSound();
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dataUrl = canvas.toDataURL('image/png');
    const link = document.createElement('a');
    link.download = `acuitymath-scratchpad-${Date.now()}.png`;
    link.href = dataUrl;
    link.click();
    setCopiedNotification(true);
    setTimeout(() => setCopiedNotification(false), 2500);
  };

  const handleStampSymbol = (symbol: string) => {
    playClickSound();
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.font = 'bold 28px sans-serif';
    ctx.fillStyle = color;
    ctx.fillText(symbol, 40 + Math.random() * 80, 60 + Math.random() * 80);
  };

  return (
    <div className="space-y-6">
      {/* Title Header */}
      <div className="bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 text-white rounded-3xl p-6 sm:p-8 shadow-xl border border-slate-800 flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div>
          <div className="flex items-center gap-2 text-xs uppercase font-bold text-indigo-400 tracking-wider mb-1">
            <PenTool className="w-4 h-4" />
            Digital Mathematical Whiteboard
          </div>
          <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight">
            Interactive Digital Scratchpad
          </h1>
          <p className="text-xs sm:text-sm text-slate-300 max-w-xl leading-relaxed mt-1">
            Show your work, draw geometric proofs, compute step-by-step long division, or sketch coordinate equations.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={handleExport}
            className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold rounded-xl shadow-md transition flex items-center gap-1.5 cursor-pointer"
          >
            <Download className="w-4 h-4" />
            <span>Export Snapshot</span>
          </button>
        </div>
      </div>

      {copiedNotification && (
        <div className="p-3 bg-emerald-600 text-white rounded-xl text-xs font-bold shadow-md flex items-center gap-2 animate-in fade-in">
          <CheckCircle2 className="w-4 h-4" />
          <span>Snapshot downloaded successfully!</span>
        </div>
      )}

      {/* Whiteboard Workspace Card */}
      <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden flex flex-col">
        {/* Whiteboard Controls Toolbar */}
        <div className="p-4 bg-slate-50 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3">
          {/* Tool Modes */}
          <div className="flex items-center gap-2">
            <button
              onClick={() => {
                playClickSound();
                setTool('pen');
              }}
              className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition flex items-center gap-1.5 cursor-pointer border ${
                tool === 'pen'
                  ? 'bg-indigo-600 text-white border-indigo-500 shadow-xs'
                  : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-100'
              }`}
            >
              <PenTool className="w-3.5 h-3.5" />
              <span>Pen</span>
            </button>

            <button
              onClick={() => {
                playClickSound();
                setTool('eraser');
              }}
              className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition flex items-center gap-1.5 cursor-pointer border ${
                tool === 'eraser'
                  ? 'bg-amber-600 text-white border-amber-500 shadow-xs'
                  : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-100'
              }`}
            >
              <Eraser className="w-3.5 h-3.5" />
              <span>Eraser</span>
            </button>

            <button
              onClick={() => setShowGrid(prev => !prev)}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition flex items-center gap-1.5 cursor-pointer border ${
                showGrid
                  ? 'bg-indigo-50 text-indigo-700 border-indigo-200'
                  : 'bg-white text-slate-500 border-slate-200 hover:bg-slate-100'
              }`}
              title="Toggle Math Grid"
            >
              <Grid className="w-3.5 h-3.5" />
              <span>Math Grid</span>
            </button>
          </div>

          {/* Color palette */}
          {tool === 'pen' && (
            <div className="flex items-center gap-1.5 bg-white px-2 py-1 rounded-xl border border-slate-200">
              <span className="text-[10px] font-bold text-slate-400 uppercase mr-1">Color:</span>
              {colors.map(c => (
                <button
                  key={c}
                  onClick={() => setColor(c)}
                  className={`w-6 h-6 rounded-full transition-transform cursor-pointer ${
                    color === c ? 'scale-125 ring-2 ring-indigo-400' : 'hover:scale-110'
                  }`}
                  style={{ backgroundColor: c }}
                  title={`Color ${c}`}
                />
              ))}
            </div>
          )}

          {/* Quick math symbol stamps */}
          <div className="hidden lg:flex items-center gap-1 bg-white px-2 py-1 rounded-xl border border-slate-200 text-xs">
            <span className="text-[10px] font-bold text-slate-400 uppercase mr-1">Symbols:</span>
            {['∑', '√', 'π', '∫', '±', '≠', 'θ'].map(sym => (
              <button
                key={sym}
                onClick={() => handleStampSymbol(sym)}
                className="w-7 h-7 rounded-lg hover:bg-slate-100 font-bold font-mono text-slate-700 flex items-center justify-center transition cursor-pointer"
                title={`Stamp ${sym}`}
              >
                {sym}
              </button>
            ))}
          </div>

          {/* Clear button */}
          <div className="flex items-center gap-2">
            <button
              onClick={handleClear}
              className="px-3 py-1.5 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 rounded-xl text-xs font-bold flex items-center gap-1.5 transition cursor-pointer"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Clear Whiteboard</span>
            </button>
          </div>
        </div>

        {/* Canvas Area with optional grid background */}
        <div
          className={`w-full min-h-[480px] relative cursor-crosshair ${
            showGrid
              ? 'bg-[linear-gradient(to_right,#e2e8f0_1px,transparent_1px),linear-gradient(to_bottom,#e2e8f0_1px,transparent_1px)] bg-[size:24px_24px]'
              : 'bg-white'
          }`}
        >
          <canvas
            ref={canvasRef}
            onMouseDown={startDrawing}
            onMouseMove={draw}
            onMouseUp={stopDrawing}
            onMouseLeave={stopDrawing}
            onTouchStart={startDrawing}
            onTouchMove={draw}
            onTouchEnd={stopDrawing}
            className="w-full h-full block touch-none"
          />
        </div>

        <div className="p-3 bg-slate-50 border-t border-slate-200 flex items-center justify-between text-xs text-slate-500 px-6">
          <span>💡 Draw with mouse or touch screen. Click "Math Grid" to assist alignment.</span>
          <span className="font-mono text-[11px] text-slate-400">Resolution: Responsive Canvas</span>
        </div>
      </div>
    </div>
  );
};
