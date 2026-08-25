import { isNetworkError, OFFLINE_MESSAGE } from "./network";

declare const __OPENROUTER_DEFAULT_KEY__: string | undefined;
declare const __OPENROUTER_DEFAULT_MODEL__: string | undefined;



/** Rough heuristic: 1 token ≈ 4 characters of English text. */
export function estimateTokens(text: string): number {
  if (!text) return 0;
  return Math.ceil(text.length / 4);
}

export interface ORModel {
  id: string;
  name: string;
  context_length: number;
  pricing?: { prompt?: string; completion?: string };
  description?: string;
  top_provider?: { context_length?: number };
}

const MODEL_LS = "doclens.openrouter.model";
const LANG_LS = "doclens.outputLanguage";
const MODE_LS = "doclens.mode";
const STYLE_LS = "doclens.style";
const TEMP_LS = "doclens.temperature";
const KEY_STATUS_LS = "doclens.openrouter.keyStatus";
const KEY_CHANGE_EVT = "doclens:openrouter-key-change";
export const OPEN_API_KEY_MODAL_EVT = "doclens:open-api-key-modal";
const CUSTOM_KEY_LS = "doclens.openrouter.customKey";
const GLOBAL_KEY_LS = "doclens.openrouter.globalKey";

export type KeyStatus = "missing" | "valid" | "invalid" | "unknown";

function emitKeyChange() {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event(KEY_CHANGE_EVT));
  }
}

export function getCustomKey(): string {
  if (typeof window === "undefined") return "";
  return localStorage.getItem(CUSTOM_KEY_LS) ?? "";
}

export function setCustomKey(k: string) {
  if (typeof window === "undefined") return;
  if (k) {
    localStorage.setItem(CUSTOM_KEY_LS, k.trim());
  } else {
    localStorage.removeItem(CUSTOM_KEY_LS);
  }
  emitKeyChange();
}

export function getGlobalKey(): string {
  if (typeof window === "undefined") return "";
  return localStorage.getItem(GLOBAL_KEY_LS) ?? "";
}

export function setGlobalKey(k: string) {
  if (typeof window === "undefined") return;
  if (k) {
    localStorage.setItem(GLOBAL_KEY_LS, k.trim());
  } else {
    localStorage.removeItem(GLOBAL_KEY_LS);
  }
  emitKeyChange();
}

export function getDefaultKey(): string {
  try {
    if (typeof __OPENROUTER_DEFAULT_KEY__ !== "undefined" && __OPENROUTER_DEFAULT_KEY__) {
      return __OPENROUTER_DEFAULT_KEY__.trim();
    }
  } catch {
    // Ignore ReferenceError if not defined
  }
  if (typeof import.meta !== "undefined" && (import.meta as any).env?.VITE_OPENROUTER_API_KEY) {
    return (import.meta as any).env.VITE_OPENROUTER_API_KEY.trim();
  }
  if (typeof import.meta !== "undefined" && (import.meta as any).env?.OPENROUTER_API_KEY) {
    return (import.meta as any).env.OPENROUTER_API_KEY.trim();
  }
  if (typeof process !== "undefined" && process.env?.OPENROUTER_API_KEY) {
    return process.env.OPENROUTER_API_KEY.trim();
  }
  if (typeof process !== "undefined" && process.env?.VITE_OPENROUTER_API_KEY) {
    return process.env.VITE_OPENROUTER_API_KEY.trim();
  }
  return "";
}

/** Synchronously returns active key: custom user key -> global stored key -> built-in environment key. */
export function getKey(): string {
  return getCustomKey() || getGlobalKey() || getDefaultKey();
}

export function getKeyStatus(): KeyStatus {
  if (typeof window === "undefined") return "unknown";
  const v = localStorage.getItem(KEY_STATUS_LS);
  if (v === "valid" || v === "invalid" || v === "missing") {
    if (v === "missing" && getKey()) return "valid";
    return v as KeyStatus;
  }
  return getKey() ? "valid" : "missing";
}


export function setKeyStatus(s: KeyStatus): void {
  if (typeof window === "undefined") return;
  if (s === "unknown") localStorage.removeItem(KEY_STATUS_LS);
  else localStorage.setItem(KEY_STATUS_LS, s);
  emitKeyChange();
}

