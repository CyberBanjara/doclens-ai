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

/* ============================================================
 * Local neural TTS (Piper via @mintplex-labs/piper-tts-web)
 * Lazy-loaded only on first use. Falls back to speechSynthesis
 * when no piper voice is installed for the requested language.
 * ============================================================ */

const ENGINE_PREF_LS = "doclens.tts.engine"; // "auto" | "neural" | "browser"

export type TtsEngine = "auto" | "neural" | "browser";

export function getTtsEngine(): TtsEngine {
  if (typeof window === "undefined") return "auto";
  const v = localStorage.getItem(ENGINE_PREF_LS);
  return v === "neural" || v === "browser" ? v : "auto";
}
export function setTtsEngine(e: TtsEngine) {
  localStorage.setItem(ENGINE_PREF_LS, e);
}

/** Map UI language label to a Piper country_code prefix (e.g. "Hindi" → unsupported, "English" → "en"). */
function piperLangPrefix(language?: string | null): string {
  const k = langKey(language).split("-")[0].toLowerCase();
  return k;
}

type PiperModule = typeof import("@mintplex-labs/piper-tts-web");
let piperPromise: Promise<PiperModule> | null = null;
function loadPiper(): Promise<PiperModule> {
  if (!piperPromise) {
    piperPromise = import("@mintplex-labs/piper-tts-web");
  }
  return piperPromise;
}

export interface PiperVoiceMeta {
  voiceId: string;
  language: string; // country code like en_US
  langName: string; // english name
  quality: string;
  installed: boolean;
}

/** List all available Piper voices (from CDN catalog) merged with installed state. */
export async function listPiperVoices(installedIds: string[]): Promise<PiperVoiceMeta[]> {
  const mod = await loadPiper();
  const installed = new Set(installedIds);
  const all = await mod.voices();
  return all
    .map((v) => ({
      voiceId: String(v.key),
      language: v.language?.code ?? "",
      langName: v.language?.name_english ?? "",
      quality: String(v.quality ?? ""),
      installed: installed.has(String(v.key)),
    }))
    .sort((a, b) => a.voiceId.localeCompare(b.voiceId));
}

export async function downloadPiperVoice(
  voiceId: string,
  onProgress?: (loaded: number, total: number) => void,
): Promise<void> {
  const mod = await loadPiper();
  await mod.download(voiceId as never, (p) => onProgress?.(p.loaded, p.total));
}

export async function removePiperVoice(voiceId: string): Promise<void> {
  const mod = await loadPiper();
  await mod.remove(voiceId as never);
}

export async function listInstalledPiperVoices(): Promise<string[]> {
  const mod = await loadPiper();
  return (await mod.stored()) as string[];
}

/** Best installed piper voice for a language, or null. */
function pickPiperVoiceFor(language: string | null | undefined, installed: string[], preferred?: string | null): string | null {
  if (preferred && installed.includes(preferred)) return preferred;
  const code = piperLangPrefix(language);
  // installed voiceIds look like "en_US-amy-low"
  const match = installed.find((id) => id.toLowerCase().startsWith(code + "_"));
  return match ?? null;
}

/* ---------- Neural utterance playback ---------- */

async function speakWithPiper(opts: {
  text: string;
  voiceId: string;
  rate: number;
  signal: AbortSignal;
  onState: (s: "playing" | "ended") => void;
}): Promise<void> {
  const mod = await loadPiper();
  const chunks = chunkText(opts.text, 280);
  opts.onState("playing");
  const audio = new Audio();
  audio.playbackRate = Math.max(0.25, Math.min(4, opts.rate));
  const cleanup: { url: string | null } = { url: null };
  const stop = () => {
    audio.pause();
    if (cleanup.url) URL.revokeObjectURL(cleanup.url);
  };
  opts.signal.addEventListener("abort", stop, { once: true });
  for (const c of chunks) {
    if (opts.signal.aborted) break;
    const blob = await mod.predict({ text: c, voiceId: opts.voiceId as never });
    if (opts.signal.aborted) break;
    if (cleanup.url) URL.revokeObjectURL(cleanup.url);
    cleanup.url = URL.createObjectURL(blob);
    audio.src = cleanup.url;
    await new Promise<void>((resolve) => {
      const onEnd = () => { audio.removeEventListener("ended", onEnd); audio.removeEventListener("error", onEnd); resolve(); };
      audio.addEventListener("ended", onEnd);
      audio.addEventListener("error", onEnd);
      void audio.play().catch(() => resolve());
    });
  }
  if (cleanup.url) URL.revokeObjectURL(cleanup.url);
  opts.onState("ended");
}

/**
 * Create a controller that tries neural first (if a matching installed voice exists
 * and engine pref ≠ "browser"), and falls back to speechSynthesis otherwise.
 */
export function createSmartTtsController(text: string, opts: {
  onState: (s: "idle" | "playing" | "paused" | "ended") => void;
  onError?: (err: string) => void;
  language?: string | null;
}): TtsController {
  let mode: "neural" | "browser" = "browser";
  let abort: AbortController | null = null;
  let browserCtrl: TtsController | null = null;
  let destroyed = false;
  const enginePref = getTtsEngine();

  const startBrowser = () => {
    mode = "browser";
    browserCtrl = createTtsController(text, opts);
    browserCtrl.play();
  };

  return {
    play: () => {
      if (destroyed) return;
      if (enginePref === "browser") { startBrowser(); return; }
      // try neural
      (async () => {
        try {
          const installed = await listInstalledPiperVoices();
          const preferred = localStorage.getItem("doclens.piper.preferredVoice");
          const v = pickPiperVoiceFor(opts.language, installed, preferred);
          if (!v && enginePref === "neural") {
            opts.onError?.("No neural voice installed for this language.");
            opts.onState("idle");
            return;
          }
          if (!v) { startBrowser(); return; }
          mode = "neural";
          abort = new AbortController();
          await speakWithPiper({
            text,
            voiceId: v,
            rate: getTtsRate(),
            signal: abort.signal,
            onState: (s) => opts.onState(s),
          });
        } catch (e) {
          if (enginePref === "neural") {
            opts.onError?.(e instanceof Error ? e.message : "Neural TTS failed");
            opts.onState("idle");
          } else {
            startBrowser();
          }
        }
      })();
    },
    pause: () => {
      if (mode === "browser") browserCtrl?.pause();
      // neural pause not supported — treat as stop
      else { abort?.abort(); opts.onState("paused"); }
    },
    resume: () => {
      if (mode === "browser") browserCtrl?.resume();
    },
    stop: () => {
      if (mode === "browser") browserCtrl?.stop();
      else { abort?.abort(); opts.onState("idle"); }
    },
    destroy: () => {
      destroyed = true;
      browserCtrl?.destroy();
      abort?.abort();
    },
  };
}
