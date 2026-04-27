// Lightweight Web Speech API wrapper with chunked queue + global settings.

const VOICE_LS = "doclens.tts.voice";
const RATE_LS = "doclens.tts.rate";
const PITCH_LS = "doclens.tts.pitch";

export function getTtsVoice(): string {
  if (typeof window === "undefined") return "";
  return localStorage.getItem(VOICE_LS) ?? "";
}
export function setTtsVoice(v: string) {
  localStorage.setItem(VOICE_LS, v);
}
export function getTtsRate(): number {
  if (typeof window === "undefined") return 1;
  const v = parseFloat(localStorage.getItem(RATE_LS) ?? "1");
  return Number.isFinite(v) ? v : 1;
}
export function setTtsRate(v: number) {
  localStorage.setItem(RATE_LS, String(v));
}
export function getTtsPitch(): number {
  if (typeof window === "undefined") return 1;
  const v = parseFloat(localStorage.getItem(PITCH_LS) ?? "1");
  return Number.isFinite(v) ? v : 1;
}
export function setTtsPitch(v: number) {
  localStorage.setItem(PITCH_LS, String(v));
}

export function listVoices(): SpeechSynthesisVoice[] {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) return [];
  return window.speechSynthesis.getVoices();
}

export function isTtsSupported(): boolean {
  return typeof window !== "undefined" && "speechSynthesis" in window;
}

function chunkText(text: string, max = 220): string[] {
  const cleaned = text.replace(/\s+/g, " ").trim();
  if (!cleaned) return [];
  if (cleaned.length <= max) return [cleaned];
  const chunks: string[] = [];
  const sentences = cleaned.split(/(?<=[.?!])\s+/);
  let buf = "";
  for (const s of sentences) {
    if (s.length > max) {
      if (buf) { chunks.push(buf); buf = ""; }
      for (let i = 0; i < s.length; i += max) chunks.push(s.slice(i, i + max));
      continue;
    }
    if (buf.length + s.length + 1 > max) {
      chunks.push(buf);
      buf = s;
    } else {
      buf = buf ? buf + " " + s : s;
    }
  }
  if (buf) chunks.push(buf);
  return chunks;
}

export interface TtsController {
  play: () => void;
  pause: () => void;
  resume: () => void;
  stop: () => void;
}

let activeOwner: symbol | null = null;
const listeners = new Set<() => void>();

export function onActiveOwnerChange(cb: () => void) {
  listeners.add(cb);
  return () => listeners.delete(cb);
}
function notify() {
  listeners.forEach((l) => l());
}
export function getActiveOwner(): symbol | null {
  return activeOwner;
}

/** Stop any active playback (used on page change / re-run). */
export function stopAll() {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
  window.speechSynthesis.cancel();
  activeOwner = null;
  notify();
}

export function createTtsController(text: string, opts: {
  onState: (s: "idle" | "playing" | "paused" | "ended") => void;
  onError?: (err: string) => void;
}): TtsController {
  const owner = Symbol("tts");
  const synth = typeof window !== "undefined" ? window.speechSynthesis : null;

  return {
    play: () => {
      if (!synth) return;
      synth.cancel();
      activeOwner = owner;
      notify();
      const chunks = chunkText(text);
      if (chunks.length === 0) {
        opts.onState("ended");
        return;
      }
      const voiceName = getTtsVoice();
      const rate = getTtsRate();
      const pitch = getTtsPitch();
      const voices = synth.getVoices();
      const voice = voices.find((v) => v.name === voiceName) ?? null;
      let i = 0;
      const speakNext = () => {
        if (activeOwner !== owner) return;
        if (i >= chunks.length) {
          opts.onState("ended");
          activeOwner = null;
          notify();
          return;
        }
        const u = new SpeechSynthesisUtterance(chunks[i++]);
        if (voice) u.voice = voice;
        u.rate = rate;
        u.pitch = pitch;
        u.onend = speakNext;
        u.onerror = (e) => {
          if (e.error !== "interrupted" && e.error !== "canceled") {
            opts.onError?.(e.error);
          }
        };
        synth.speak(u);
      };
      opts.onState("playing");
      speakNext();
    },
    pause: () => {
      if (!synth || activeOwner !== owner) return;
      synth.pause();
      opts.onState("paused");
    },
    resume: () => {
      if (!synth || activeOwner !== owner) return;
      synth.resume();
      opts.onState("playing");
    },
    stop: () => {
      if (!synth) return;
      if (activeOwner === owner) {
        synth.cancel();
        activeOwner = null;
        notify();
      }
      opts.onState("idle");
    },
  };
}
