import React, { useState } from 'react';
import {
  Sparkles,
  Bot,
  Lightbulb,
  Compass,
  HelpCircle,
  Volume2,
  VolumeX,
  X,
  Send,
  Loader2,
  CheckCircle,
  AlertTriangle
} from 'lucide-react';
import { apiService } from '../services/api';
import { speakText, stopSpeaking } from '../utils/audio';
import { useModalA11y } from '../hooks/useModalA11y';

interface SocraticCoachModalProps {
  isOpen: boolean;
  onClose: () => void;
  problemQuestion: string;
  options: string[];
  correctAnswer: string;
  studentAnswer?: string | null;
  studentAge: number;
  tier: string;
  hint?: string;
  explanation?: string;
  misconceptionDescription?: string | null;
}

export const SocraticCoachModal: React.FC<SocraticCoachModalProps> = ({
  isOpen,
  onClose,
  problemQuestion,
  options,
  correctAnswer,
  studentAnswer,
  studentAge,
  tier,
  hint,
  explanation,
  misconceptionDescription
}) => {
  // Traps Tab, handles Escape, and returns focus where it came from.
  // `aria-modal` on the panel below promises the rest of the page is
  // inert; this is what makes that true rather than a claim.
  const panelRef = useModalA11y(isOpen, onClose);
  const [messages, setMessages] = useState<Array<{
    role: 'user' | 'coach';
    text: string;
    source?: string;
    followUp?: string;
    timestamp: string;
  }>>([
    {
      role: 'coach',
      text: studentAnswer && studentAnswer !== correctAnswer
        ? `Hello! I see you selected "${studentAnswer}". Don't worry at all—mistakes are where our math brains grow strongest! Would you like a gentle clue or an everyday analogy to guide your next try?`
        : `Hi there! I'm your Socratic Math Coach. I'm here to explore this problem with you step-by-step without spoiling the answer. How can I help you think through it?`,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    }
  ]);
  const [inputText, setInputText] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);

  if (!isOpen) return null;

  const handleAskMode = async (
    mode: 'hint' | 'explain_misconception' | 'socratic_question' | 'real_world_analogy',
    customPrompt?: string
  ) => {
    if (isLoading) return;
    setIsLoading(true);

    const userLabel = customPrompt || (
      mode === 'hint' ? 'Can you give me a step 1 hint?' :
      mode === 'explain_misconception' ? 'Why was my answer incorrect?' :
      mode === 'real_world_analogy' ? 'Can you explain this with a real-world story or analogy?' :
      'Ask me a guiding question to get started!'
    );

    setMessages(prev => [
      ...prev,
      {
        role: 'user',
        text: userLabel,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      }
    ]);

    try {
      const response = await apiService.askSocraticCoach({
        problemQuestion,
        options,
        correctAnswer,
        studentAnswer,
        studentAge,
        tier,
        hint,
        explanation,
        mode: customPrompt ? 'custom' : mode,
        userMessage: customPrompt
      });

      setMessages(prev => [
        ...prev,
        {
          role: 'coach',
          text: response.message,
          source: response.source,
          followUp: response.followUpPrompt,
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        }
      ]);
    } catch {
      setMessages(prev => [
        ...prev,
        {
          role: 'coach',
          text: 'Let us look at the given numbers together! What operation do you think we should try first?',
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        }
      ]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSendMessage = (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputText.trim() || isLoading) return;
    const text = inputText.trim();
    setInputText('');
    handleAskMode('socratic_question', text);
  };

  const handleReadAloud = (text: string) => {
    if (isSpeaking) {
      stopSpeaking();
      setIsSpeaking(false);
    } else {
      setIsSpeaking(true);
      speakText(text, () => setIsSpeaking(false));
    }
  };

  return (
    <div
      ref={panelRef}
      role="dialog"
      aria-modal="true"
      aria-label="Socratic mathematics coach"
      tabIndex={-1}
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-150">
      <div className="bg-white rounded-3xl max-w-2xl w-full max-h-[92vh] flex flex-col shadow-2xl border border-slate-200 overflow-hidden">
        {/* Header */}
        <div className="px-5 py-4 bg-linear-to-r from-indigo-700 via-indigo-600 to-purple-600 text-white flex items-center justify-between shadow-xs">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-white/15 backdrop-blur-md flex items-center justify-center border border-white/20">
              <Bot className="w-6 h-6 text-amber-300" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-bold text-base sm:text-lg">Socratic AI Math Coach</h3>
                <span className="text-[10px] uppercase tracking-wider font-extrabold px-2 py-0.5 rounded-full bg-white/20 text-indigo-100">
                  Gemini Flash
                </span>
              </div>
              <p className="text-xs text-indigo-100 opacity-90">
                Guiding your mathematical discovery • Age {studentAge} Mode
              </p>
            </div>
          </div>

          <button
            onClick={() => {
              stopSpeaking();
              onClose();
            }}
            className="p-2 hover:bg-white/15 text-white/80 hover:text-white rounded-xl transition cursor-pointer"
            title="Close Coach"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Diagnostic alert banner if misconception was detected */}
        {misconceptionDescription && (
          <div className="px-5 py-2.5 bg-amber-50 border-b border-amber-200 text-amber-900 text-xs flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
            <span>
              <strong>Diagnostic Observation:</strong> {misconceptionDescription}
            </span>
          </div>
        )}

        {/* Current Question Capsule */}
        <div className="px-5 py-3 bg-slate-50 border-b border-slate-200 text-xs">
          <span className="font-bold text-slate-500 uppercase text-[10px] tracking-wider block mb-1">
            Current Problem
          </span>
          <div className="font-semibold text-slate-800 line-clamp-2">
            {problemQuestion}
          </div>
        </div>

        {/* Chat History */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-4">
          {messages.map((m, idx) => (
            <div
              key={idx}
              className={`flex gap-3 ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}
            >
              {m.role === 'coach' && (
                <div className="w-8 h-8 rounded-full bg-indigo-100 text-indigo-700 flex items-center justify-center shrink-0 mt-1 font-bold text-xs shadow-xs">
                  <Sparkles className="w-4 h-4 text-indigo-600" />
                </div>
              )}

              <div
                className={`max-w-[85%] rounded-2xl px-4 py-3 text-xs sm:text-sm leading-relaxed shadow-xs ${
                  m.role === 'user'
                    ? 'bg-indigo-600 text-white rounded-br-none'
                    : 'bg-slate-100 text-slate-800 rounded-bl-none border border-slate-200/80'
                }`}
              >
                <div className="whitespace-pre-line">{m.text}</div>

                {m.followUp && (
                  <div className="mt-2.5 pt-2 border-t border-slate-200/70 text-xs font-semibold text-indigo-700 flex items-center gap-1.5">
                    <Compass className="w-3.5 h-3.5" />
                    <span>{m.followUp}</span>
                  </div>
                )}

                <div className="mt-1.5 flex items-center justify-between text-[10px] opacity-70 gap-2">
                  <span>{m.timestamp}</span>
                  {m.role === 'coach' && (
                    <div className="flex items-center gap-2">
                      {m.source && (
                        <span className="font-mono text-[9px] bg-slate-200/80 px-1.5 py-0.2 rounded text-slate-600">
                          {m.source}
                        </span>
                      )}
                      <button
                        onClick={() => handleReadAloud(m.text)}
                        className="hover:text-indigo-600 transition cursor-pointer flex items-center gap-0.5"
                        title="Read aloud"
                      >
                        {isSpeaking ? <VolumeX className="w-3 h-3" /> : <Volume2 className="w-3 h-3" />}
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </div>
          ))}

          {isLoading && (
            <div className="flex gap-3 items-center text-slate-400 text-xs italic">
              <div className="w-8 h-8 rounded-full bg-indigo-50 text-indigo-600 flex items-center justify-center shrink-0">
                <Loader2 className="w-4 h-4 animate-spin" />
              </div>
              <span>Coach is thinking Socratic guidance...</span>
            </div>
          )}
        </div>

        {/* Quick Socratic Prompt Buttons */}
        <div className="p-3 bg-slate-50 border-t border-slate-200 flex flex-wrap gap-1.5">
          <button
            onClick={() => handleAskMode('hint')}
            disabled={isLoading}
            className="px-3 py-1.5 bg-white hover:bg-indigo-50 text-slate-700 hover:text-indigo-700 border border-slate-200 hover:border-indigo-300 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition cursor-pointer shadow-xs disabled:opacity-50"
          >
            <Lightbulb className="w-3.5 h-3.5 text-amber-500" />
            <span>Step 1 Hint</span>
          </button>

          {studentAnswer && studentAnswer !== correctAnswer && (
            <button
              onClick={() => handleAskMode('explain_misconception')}
              disabled={isLoading}
              className="px-3 py-1.5 bg-rose-50 hover:bg-rose-100 text-rose-800 border border-rose-200 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition cursor-pointer shadow-xs disabled:opacity-50"
            >
              <HelpCircle className="w-3.5 h-3.5 text-rose-600" />
              <span>Why was my choice wrong?</span>
            </button>
          )}

          <button
            onClick={() => handleAskMode('real_world_analogy')}
            disabled={isLoading}
            className="px-3 py-1.5 bg-white hover:bg-purple-50 text-slate-700 hover:text-purple-700 border border-slate-200 hover:border-purple-300 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition cursor-pointer shadow-xs disabled:opacity-50"
          >
            <Compass className="w-3.5 h-3.5 text-purple-600" />
            <span>Real-World Analogy</span>
          </button>

          <button
            onClick={() => handleAskMode('socratic_question')}
            disabled={isLoading}
            className="px-3 py-1.5 bg-white hover:bg-emerald-50 text-slate-700 hover:text-emerald-700 border border-slate-200 hover:border-emerald-300 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition cursor-pointer shadow-xs disabled:opacity-50"
          >
            <CheckCircle className="w-3.5 h-3.5 text-emerald-600" />
            <span>Guiding Question</span>
          </button>
        </div>

        {/* Custom Input Form */}
        <form onSubmit={handleSendMessage} className="p-3 sm:p-4 bg-white border-t border-slate-100 flex gap-2">
          <input
            type="text"
            value={inputText}
            onChange={e => setInputText(e.target.value)}
            placeholder="Type a question for your Socratic coach..."
            disabled={isLoading}
            className="flex-1 bg-slate-50 border border-slate-200 rounded-2xl px-4 py-2.5 text-xs sm:text-sm text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white transition"
          />
          <button
            type="submit"
            disabled={!inputText.trim() || isLoading}
            className="px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-40 text-white rounded-2xl font-bold text-xs sm:text-sm transition flex items-center gap-1.5 cursor-pointer shadow-xs"
          >
            <Send className="w-4 h-4" />
            <span className="hidden sm:inline">Ask</span>
          </button>
        </form>
      </div>
    </div>
  );
};
