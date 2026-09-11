import React, { useState } from 'react';
import { 
  Languages, 
  Volume2, 
  Search, 
  X, 
  Sparkles, 
  BookOpen, 
  Check, 
  Filter,
  GraduationCap
} from 'lucide-react';
import { BILINGUAL_GLOSSARY, BilingualGlossaryTerm } from '../data/bilingualGlossaryData';
import { AgeTier } from '../types';
import { speakText, stopSpeaking, playClickSound } from '../utils/audio';
import { useModalA11y } from '../hooks/useModalA11y';

interface BilingualGlossaryModalProps {
  isOpen?: boolean;
  onClose: () => void;
  initialTier?: AgeTier;
  targetTermId?: string;
}

export const BilingualGlossaryModal: React.FC<BilingualGlossaryModalProps> = ({
  isOpen = true,
  onClose,
  initialTier = 'elementary',
  targetTermId
}) => {
  // Traps Tab, handles Escape, and returns focus where it came from.
  // `aria-modal` on the panel below promises the rest of the page is
  // inert; this is what makes that true rather than a claim.
  const panelRef = useModalA11y(isOpen, onClose);
  if (!isOpen) return null;
  const [selectedTier, setSelectedTier] = useState<AgeTier | 'all'>(initialTier);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [primaryLang, setPrimaryLang] = useState<'en' | 'es'>('en');
  const [speakingTermId, setSpeakingTermId] = useState<string | null>(null);

  const handleSpeak = (term: BilingualGlossaryTerm, lang: 'en' | 'es') => {
    playClickSound();
    setSpeakingTermId(`${term.id}-${lang}`);
    const textToSpeak = lang === 'en' 
      ? `${term.termEn}. ${term.definitionEn}` 
      : `${term.termEs}. ${term.definitionEs}`;
    
    speakText(textToSpeak, () => setSpeakingTermId(null), lang === 'en' ? 'en-US' : 'es-US');
  };

  const filteredTerms = BILINGUAL_GLOSSARY.filter(term => {
    const matchesTier = selectedTier === 'all' || term.tier === selectedTier;
    const q = searchQuery.toLowerCase().trim();
    if (!q) return matchesTier;
    const matchesQuery = 
      term.termEn.toLowerCase().includes(q) ||
      term.termEs.toLowerCase().includes(q) ||
      term.definitionEn.toLowerCase().includes(q) ||
      term.definitionEs.toLowerCase().includes(q) ||
      term.category.toLowerCase().includes(q);
    return matchesTier && matchesQuery;
  });

  return (
    <div
      ref={panelRef}
      role="dialog"
      aria-modal="true"
      aria-label="Bilingual mathematics glossary"
      tabIndex={-1}
      className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in">
      <div className="bg-white w-full max-w-2xl rounded-3xl p-6 shadow-2xl border border-slate-200 flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-start justify-between pb-4 border-b border-slate-100 shrink-0">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="px-2.5 py-0.5 rounded-full text-[10px] font-extrabold uppercase tracking-wider bg-indigo-50 text-indigo-700 border border-indigo-200">
                Bilingual ELL Scaffolding
              </span>
              <span className="text-xs font-bold text-slate-500">
                English ⟷ Español
              </span>
            </div>
            <h2 className="text-xl sm:text-2xl font-black text-slate-900 flex items-center gap-2">
              <Languages className="w-6 h-6 text-indigo-600" />
              Dual-Language Math Glossary
            </h2>
            <p className="text-xs text-slate-500">
              Interactive bilingual audio definitions for essential mathematical concepts (Ages 3–18).
            </p>
          </div>

          <button
            onClick={() => {
              stopSpeaking();
              onClose();
            }}
            className="p-1.5 rounded-xl text-slate-400 hover:text-slate-700 hover:bg-slate-100 cursor-pointer transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Controls Bar: Search, Language Toggle, Tier Filter */}
        <div className="py-3.5 space-y-3 shrink-0 border-b border-slate-100">
          <div className="flex flex-col sm:flex-row gap-2.5">
            {/* Search */}
            <div className="relative flex-1">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder="Search vocabulary (e.g. numerator, pendiente, limit)..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                className="w-full pl-9 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium focus:outline-hidden focus:ring-2 focus:ring-indigo-500"
              />
            </div>

            {/* Language Switch Pill */}
            <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl shrink-0 self-start sm:self-auto">
              <button
                onClick={() => {
                  playClickSound();
                  setPrimaryLang('en');
                }}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer ${
                  primaryLang === 'en'
                    ? 'bg-white text-indigo-700 shadow-xs font-black'
                    : 'text-slate-500 hover:text-slate-900'
                }`}
              >
                🇺🇸 English First
              </button>
              <button
                onClick={() => {
                  playClickSound();
                  setPrimaryLang('es');
                }}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer ${
                  primaryLang === 'es'
                    ? 'bg-white text-indigo-700 shadow-xs font-black'
                    : 'text-slate-500 hover:text-slate-900'
                }`}
              >
                🇲🇽 Español Primero
              </button>
            </div>
          </div>

          {/* Tier Filters */}
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 text-xs">
            <span className="text-slate-400 font-bold text-[11px] mr-1 flex items-center gap-1">
              <Filter className="w-3 h-3" /> Tier:
            </span>
            {(['all', 'early', 'elementary', 'middle', 'high'] as const).map(tier => (
              <button
                key={tier}
                onClick={() => {
                  playClickSound();
                  setSelectedTier(tier);
                }}
                className={`px-2.5 py-1 rounded-lg font-bold capitalize transition cursor-pointer whitespace-nowrap text-xs ${
                  selectedTier === tier
                    ? 'bg-indigo-600 text-white'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                {tier === 'all' ? 'All Stages' : tier}
              </button>
            ))}
          </div>
        </div>

        {/* Term Cards List */}
        <div className="flex-1 overflow-y-auto py-3 space-y-3 pr-1">
          {filteredTerms.length === 0 ? (
            <div className="text-center py-12 text-slate-400 text-xs">
              No matching mathematical terms found for "{searchQuery}".
            </div>
          ) : (
            filteredTerms.map(term => {
              const isEnSpeaking = speakingTermId === `${term.id}-en`;
              const isEsSpeaking = speakingTermId === `${term.id}-es`;

              return (
                <div
                  key={term.id}
                  className="bg-slate-50 hover:bg-slate-100/70 border border-slate-200/80 rounded-2xl p-4 transition space-y-2.5"
                >
                  {/* Top Bar: Primary and Secondary Terms + Category */}
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <h3 className="font-extrabold text-base text-slate-900">
                          {primaryLang === 'en' ? term.termEn : term.termEs}
                        </h3>
                        <span className="text-slate-400 font-bold text-xs">/</span>
                        <h4 className="font-bold text-sm text-indigo-600">
                          {primaryLang === 'en' ? term.termEs : term.termEn}
                        </h4>
                      </div>
                      <span className="text-[10px] font-extrabold uppercase tracking-wide px-2 py-0.5 rounded bg-indigo-100/70 text-indigo-800 mt-1 inline-block">
                        {term.category} • {term.tier}
                      </span>
                    </div>

                    {/* Speech Buttons */}
                    <div className="flex items-center gap-1.5 shrink-0">
                      <button
                        onClick={() => handleSpeak(term, 'en')}
                        className={`px-2.5 py-1 rounded-lg text-xs font-bold border transition flex items-center gap-1 cursor-pointer ${
                          isEnSpeaking
                            ? 'bg-emerald-100 text-emerald-800 border-emerald-300 animate-pulse'
                            : 'bg-white text-slate-700 hover:bg-slate-100 border-slate-200'
                        }`}
                        title="Pronounce in English"
                      >
                        <Volume2 className="w-3.5 h-3.5 text-indigo-600" />
                        <span>EN</span>
                      </button>

                      <button
                        onClick={() => handleSpeak(term, 'es')}
                        className={`px-2.5 py-1 rounded-lg text-xs font-bold border transition flex items-center gap-1 cursor-pointer ${
                          isEsSpeaking
                            ? 'bg-emerald-100 text-emerald-800 border-emerald-300 animate-pulse'
                            : 'bg-white text-slate-700 hover:bg-slate-100 border-slate-200'
                        }`}
                        title="Pronunciar en Español"
                      >
                        <Volume2 className="w-3.5 h-3.5 text-emerald-600" />
                        <span>ES</span>
                      </button>
                    </div>
                  </div>

                  {/* Definitions */}
                  <div className="space-y-1.5 text-xs">
                    <p className="text-slate-700 leading-relaxed">
                      <strong className="text-slate-900 font-semibold">EN: </strong>
                      {term.definitionEn}
                    </p>
                    <p className="text-slate-600 leading-relaxed">
                      <strong className="text-indigo-900 font-semibold">ES: </strong>
                      {term.definitionEs}
                    </p>
                  </div>

                  {/* Example Box */}
                  <div className="p-2.5 bg-white rounded-xl border border-slate-200/60 text-[11px] text-slate-600 space-y-0.5">
                    <div>
                      <span className="font-bold text-slate-700">Example: </span>
                      {term.exampleEn}
                    </div>
                    <div className="text-slate-500">
                      <span className="font-bold text-indigo-700">Ejemplo: </span>
                      {term.exampleEs}
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Footer */}
        <div className="pt-3 border-t border-slate-100 flex items-center justify-between text-xs text-slate-400 shrink-0">
          <span>{filteredTerms.length} mathematical terms available with bilingual speech.</span>
          <button
            onClick={() => {
              stopSpeaking();
              onClose();
            }}
            className="px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold cursor-pointer transition"
          >
            Close Glossary
          </button>
        </div>
      </div>
    </div>
  );
};
