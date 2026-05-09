// Lightweight Web Speech API wrapper with per-language voice mapping,
// favorites, chunked queue, and global rate/pitch settings.

const VOICE_LEGACY_LS = "doclens.tts.voice"; // legacy single-voice setting
const VOICE_MAP_LS = "doclens.tts.voiceMap"; // per-language voice map
const FAVS_LS = "doclens.tts.favorites";     // favorited voice names
const RATE_LS = "doclens.tts.rate";
const PITCH_LS = "doclens.tts.pitch";

/* ---------- rate / pitch ---------- */

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

/* ---------- voice map (per-language) ---------- */

function readMap(): Record<string, string> {
  if (typeof window === "undefined") return {};
  try {
    const raw = localStorage.getItem(VOICE_MAP_LS);
    if (raw) return JSON.parse(raw) as Record<string, string>;
  } catch { /* ignore */ }
  // migrate legacy single-voice
  const legacy = localStorage.getItem(VOICE_LEGACY_LS);
  if (legacy) return { __default: legacy };
  return {};
}
function writeMap(m: Record<string, string>) {
  localStorage.setItem(VOICE_MAP_LS, JSON.stringify(m));
}

/** Normalize a UI language label to a BCP-47-ish key (e.g. "English" → "en"). */
export function langKey(language?: string | null): string {
  if (!language) return "__default";
  const l = language.trim().toLowerCase();
  const map: Record<string, string> = {
    english: "en", arabic: "ar", french: "fr", hindi: "hi",
    spanish: "es", japanese: "ja", german: "de", italian: "it",
    portuguese: "pt", russian: "ru", chinese: "zh", korean: "ko",
    turkish: "tr", dutch: "nl",
  };
  if (map[l]) return map[l];
  // already a code like "en" or "en-US"
  if (/^[a-z]{2}(-[a-z0-9]+)?$/i.test(l)) return l.toLowerCase();
  return l;
}

export function getTtsVoiceFor(language?: string | null): string {
  const key = langKey(language);
  const m = readMap();
  return m[key] ?? m.__default ?? "";
}
export function setTtsVoiceFor(language: string | null | undefined, voiceName: string) {
  const key = langKey(language);
  const m = readMap();
  if (voiceName) m[key] = voiceName;
  else delete m[key];
  writeMap(m);
}

/** Backwards-compat: global default voice. */
export function getTtsVoice(): string {
  return getTtsVoiceFor(null);
}
export function setTtsVoice(v: string) {
  setTtsVoiceFor(null, v);
}

/* ---------- favorites ---------- */

function readFavs(): Set<string> {
  if (typeof window === "undefined") return new Set();
  try {
    const raw = localStorage.getItem(FAVS_LS);
    if (raw) return new Set(JSON.parse(raw) as string[]);
  } catch { /* ignore */ }
  return new Set();
}
function writeFavs(s: Set<string>) {
  localStorage.setItem(FAVS_LS, JSON.stringify(Array.from(s)));
}
export function getFavorites(): string[] {
  return Array.from(readFavs());
}
export function isFavorite(voiceName: string): boolean {
  return readFavs().has(voiceName);
}
export function toggleFavorite(voiceName: string): boolean {
  const s = readFavs();
  if (s.has(voiceName)) s.delete(voiceName);
  else s.add(voiceName);
  writeFavs(s);
  return s.has(voiceName);
}

/* ---------- voices ---------- */

export function listVoices(): SpeechSynthesisVoice[] {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) return [];
  return window.speechSynthesis.getVoices();
}

export function isTtsSupported(): boolean {
  return typeof window !== "undefined" && "speechSynthesis" in window;
}

/** Voices whose `lang` matches the given language key (loose match: prefix). */
export function voicesForLanguage(language?: string | null): SpeechSynthesisVoice[] {
  const key = langKey(language);
  if (key === "__default") return listVoices();
  const code = key.split("-")[0].toLowerCase();
  return listVoices().filter((v) => v.lang.toLowerCase().startsWith(code));
}

/* ---------- speech ---------- */

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
  /** Cancel any pending speech and release the internal utterance reference. */
  destroy: () => void;
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
  /** Language for voice selection (UI label or BCP-47). */
  language?: string | null;
}): TtsController {
  const owner = Symbol("tts");
  const synth = typeof window !== "undefined" ? window.speechSynthesis : null;
  let currentUtter: SpeechSynthesisUtterance | null = null;
  let destroyed = false;

  return {
    play: () => {
      if (!synth || destroyed) return;
      synth.cancel();
      activeOwner = owner;
      notify();
      const chunks = chunkText(text);
      if (chunks.length === 0) {
        opts.onState("ended");
        return;
      }
      const voiceName = getTtsVoiceFor(opts.language);
      const rate = getTtsRate();
      const pitch = getTtsPitch();
      const voices = synth.getVoices();
      let voice = voices.find((v) => v.name === voiceName) ?? null;
      if (!voice && opts.language) {
        const code = langKey(opts.language).split("-")[0];
        voice = voices.find((v) => v.lang.toLowerCase().startsWith(code)) ?? null;
      }
      let i = 0;
      const speakNext = () => {
        if (destroyed || activeOwner !== owner) return;
        if (i >= chunks.length) {
          currentUtter = null;
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
        currentUtter = u;
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
      if (!synth || destroyed || activeOwner !== owner) return;
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
      currentUtter = null;
      opts.onState("idle");
    },
    destroy: () => {
      destroyed = true;
      if (synth && activeOwner === owner) {
        synth.cancel();
        activeOwner = null;
        notify();
      }
      currentUtter = null;
    },
  };
}
