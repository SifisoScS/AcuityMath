import React, { useState } from 'react';
import { BILINGUAL_GLOSSARY, BilingualGlossaryTerm } from '../data/bilingualGlossaryData';
import { Volume2, Languages, X, ExternalLink } from 'lucide-react';
import { speakText, playClickSound } from '../utils/audio';

interface BilingualTextHighlighterProps {
  text: string;
  className?: string;
  onOpenGlossary?: (termId?: string) => void;
}

export const BilingualTextHighlighter: React.FC<BilingualTextHighlighterProps> = ({
  text,
  className = '',
  onOpenGlossary
}) => {
  const [activeTerm, setActiveTerm] = useState<BilingualGlossaryTerm | null>(null);
  const [popoverPos, setPopoverPos] = useState<{ x: number; y: number } | null>(null);

  if (!text) return null;

  // Build lookup mapping: lowercase term -> term object
  const termMap = new Map<string, BilingualGlossaryTerm>();
  BILINGUAL_GLOSSARY.forEach(term => {
    termMap.set(term.termEn.toLowerCase(), term);
    termMap.set(term.termEs.toLowerCase(), term);
  });

  // Sort terms by length descending to match multi-word terms first (e.g., 'ten-frame', 'line plot')
  const sortedKeywords = Array.from(termMap.keys()).sort((a, b) => b.length - a.length);

  // Regex pattern matching any of the glossary terms as whole words
  const escapedKeywords = sortedKeywords.map(k => k.replace(/[-[\]{}()*+?.,\\^$|#\s]/g, '\\$&'));
  const regex = new RegExp(`\\b(${escapedKeywords.join('|')})\\b`, 'gi');

  const parts: React.ReactNode[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(text)) !== null) {
    const matchIndex = match.index;
    const matchWord = match[0];
    const term = termMap.get(matchWord.toLowerCase());

    if (matchIndex > lastIndex) {
      parts.push(text.substring(lastIndex, matchIndex));
    }

    if (term) {
      parts.push(
        <button
          key={`term-${matchIndex}`}
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            playClickSound();
            const rect = e.currentTarget.getBoundingClientRect();
            setPopoverPos({
              x: Math.min(window.innerWidth - 280, Math.max(10, rect.left)),
              y: rect.bottom + window.scrollY + 6
            });
            setActiveTerm(term);
          }}
          className="inline-flex items-baseline font-inherit text-inherit underline decoration-indigo-400 decoration-dotted decoration-2 underline-offset-3 hover:text-indigo-600 hover:decoration-indigo-600 hover:bg-indigo-50/70 px-0.5 rounded transition cursor-pointer"
          title={`Dual Vocab: ${term.termEn} ⟷ ${term.termEs}`}
        >
          {matchWord}
        </button>
      );
    } else {
      parts.push(matchWord);
    }

    lastIndex = matchIndex + matchWord.length;
  }

  if (lastIndex < text.length) {
    parts.push(text.substring(lastIndex));
  }

  const handleSpeak = (word: string, lang: 'en-US' | 'es-US') => {
    playClickSound();
    speakText(word, undefined, lang);
  };

  return (
    <span className={`relative ${className}`}>
      {parts}

      {/* Floating Compact Glossary Popover */}
      {activeTerm && popoverPos && (
        <div
          className="fixed z-50 w-72 bg-white rounded-2xl shadow-xl border border-indigo-200 p-3.5 space-y-2.5 text-xs text-slate-800 animate-in fade-in zoom-in-95"
          style={{
            top: `${Math.min(window.innerHeight - 200, popoverPos.y)}px`,
            left: `${popoverPos.x}px`
          }}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex items-center justify-between pb-1.5 border-b border-slate-100">
            <div className="flex items-center gap-1.5 text-indigo-700 font-extrabold text-[11px] uppercase tracking-wider">
              <Languages className="w-3.5 h-3.5" />
              <span>Dual Math Vocabulary</span>
            </div>
            <button
              onClick={() => setActiveTerm(null)}
              className="p-1 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 cursor-pointer"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Bilingual Terms with Audio */}
          <div className="grid grid-cols-2 gap-2 bg-slate-50 p-2.5 rounded-xl border border-slate-200/80">
            <div className="space-y-1">
              <div className="text-[10px] uppercase tracking-wider font-extrabold text-slate-400">English</div>
              <div className="flex items-center justify-between">
                <span className="font-extrabold text-slate-900 text-xs">{activeTerm.termEn}</span>
                <button
                  onClick={() => handleSpeak(activeTerm.termEn, 'en-US')}
                  className="p-1 text-indigo-600 hover:bg-indigo-100 rounded-lg cursor-pointer transition"
                  title="Speak English"
                >
                  <Volume2 className="w-3 h-3" />
                </button>
              </div>
            </div>

            <div className="space-y-1 border-l border-slate-200 pl-2">
              <div className="text-[10px] uppercase tracking-wider font-extrabold text-indigo-500">Español</div>
              <div className="flex items-center justify-between">
                <span className="font-extrabold text-indigo-900 text-xs">{activeTerm.termEs}</span>
                <button
                  onClick={() => handleSpeak(activeTerm.termEs, 'es-US')}
                  className="p-1 text-indigo-600 hover:bg-indigo-100 rounded-lg cursor-pointer transition"
                  title="Speak Spanish"
                >
                  <Volume2 className="w-3 h-3" />
                </button>
              </div>
            </div>
          </div>

          {/* Definitions */}
          <div className="space-y-1.5 text-[11px] leading-relaxed">
            <p className="text-slate-700">
              <strong className="text-slate-900">EN:</strong> {activeTerm.definitionEn}
            </p>
            <p className="text-slate-600">
              <strong className="text-indigo-800">ES:</strong> {activeTerm.definitionEs}
            </p>
          </div>

          {/* Open Full Glossary Link */}
          {onOpenGlossary && (
            <button
              onClick={() => {
                setActiveTerm(null);
                onOpenGlossary(activeTerm.id);
              }}
              className="w-full pt-1.5 border-t border-slate-100 text-indigo-600 hover:text-indigo-800 font-bold text-[10px] flex items-center justify-center gap-1 cursor-pointer"
            >
              <span>Explore in Full Dual Vocab Glossary</span>
              <ExternalLink className="w-3 h-3" />
            </button>
          )}
        </div>
      )}
    </span>
  );
};