export const DAILY_LIMIT_HOOK_MESSAGE =
  "You've used your 50 free pages for today! 🚀 Continue reading without interruption by using your own free OpenRouter API key to unlock another 50 free pages every day for free.";

export interface OpenApiKeyModalDetail {
  reason?: string;
  isDailyLimit?: boolean;
}

/** Subscribe to any key/status change (cross-tab + in-tab). */
export function onKeyChange(cb: () => void): () => void {
  if (typeof window === "undefined") return () => {};
  const h = () => cb();
  window.addEventListener(KEY_CHANGE_EVT, h);
  window.addEventListener("storage", h);
  return () => {
    window.removeEventListener(KEY_CHANGE_EVT, h);
    window.removeEventListener("storage", h);
  };
}

/** Ask the app to open the API key modal (mounted in __root.tsx). */
export function openApiKeyModal(
  reasonOrDetail?: string | OpenApiKeyModalDetail,
  isDailyLimit?: boolean,
): void {
  if (typeof window === "undefined") return;
  let detail: OpenApiKeyModalDetail;
  if (typeof reasonOrDetail === "object" && reasonOrDetail !== null) {
    detail = reasonOrDetail;
  } else {
    const isDaily =
      isDailyLimit ||
      (reasonOrDetail
        ? /50 free pages|daily limit|daily free limit|rate limit|too many requests|free tier/i.test(
            reasonOrDetail,
          )
        : false);
    detail = {
      reason: reasonOrDetail,
      isDailyLimit: isDaily,
    };
  }
  window.dispatchEvent(new CustomEvent(OPEN_API_KEY_MODAL_EVT, { detail }));
}

export function getSelectedModel(): string {
  if (typeof window === "undefined") return "";
  return localStorage.getItem(MODEL_LS) ?? "";
}

export function setSelectedModel(id: string) {
  localStorage.setItem(MODEL_LS, id);
}

export function getDefaultModelSync(): string {
  try {
    if (typeof __OPENROUTER_DEFAULT_MODEL__ !== "undefined" && __OPENROUTER_DEFAULT_MODEL__) {
      return __OPENROUTER_DEFAULT_MODEL__.trim();
    }
  } catch {
    // Ignore ReferenceError if not defined
  }
  if (typeof import.meta !== "undefined" && (import.meta as any).env?.VITE_OPENROUTER_DEFAULT_MODEL) {
    return (import.meta as any).env.VITE_OPENROUTER_DEFAULT_MODEL.trim();
  }
  if (typeof import.meta !== "undefined" && (import.meta as any).env?.OPENROUTER_DEFAULT_MODEL) {
    return (import.meta as any).env.OPENROUTER_DEFAULT_MODEL.trim();
  }
  if (typeof process !== "undefined" && process.env?.OPENROUTER_DEFAULT_MODEL) {
    return process.env.OPENROUTER_DEFAULT_MODEL.trim();
  }
  if (typeof process !== "undefined" && process.env?.VITE_OPENROUTER_DEFAULT_MODEL) {
    return process.env.VITE_OPENROUTER_DEFAULT_MODEL.trim();
  }
  return CURATED_MODELS[0]?.id || "liquid/lfm-2.5-2.6b:free";
}

export async function getDefaultModel(): Promise<string> {
  return getDefaultModelSync();
}

export async function getEffectiveSelectedModel(): Promise<string> {
  return getSelectedModel() || getDefaultModelSync();
}

export function getOutputLanguage(): string {
  if (typeof window === "undefined") return "हिंदी";
  return localStorage.getItem(LANG_LS) ?? "हिंदी";
}

export function setOutputLanguage(lang: string) {
  localStorage.setItem(LANG_LS, lang);
}

function hasStoredValue(key: string): boolean {
  if (typeof window === "undefined") return false;
  return (localStorage.getItem(key)?.trim() ?? "") !== "";
}

export type GlobalMode = "translate" | "explain";

function normalizeMode(v: string | null): GlobalMode {
  if (v === "translate") return "translate";
  return "explain";
}

export function getMode(): GlobalMode {
  if (typeof window === "undefined") return "explain";
  return normalizeMode(localStorage.getItem(MODE_LS));
}

export function setMode(m: GlobalMode) {
  localStorage.setItem(MODE_LS, m);
}

