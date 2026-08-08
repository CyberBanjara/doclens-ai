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
  if (v === "valid" || v === "invalid" || v === "missing") return v;
  return getKey() ? "valid" : "missing";
}

export function setKeyStatus(s: KeyStatus): void {
  if (typeof window === "undefined") return;
  if (s === "unknown") localStorage.removeItem(KEY_STATUS_LS);
  else localStorage.setItem(KEY_STATUS_LS, s);
  emitKeyChange();
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
export function openApiKeyModal(reason?: string): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(OPEN_API_KEY_MODAL_EVT, { detail: { reason } }));
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
  return CURATED_MODELS[0]?.id || "google/gemini-2.0-flash-exp:free";
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

export function getStyle(): ExplanationStyle {
  if (typeof window === "undefined") return "Standard";
  const v = localStorage.getItem(STYLE_LS);
  if (!v) return "Standard";
  if (EXPLANATION_STYLES.some((s) => s.id === v)) return v as ExplanationStyle;
  const mapped = LEGACY_STYLE_MAP[v];
  if (mapped) {
    localStorage.setItem(STYLE_LS, mapped);
    return mapped;
  }
  return "Standard";
}

export function setStyle(s: ExplanationStyle) {
  localStorage.setItem(STYLE_LS, s);
}

export function hasCompletedAiPreferenceSetup(): boolean {
  if (typeof window === "undefined") return false;
  const rawMode = localStorage.getItem(MODE_LS);
  const mode = normalizeMode(rawMode);
  const hasMode = rawMode === "translate" || rawMode === "explain";
  const hasLanguage = hasStoredValue(LANG_LS);
  const hasValidStyle = mode === "translate" || EXPLANATION_STYLES.some((s) => s.id === getStyle());

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
  return {
    mode: getMode(),
    language: getOutputLanguage(),
    modelId: getSelectedModel() || getDefaultModelSync(),
    style: getStyle(),
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
  style: ExplanationStyle;
  temperature: number;
}

export function getTranslationConfig(): TranslationConfig {
  return {
    language: getOutputLanguage(),
    mode: getMode(),
    modelId: getSelectedModel() || getDefaultModelSync(),
    style: getStyle(),
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
    const effectiveKey = key !== undefined ? key.trim() : getKey();
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
    id: "google/gemini-2.0-flash-exp:free",
    name: "Gemini 2.0 Flash (Free, Ultra Fast)",
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

/* -------- Friendly errors -------- */

export type OpenRouterErrorKind =
  | "auth"
  | "credits"
  | "rate_limit"
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
  if (status === 402)
    return new OpenRouterError(
      "OpenRouter account is out of credits. Switch to a free model in settings or add credits.",
      402,
      "credits",
    );
  if (status === 429)
    return new OpenRouterError(
      "OpenRouter rate limit reached. Please wait a moment and try again.",
      429,
      "rate_limit",
    );
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
          const errMsg = typeof parsed.error === "string" ? parsed.error : parsed.error.message || "Model streaming error";
          throw new OpenRouterError(errMsg, 500, "server");
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

      const totalChars = await readSseStream(response.body, opts.onDelta, signal);
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

/** Negative-generation rules for clean, natural, plain text suitable for reading and TTS. */
const NEGATIVE_RULES = [
  "Do not produce markdown syntax, asterisks, hashtags, code fences, or backticks.",
  "Do not produce emojis, decorative symbols, decorative Unicode, ASCII art, or visual separators.",
  "Do not produce bullet decoration characters, rich-text formatting, or UI styling patterns.",
  "Do not use excessive or decorative punctuation, decorative quotation styling, or heading markers.",
  "Output must be clean plain text with natural readable structure suitable for both reading and text-to-speech narration.",
  "Write smooth, natural, human-like sentences. Avoid robotic phrasing and unnecessary repetition.",
].join(" ");

const GLOBAL_RULES = [
  "Preserve factual accuracy. Never invent information not present in the source unless clearly framed as an example, analogy, or interpretation.",
  "Preserve important technical terminology, explaining it appropriately for the selected style.",
  "Process one page at a time. Output only the final processed content — no preamble, no meta commentary, no closing remarks.",
].join(" ");

export interface ExplanationStyleSpec {
  id: ExplanationStyle;
  label: string;
  instruction: string;
}

export type ExplanationStyle =
  | "Standard"
  | "Simple"
  | "Story"
  | "Deep";

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
};

export const EXPLANATION_STYLES: ExplanationStyleSpec[] = [
  {
    id: "Standard",
    label: "Standard",
    instruction:
      "Use balanced, neutral, clear, and easy-to-understand explanations. Maintain readability and structured flow. Present information in a well-organized manner that is accessible to a general audience.",
  },
  {
    id: "Simple",
    label: "Simple",
    instruction:
      "Explain as if teaching a complete beginner or young learner. Avoid jargon; if technical terms are necessary, define them immediately in simple language. " +
      "Use analogies and comparisons with familiar real-world systems or experiences to make abstract concepts relatable. " +
      "Break complex ideas into sequential, logical steps — each building naturally on the previous one. " +
      "Include practical, real-world examples and use cases to show how concepts apply in reality. " +
      "Help the learner visualize systems and relationships through mental imagery and spatial descriptions when it aids understanding. " +
      "Use encouraging, confidence-building language that reduces intimidation around difficult concepts.",
  },
  {
    id: "Story",
    label: "Story",
    instruction:
      "Teach concepts using narratives, scenarios, characters, or story-like progression. Make the explanation emotionally engaging and memorable. " +
      "Weave in guided questions and progressive reasoning to encourage self-discovery and deeper engagement — pose thought-provoking questions before revealing conclusions when appropriate. " +
      "Use relatable analogies within the narrative to anchor abstract ideas. Build the story arc so that each new concept follows naturally from the last.",
  },
  {
    id: "Deep",
    label: "Deep",
    instruction:
      "Provide advanced technical depth, nuance, complexity, edge cases, and detailed reasoning. Assume the learner already understands foundational concepts. " +
      "Present multiple viewpoints, interpretations, arguments, strengths, weaknesses, and counterarguments where the topic warrants it — avoid oversimplifying nuanced issues. " +
      "Include relevant historical background, evolution, key discoveries, and major contributors when they add meaningful context. " +
      "Analyze assumptions, evaluate evidence, identify limitations, and promote analytical understanding over passive acceptance. " +
      "Encourage critical thinking by highlighting open questions and areas of ongoing debate.",
  },
];

export const MODE_INSTRUCTIONS: Record<GlobalMode, { label: string; instruction: string }> = {
  translate: {
    label: "Translate",
    instruction:
      "Translate the provided content into the target language. Preserve the original meaning, structure, hierarchy, headings, lists, and logical flow. Do not add explanations, summaries, commentary, interpretation, or extra information. Output only the translated content.",
  },
  explain: {
    label: "Explain",
    instruction: "Process the provided content according to the selected Explanation Style.",
  },
};

export interface BuildPagePayloadInput {
  modelId: string;
  mode: GlobalMode;
  language: string;
  /** Explanation style — ignored when mode is "translate". */
  style: string;
  temperature: number;
  pageNumber: number;
  pageText: string;
}

export function buildPagePayload(i: BuildPagePayloadInput): Record<string, unknown> {
  const isTranslate = i.mode === "translate";
  const styleSpec = EXPLANATION_STYLES.find((s) => s.id === i.style) ?? EXPLANATION_STYLES[0];

  const taskBlock = isTranslate
    ? `TRANSLATION MODE\nTarget language: ${i.language || "English"}.\n${MODE_INSTRUCTIONS.translate.instruction}`
    : `EXPLANATION MODE\nResponse language: ${i.language || "English"}.\nSelected Explanation Style: ${styleSpec.label}.\nStyle directive: ${styleSpec.instruction}`;

  const system = [
    "You are an advanced AI reading and teaching assistant integrated into a PDF.js-based document reader.",
    "The user-visible content below was extracted from a PDF page and inserted into this request.",
    taskBlock,
    `GLOBAL RULES. ${GLOBAL_RULES}`,
    `NEGATIVE GENERATION RULES. ${NEGATIVE_RULES}`,
    "These restrictions must influence generation natively — do not rely on post-processing.",
  ].join("\n\n");

  const user = `--- Page ${i.pageNumber} ---\n${i.pageText}`;

  return {
    model: i.modelId || getDefaultModelSync(),
    stream: true,
    temperature: i.temperature ?? 0.3,
    max_tokens: 4000,
    messages: [
      { role: "system", content: system },
      { role: "user", content: user },
    ],
  };
}
