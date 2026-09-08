import React, { useRef, useState, useEffect } from 'react';
import { Eraser, PenTool, RotateCcw, X } from 'lucide-react';

interface ScratchpadProps {
  onClose: () => void;
}

export const Scratchpad: React.FC<ScratchpadProps> = ({ onClose }) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [color, setColor] = useState('#4f46e5'); // Indigo default
  const [lineWidth, setLineWidth] = useState(3);
  const [tool, setTool] = useState<'pen' | 'eraser'>('pen');

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const parent = canvas.parentElement;
    if (parent) {
      canvas.width = parent.clientWidth;
      canvas.height = parent.clientHeight - 60; // Leave room for toolbar
    }
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
    }
  }, []);

  const startDrawing = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    setIsDrawing(true);
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const rect = canvas.getBoundingClientRect();
    const x = 'touches' in e ? e.touches[0].clientX - rect.left : e.clientX - rect.left;
    const y = 'touches' in e ? e.touches[0].clientY - rect.top : e.clientY - rect.top;

    ctx.beginPath();
    ctx.moveTo(x, y);
  };

  const draw = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    if (!isDrawing) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const rect = canvas.getBoundingClientRect();
    const x = 'touches' in e ? e.touches[0].clientX - rect.left : e.clientX - rect.left;
    const y = 'touches' in e ? e.touches[0].clientY - rect.top : e.clientY - rect.top;

    ctx.strokeStyle = tool === 'eraser' ? '#ffffff' : color;
    ctx.lineWidth = tool === 'eraser' ? 20 : lineWidth;
    ctx.lineTo(x, y);
    ctx.stroke();
  };

  const stopDrawing = () => {
    setIsDrawing(false);
  };

  const clearCanvas = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
  };

  return (
    <div className="absolute inset-0 z-40 bg-white/95 backdrop-blur-md flex flex-col rounded-2xl border-2 border-indigo-200 shadow-2xl overflow-hidden animate-in fade-in duration-150">
      {/* Scratchpad Header & Controls */}
      <div className="flex items-center justify-between px-4 py-2.5 bg-slate-100 border-b border-slate-200">
        <div className="flex items-center gap-2">
          <span className="text-xs font-bold uppercase tracking-wider text-slate-700 flex items-center gap-1.5">
            <PenTool className="w-4 h-4 text-indigo-600" />
            Digital Math Whiteboard & Scratchpad
          </span>
        </div>

        {/* Tools Palette */}
        <div className="flex items-center gap-1.5 sm:gap-3">
          <button
            onClick={() => setTool('pen')}
            className={`p-1.5 rounded-lg flex items-center gap-1 text-xs font-semibold transition ${
              tool === 'pen' ? 'bg-indigo-600 text-white shadow-sm' : 'bg-white text-slate-700 hover:bg-slate-200'
            }`}
            title="Pen Tool"
          >
            <PenTool className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Pen</span>
          </button>

          <button
            onClick={() => setTool('eraser')}
            className={`p-1.5 rounded-lg flex items-center gap-1 text-xs font-semibold transition ${
              tool === 'eraser' ? 'bg-amber-600 text-white shadow-sm' : 'bg-white text-slate-700 hover:bg-slate-200'
            }`}
            title="Eraser"
          >
            <Eraser className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Eraser</span>
          </button>

          {/* Color pickers */}
          {tool === 'pen' && (
            <div className="flex items-center gap-1 px-1 bg-white rounded-lg border border-slate-200 py-1">
              {['#4f46e5', '#ef4444', '#10b981', '#0f172a'].map(c => (
                <button
                  key={c}
                  onClick={() => setColor(c)}
                  className={`w-5 h-5 rounded-full transition-transform ${
                    color === c ? 'scale-125 ring-2 ring-indigo-400' : 'hover:scale-110'
                  }`}
                  style={{ backgroundColor: c }}
                  title={`Color ${c}`}
                />
              ))}
            </div>
          )}

          <button
            onClick={clearCanvas}
            className="p-1.5 bg-white hover:bg-rose-50 text-rose-600 rounded-lg text-xs font-semibold flex items-center gap-1 border border-slate-200 transition"
            title="Clear all"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Clear</span>
          </button>

          <button
            onClick={onClose}
            className="p-1.5 bg-slate-200 hover:bg-slate-300 text-slate-700 rounded-lg text-xs font-bold transition ml-2"
            title="Close Scratchpad"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Drawing Canvas */}
      <div className="flex-1 relative cursor-crosshair bg-slate-50/50 touch-none">
        <canvas
          ref={canvasRef}
          onMouseDown={startDrawing}
          onMouseMove={draw}
          onMouseUp={stopDrawing}
          onMouseLeave={stopDrawing}
          onTouchStart={startDrawing}
          onTouchMove={draw}
          onTouchEnd={stopDrawing}
          className="w-full h-full block"
        />
        <div className="absolute bottom-2 left-3 pointer-events-none text-[11px] font-medium text-slate-400">
          Draw step-by-step math workings, formulas, or carry-overs here.
        </div>
      </div>
    </div>
  );
};