export function getStyle(mode?: GlobalMode): ProcessingStyle {
  if (typeof window === "undefined") return "Standard";
  const activeMode = mode ?? getMode();
  const v = localStorage.getItem(STYLE_LS);
  if (!v) return activeMode === "translate" ? "Native" : "Standard";
  if (activeMode === "translate") {
    if (TRANSLATION_STYLES.some((s) => s.id === v)) return v as TranslationStyle;
    return "Native";
  }
  if (EXPLANATION_STYLES.some((s) => s.id === v)) return v as ExplanationStyle;
  const mapped = LEGACY_STYLE_MAP[v];
  if (mapped) {
    localStorage.setItem(STYLE_LS, mapped);
    return mapped;
  }
  return "Standard";
}

export function setStyle(s: ProcessingStyle | string) {
  localStorage.setItem(STYLE_LS, s);
}

export function hasCompletedAiPreferenceSetup(): boolean {
  if (typeof window === "undefined") return false;
  const rawMode = localStorage.getItem(MODE_LS);
  const mode = normalizeMode(rawMode);
  const hasMode = rawMode === "translate" || rawMode === "explain";
  const hasLanguage = hasStoredValue(LANG_LS);
  const currentStyle = getStyle(mode);
  const hasValidStyle =
    mode === "translate"
      ? TRANSLATION_STYLES.some((s) => s.id === currentStyle)
      : EXPLANATION_STYLES.some((s) => s.id === currentStyle);

  return hasMode && hasLanguage && hasValidStyle;
}

export function getTemperature(): number {
  if (typeof window === "undefined") return 0.3;
  const v = parseFloat(localStorage.getItem(TEMP_LS) ?? "0.3");
  return Number.isFinite(v) ? v : 0.3;
}

export function setTemperature(t: number) {
  localStorage.setItem(TEMP_LS, String(t));
}

/** The user's global AI defaults, as persisted in localStorage. */
export interface Globals {
  mode: GlobalMode;
  language: string;
  modelId: string;
  style: string;
  temperature: number;
}

export function readGlobals(): Globals {
  const mode = getMode();
  return {
    mode,
    language: getOutputLanguage(),
    modelId: getSelectedModel() || getDefaultModelSync(),
    style: getStyle(mode),
    temperature: getTemperature(),
  };
}

/** Synchronous/instant read of effective globals. */
export async function readEffectiveGlobals(): Promise<Globals> {
  return readGlobals();
}

export interface TranslationConfig {
  language: string;
  mode: GlobalMode;
  modelId: string;
  style: ProcessingStyle | string;
  temperature: number;
}

export function getTranslationConfig(): TranslationConfig {
  const mode = getMode();
  return {
    language: getOutputLanguage(),
    mode,
    modelId: getSelectedModel() || getDefaultModelSync(),
    style: getStyle(mode),
    temperature: getTemperature(),
  };
}

export function applyTranslationConfig(config: Partial<TranslationConfig>, docId?: string): void {
  if (typeof window === "undefined") return;

  if (config.language) {
    setOutputLanguage(config.language);
  }
  if (config.mode) {
    setMode(config.mode);
  }
  if (config.modelId) {
    setSelectedModel(config.modelId);
  }
  if (config.style) {
    setStyle(config.style);
  }
  if (typeof config.temperature === "number" && !isNaN(config.temperature)) {
    setTemperature(config.temperature);
  }

  if (docId) {
    localStorage.setItem(`doclens.explain.setup.${docId}`, "1");
  }
}

const HEADERS_BASE = {
  "HTTP-Referer": typeof window !== "undefined" ? window.location.origin : "https://doclens.ai",
  "X-Title": "Doclens AI",
};

/** Direct sync function that resolves the active OpenRouter key from runtime environment or storage. */
export async function syncGlobalKey(): Promise<string> {
  const k = getKey();
  if (k) {
    setKeyStatus("valid");
  } else {
    setKeyStatus("missing");
  }
  return k;
}

/** Validates key directly from the browser with OpenRouter's auth API. */
export async function validateKey(key?: string): Promise<boolean> {
  try {
    const effectiveKey = key && key.trim() ? key.trim() : getKey();
    if (!effectiveKey) {
      setKeyStatus("missing");
      return false;
    }

    const res = await fetch("https://openrouter.ai/api/v1/auth/key", {
      headers: { Authorization: `Bearer ${effectiveKey}`, ...HEADERS_BASE },
    });
    const status: KeyStatus = res.ok ? "valid" : "invalid";
    setKeyStatus(status);
    return status === "valid";
  } catch (err) {
    if (isNetworkError(err)) {
      setKeyStatus("unknown");
      return false;
    }
    setKeyStatus("unknown");
    return false;
  }
}

