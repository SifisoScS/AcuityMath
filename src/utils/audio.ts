/**
 * Audio synthesis and text-to-speech engine using Web Audio and Web Speech APIs.
 * Zero external audio file dependencies.
 */

let audioCtx: AudioContext | null = null;
let soundEnabled = true;

function getAudioContext(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  if (!audioCtx) {
    const AudioContextClass = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (AudioContextClass) {
      audioCtx = new AudioContextClass();
    }
  }
  if (audioCtx && audioCtx.state === 'suspended') {
    audioCtx.resume();
  }
  return audioCtx;
}

export function setSoundEnabled(enabled: boolean) {
  soundEnabled = enabled;
}

export function getSoundEnabled(): boolean {
  return soundEnabled;
}

export function playClickSound() {
  if (!soundEnabled) return;
  try {
    const ctx = getAudioContext();
    if (!ctx) return;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(600, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(300, ctx.currentTime + 0.05);

    gain.gain.setValueAtTime(0.12, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.05);

    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.05);
  } catch (e) {
    console.debug('Audio not allowed yet:', e);
  }
}

export function playSuccessSound() {
  if (!soundEnabled) return;
  try {
    const ctx = getAudioContext();
    if (!ctx) return;
    const now = ctx.currentTime;

    const notes = [523.25, 659.25, 783.99, 1046.5]; // C5, E5, G5, C6
    notes.forEach((freq, idx) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(freq, now + idx * 0.08);

      gain.gain.setValueAtTime(0, now + idx * 0.08);
      gain.gain.linearRampToValueAtTime(0.2, now + idx * 0.08 + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.001, now + idx * 0.08 + 0.25);

      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now + idx * 0.08);
      osc.stop(now + idx * 0.08 + 0.25);
    });
  } catch (e) {
    console.debug('Audio error:', e);
  }
}

export function playErrorSound() {
  if (!soundEnabled) return;
  try {
    const ctx = getAudioContext();
    if (!ctx) return;
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(220, now);
    osc.frequency.linearRampToValueAtTime(140, now + 0.2);

    gain.gain.setValueAtTime(0.15, now);
    gain.gain.exponentialRampToValueAtTime(0.01, now + 0.25);

    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.25);
  } catch (e) {
    console.debug('Audio error:', e);
  }
}

export function playLevelUpFanfare() {
  if (!soundEnabled) return;
  try {
    const ctx = getAudioContext();
    if (!ctx) return;
    const now = ctx.currentTime;
    // Fanfare chord progression
    const chord = [
      { freq: 440, time: 0, dur: 0.15 },
      { freq: 554.37, time: 0.12, dur: 0.15 },
      { freq: 659.25, time: 0.24, dur: 0.2 },
      { freq: 880, time: 0.40, dur: 0.5 },
      { freq: 1108.73, time: 0.50, dur: 0.6 }
    ];

    chord.forEach(item => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(item.freq, now + item.time);

      gain.gain.setValueAtTime(0.01, now + item.time);
      gain.gain.linearRampToValueAtTime(0.25, now + item.time + 0.03);
      gain.gain.exponentialRampToValueAtTime(0.001, now + item.time + item.dur);

      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now + item.time);
      osc.stop(now + item.time + item.dur);
    });
  } catch (e) {
    console.debug('Fanfare audio error:', e);
  }
}

/**
 * Text-to-Speech (TTS) with bilingual English and Spanish language support
 */
export function speakText(text: string, onEnd?: () => void, lang: string = 'en-US') {
  if (typeof window === 'undefined' || !('speechSynthesis' in window)) {
    if (onEnd) onEnd();
    return;
  }
  try {
    window.speechSynthesis.cancel(); // Stop any pending speech
    const cleanText = text.replace(/[*_#`]/g, '');
    const utterance = new SpeechSynthesisUtterance(cleanText);
    utterance.lang = lang;
    utterance.rate = 0.95; // Slightly slower for clarity
    utterance.pitch = 1.05; // Friendly pitch for learners

    // Attempt to pick matching voice for the target language (e.g. Spanish vs English)
    const voices = window.speechSynthesis.getVoices();
    if (voices && voices.length > 0) {
      const matchVoice = voices.find(v => v.lang && v.lang.toLowerCase().startsWith(lang.slice(0, 2).toLowerCase()));
      if (matchVoice) {
        utterance.voice = matchVoice;
      }
    }

    if (onEnd) {
      utterance.onend = onEnd;
      utterance.onerror = onEnd;
    }
    window.speechSynthesis.speak(utterance);
  } catch (e) {
    console.debug('Speech error:', e);
    if (onEnd) onEnd();
  }
}

export function stopSpeaking() {
  if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
    window.speechSynthesis.cancel();
  }
}