export const CURATED_MODELS: ORModel[] = [
  {
    id: "liquid/lfm-2.5-2.6b:free",
    name: "Liquid LFM 2.5 (Free, Ultra Fast)",
    context_length: 32768,
    description: "Liquid AI's highly efficient neural architecture optimized for rapid reasoning and streaming.",
  },
  {
    id: "google/gemini-2.0-flash-exp:free",
    name: "Gemini 2.0 Flash (Free, Fast)",
    context_length: 1048576,
    description: "Next-gen multimodal model by Google with near-instant streaming.",
  },
  {
    id: "meta-llama/llama-3.3-70b-instruct:free",
    name: "Llama 3.3 70B Instruct (Free)",
    context_length: 131072,
    description: "Meta's flagship 70B model with exceptional reasoning and translation quality.",
  },
  {
    id: "anthropic/claude-3.5-sonnet",
    name: "Claude 3.5 Sonnet",
    context_length: 200000,
    description: "Anthropic's state-of-the-art model for nuanced explanations and reading comprehension.",
  },
  {
    id: "openai/gpt-4o-mini",
    name: "GPT-4o Mini",
    context_length: 128000,
    description: "OpenAI's high-speed, affordable powerhouse for document workflows.",
  },
  {
    id: "deepseek/deepseek-chat",
    name: "DeepSeek V3",
    context_length: 64000,
    description: "Top-tier open weights model with strong multilingual fluency.",
  },
];

/** Fetches available models directly from OpenRouter API without server proxy. */
export async function fetchModels(key?: string): Promise<ORModel[]> {
  const effectiveKey = key ? key.trim() : getKey();
  try {
    const headers: Record<string, string> = { ...HEADERS_BASE };
    if (effectiveKey) headers["Authorization"] = `Bearer ${effectiveKey}`;
    const res = await fetch("https://openrouter.ai/api/v1/models", {
      headers,
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) return CURATED_MODELS;
    const json = await res.json();
    const data = (json?.data as any[]) || [];
    if (!Array.isArray(data) || data.length === 0) return CURATED_MODELS;
    return data.map((m) => ({
      id: m.id,
      name: m.name || m.id,
      context_length: m.context_length || 8192,
      pricing: m.pricing,
      description: m.description,
      top_provider: m.top_provider,
    }));
  } catch {
    return CURATED_MODELS;
  }
}

export type OpenRouterErrorKind =
  | "auth"
  | "credits"
  | "rate_limit"
  | "daily_limit"
  | "quota"
  | "server"
  | "network"
  | "unknown";

export class OpenRouterError extends Error {
  status: number;
  kind: OpenRouterErrorKind;
  constructor(message: string, status = 0, kind: OpenRouterErrorKind = "unknown") {
    super(message);
    this.name = "OpenRouterError";
    this.status = status;
    this.kind = kind;
  }
}

export function friendlyOpenRouterError(
  status: number,
  body: string,
  isCustomKey: boolean,
): OpenRouterError {
  const isDailyOrRateLimit =
    status === 429 ||
    /rate limit|daily limit|free limit|free tier|quota|exceeded|too many requests/i.test(body);

  if (status === 401) {
    return new OpenRouterError(
      isCustomKey
        ? "Your OpenRouter API key was rejected (401). Please check the key in settings."
        : "OpenRouter authentication failed (401). Please configure a valid API key in settings.",
      401,
      "auth",
    );
  }
  if (status === 403)
    return new OpenRouterError(
      "OpenRouter rejected access to this model with the current key. Please select a different model in settings.",
      403,
      "auth",
    );
  if (status === 402) {
    if (!isCustomKey) {
      return new OpenRouterError(DAILY_LIMIT_HOOK_MESSAGE, 402, "daily_limit");
    }
    return new OpenRouterError(
      "OpenRouter account is out of credits. Switch to a free model in settings or add credits.",
      402,
      "credits",
    );
  }
  if (isDailyOrRateLimit) {
    if (!isCustomKey) {
      return new OpenRouterError(DAILY_LIMIT_HOOK_MESSAGE, status || 429, "daily_limit");
    }
    return new OpenRouterError(
      "You've reached the free daily limit (50 requests/day) for this OpenRouter key. Add credits on OpenRouter or switch models to continue reading!",
      status || 429,
      "rate_limit",
    );
  }
  if (status >= 500)
    return new OpenRouterError(
      "OpenRouter service is temporarily unavailable. Please retry shortly.",
      status,
      "server",
    );
  const snippet = body.replace(/\s+/g, " ").trim().slice(0, 160);
  return new OpenRouterError(
    `Request failed (${status})${snippet ? `: ${snippet}` : "."}`,
    status,
    "unknown",
  );
}

/** Default timeout for a streaming completion request (ms). */
const STREAM_TIMEOUT_MS = 60_000;
/** Max retries on transient network/server hiccups. */
const MAX_RETRIES = 1;

export interface StreamOpts {
  key?: string;
  /** Full payload sent to OpenRouter — must include `model`, `messages`, `stream: true`. */
  payload: Record<string, unknown>;
  signal?: AbortSignal;
  onDelta: (text: string) => void;
  /** Override default timeout (ms). */
  timeoutMs?: number;
}

function combinedSignal(
  userSignal: AbortSignal | undefined,
  timeoutMs: number,
): { signal: AbortSignal; cleanup: () => void } {
  const timeout = AbortSignal.timeout(timeoutMs);
  if (!userSignal) return { signal: timeout, cleanup: () => {} };
  if (typeof AbortSignal.any === "function") {
    return { signal: AbortSignal.any([userSignal, timeout]), cleanup: () => {} };
  }
  const ctrl = new AbortController();
  const onAbort = () => ctrl.abort();
  userSignal.addEventListener("abort", onAbort, { once: true });
  timeout.addEventListener("abort", onAbort, { once: true });
  return {
    signal: ctrl.signal,
    cleanup: () => {
      userSignal.removeEventListener("abort", onAbort);
      timeout.removeEventListener("abort", onAbort);
    },
  };
}

/**
 * High-speed SSE stream parser for OpenAI/OpenRouter chat completion responses.
 * Fires `onDelta` synchronously as each text chunk arrives and extracts reasoning/content.
 */
async function readSseStream(
  body: ReadableStream<Uint8Array>,
  onDelta: (text: string) => void,
  signal: AbortSignal,
  isCustomKey: boolean,
): Promise<number> {
  const reader = body.getReader();
  const decoder = new TextDecoder("utf-8");
  let buffer = "";
  let emittedTokens = 0;

  const onAbort = () => {
    reader.cancel().catch(() => {});
  };
  signal.addEventListener("abort", onAbort, { once: true });

  const processLine = (line: string) => {
    if (!line || line.startsWith(":")) return;
    if (line.startsWith("data:")) {
      const payload = line.slice(5).trim();
      if (payload === "[DONE]") return;
      try {
        const parsed = JSON.parse(payload);
        if (parsed?.error) {
          const errMsg =
            typeof parsed.error === "string"
              ? parsed.error
              : parsed.error.message || "Model streaming error";
          const errCode = typeof parsed.error === "object" ? parsed.error.code : undefined;
          const statusNum = typeof errCode === "number" ? errCode : 500;
          throw friendlyOpenRouterError(statusNum, errMsg, isCustomKey);
        }
        const delta =
          parsed?.choices?.[0]?.delta?.content ??
          parsed?.choices?.[0]?.delta?.text ??
          parsed?.choices?.[0]?.text ??
          "";
        if (typeof delta === "string" && delta.length > 0) {
          emittedTokens += delta.length;
          onDelta(delta);
        }
      } catch (err) {
        if (err instanceof OpenRouterError) throw err;
      }
    }
  };

  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) {
        if (buffer.trim()) {
          const remainingLines = buffer.split("\n");
          for (const l of remainingLines) {
            processLine(l.trim());
          }
        }
        break;
      }
      buffer += decoder.decode(value, { stream: true });

      let lineEndIndex: number;
      while ((lineEndIndex = buffer.indexOf("\n")) !== -1) {
        const line = buffer.slice(0, lineEndIndex).trim();
        buffer = buffer.slice(lineEndIndex + 1);
        processLine(line);
      }
    }
    return emittedTokens;
  } finally {
    signal.removeEventListener("abort", onAbort);
  }
}

/**
 * Direct client-side streaming completion to OpenRouter API.
 * Bypasses all server middleware for minimal round-trip latency and instant UI streaming.
 */
export async function streamCompletion(opts: StreamOpts): Promise<void> {
  const { signal, cleanup } = combinedSignal(opts.signal, opts.timeoutMs ?? STREAM_TIMEOUT_MS);
  const resolvedKey = opts.key || getKey();
  const isCustomKey = !!getCustomKey();

  if (!resolvedKey) {
    cleanup();
    const err = new OpenRouterError("No OpenRouter API key configured.", 401, "auth");
    setKeyStatus("missing");
    throw err;
  }

  try {
    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      if (signal.aborted) throw new DOMException("Aborted", "AbortError");

      let response: Response;
      try {
        response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${resolvedKey}`,
            "Content-Type": "application/json",
            ...HEADERS_BASE,
          },
          body: JSON.stringify({ ...opts.payload, stream: true }),
          signal,
        });
      } catch (fetchErr: any) {
        if (signal.aborted) throw fetchErr;
        throw new OpenRouterError(fetchErr?.message || "Network error", 0, "network");
      }

      if (!response.ok) {
        const bodyText = await response.text();
        const friendly = friendlyOpenRouterError(response.status, bodyText, isCustomKey);
        if (friendly.kind === "auth") {
          setKeyStatus("invalid");
        }
        if ((response.status === 429 || response.status === 503) && attempt < MAX_RETRIES) {
          await new Promise((r) => setTimeout(r, 1000));
          continue;
        }
        throw friendly;
      }

      if (!response.body) {
        throw new OpenRouterError("OpenRouter returned an empty stream.", 502, "server");
      }

      const totalChars = await readSseStream(response.body, opts.onDelta, signal, isCustomKey);
      if (totalChars === 0 && !signal.aborted) {
        throw new OpenRouterError(
          "The model returned an empty response. Please retry or choose a different model in settings.",
          502,
          "server",
        );
      }
      return;
    }
  } finally {
    cleanup();
  }
}

/** Output formatting rules — clean plain text for reading and TTS. */
const FORMAT_RULES = [
  "Output clean plain text only. No markdown, asterisks, hashtags, code fences, backticks, emojis, decorative symbols, bullet characters, or rich formatting.",
  "Write smooth, natural sentences suitable for reading and text-to-speech. Avoid robotic phrasing and repetition.",
].join(" ");

const EXPLAIN_RULES = [
  "Preserve factual accuracy — never invent information not in the source. Preserve technical terms, explaining them as appropriate for the style.",
  "Output only the final content. No preamble, meta commentary, or closing remarks.",
].join(" ");

export interface StyleSpec<T extends string = string> {
  id: T;
  label: string;
  instruction: string;
}

export type TranslationStyle = "Native" | "Mixed";
export type TranslationStyleSpec = StyleSpec<TranslationStyle>;

export const TRANSLATION_STYLES: TranslationStyleSpec[] = [
  {
    id: "Native",
    label: "Native",
    instruction:
      "Translate naturally and fluently. Preserve meaning, tone, and nuance. Do not add explanations or commentary.",
  },
  {
    id: "Mixed",
    label: "Mixed",
    instruction:
      "Translate by blending the target language with English as bilingual speakers naturally do (e.g., Hinglish for Hindi). Keep technical terms, acronyms, brand names, proper nouns, and commonly understood English words in English. The result should feel conversational and fluid, not like machine translation. Preserve original meaning and tone.",
  },
];

export type ExplanationStyle =
  | "Standard"
  | "Simple"
  | "Story"
  | "Deep"
  | "AI";

export type ExplanationStyleSpec = StyleSpec<ExplanationStyle>;

export type ProcessingStyle = ExplanationStyle | TranslationStyle;

export function getStylesForMode(mode: GlobalMode): StyleSpec[] {
  return mode === "translate" ? TRANSLATION_STYLES : EXPLANATION_STYLES;
}

/** Maps legacy style IDs to their consolidated equivalent. */
const LEGACY_STYLE_MAP: Record<string, ExplanationStyle> = {
  ELI5: "Simple",
  "Step-by-Step": "Simple",
  "Visual Thinking": "Simple",
  Analogical: "Simple",
  Practical: "Simple",
  Motivational: "Simple",
  Storytelling: "Story",
  Socratic: "Story",
  "Expert Deep-Dive": "Deep",
  Debate: "Deep",
  "Historical Context": "Deep",
  "Critical Thinking": "Deep",
  "AI Mode": "AI",
  "AI Synthesis": "AI",
};

export const EXPLANATION_STYLES: ExplanationStyleSpec[] = [
  {
    id: "Standard",
    label: "Standard",
    instruction:
      "Clear, balanced, well-organized explanations accessible to a general audience. Maintain readability and structured flow.",
  },
  {
    id: "Simple",
    label: "Simple",
    instruction:
      "Explain as if teaching a complete beginner. Avoid jargon — define technical terms in simple language when needed. " +
      "Use real-world analogies to make abstract concepts relatable. Break complex ideas into sequential steps, each building on the last. " +
      "Include practical examples. Use encouraging language that reduces intimidation.",
  },
  {
    id: "Story",
    label: "Story",
    instruction:
      "Teach through narratives, scenarios, or story-like progression. Make it emotionally engaging and memorable. " +
      "Pose thought-provoking questions before revealing conclusions. Use analogies within the narrative to anchor abstract ideas.",
  },
  {
    id: "Deep",
    label: "Deep",
    instruction:
      "Advanced technical depth with nuance, edge cases, and detailed reasoning. Assume foundational knowledge. " +
      "Present multiple viewpoints and counterarguments where warranted. Include relevant history and key discoveries. " +
      "Analyze assumptions, evaluate evidence, and highlight open questions.",
  },
  {
    id: "AI",
    label: "AI Mode",
    instruction:
      "Synthesize all page information into a holistic explanation using your own structured reasoning — not word-by-word translation. " +
      "Highlight differences and relationships between contrasting concepts. " +
      "Present ideas logically from first principles with smooth narrative flow and natural readability.",
  },
];

/** UI-facing labels for each mode. */
export const MODE_LABELS: Record<GlobalMode, string> = {
  translate: "Translate",
  explain: "Explain",
};

export interface BuildPagePayloadInput {
  modelId: string;
  mode: GlobalMode;
  language: string;
  /** Style for processing (TranslationStyle when mode is "translate", ExplanationStyle when mode is "explain"). */
  style: string;
  temperature: number;
  pageNumber: number;
  pageText: string;
}

export function buildPagePayload(i: BuildPagePayloadInput): Record<string, unknown> {
  const lang = i.language || "English";
  let system: string;

  if (i.mode === "translate") {
    const style =
      TRANSLATION_STYLES.find((s) => s.id === i.style) ?? TRANSLATION_STYLES[0];

    system = [
      "You are an expert document translator in a PDF reader.",
      "The content below is extracted from a PDF page.",
      `TASK: Translate into ${lang}.\nSTYLE: ${style.label} — ${style.instruction}`,
      "RULES: Preserve the original structure, headings, lists, and logical flow. Output only the translated text — no explanations, preamble, or commentary.",
      `FORMAT: ${FORMAT_RULES}`,
    ].join("\n\n");
  } else {
    const style =
      EXPLANATION_STYLES.find((s) => s.id === i.style) ??
      (LEGACY_STYLE_MAP[i.style] ? EXPLANATION_STYLES.find((s) => s.id === LEGACY_STYLE_MAP[i.style]) : undefined) ??
      EXPLANATION_STYLES[0];

    system = [
      "You are an AI reading assistant in a PDF reader.",
      "The content below is extracted from a PDF page.",
      `TASK: Explain in ${lang}.\nSTYLE: ${style.label} — ${style.instruction}`,
      `RULES: ${EXPLAIN_RULES}`,
      `FORMAT: ${FORMAT_RULES}`,
    ].join("\n\n");
  }

  return {
    model: i.modelId || getDefaultModelSync(),
    stream: true,
    temperature: i.temperature ?? 0.3,
    max_tokens: 4000,
    messages: [
      { role: "system", content: system },
      { role: "user", content: `--- Page ${i.pageNumber} ---\n${i.pageText}` },
    ],
  };
}
