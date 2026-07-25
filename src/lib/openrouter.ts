import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { isNetworkError, OFFLINE_MESSAGE } from "./network";

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
const SERVER_KEY_SENTINEL = "server-managed";
const CUSTOM_KEY_LS = "doclens.openrouter.customKey";
const FALLBACK_OPENROUTER_MODEL = "openai/gpt-oss-20b:free";

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

export function getKey(): string {
  return getCustomKey() || SERVER_KEY_SENTINEL;
}

export function setKey(k: string) {
  setCustomKey(k);
}

export function clearKey() {
  if (typeof window === "undefined") return;
  localStorage.removeItem(CUSTOM_KEY_LS);
  localStorage.removeItem(KEY_STATUS_LS);
  emitKeyChange();
}

export function getKeyStatus(): KeyStatus {
  if (typeof window === "undefined") return "unknown";
  const v = localStorage.getItem(KEY_STATUS_LS);
  return v === "valid" || v === "invalid" || v === "missing" ? v : "unknown";
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

function getServerDefaultModel(): string {
  return process.env.OPENROUTER_DEFAULT_MODEL?.trim() || FALLBACK_OPENROUTER_MODEL;
}

const fetchServerDefaultModel = createServerFn({ method: "GET" }).handler(async () => {
  "use server";
  return { modelId: getServerDefaultModel() };
});

export async function getDefaultModel(): Promise<string> {
  try {
    const { modelId } = await fetchServerDefaultModel();
    return modelId || FALLBACK_OPENROUTER_MODEL;
  } catch {
    return FALLBACK_OPENROUTER_MODEL;
  }
}

export async function getEffectiveSelectedModel(): Promise<string> {
  return getSelectedModel() || (await getDefaultModel());
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
/** Legacy values ("summarize", "keypoints") collapse into "explain". */
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
  const v = localStorage.getItem(STYLE_LS) as ExplanationStyle | null;
  return v && EXPLANATION_STYLES.some((s) => s.id === v) ? v : "Standard";
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
    modelId: getSelectedModel(),
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
  "HTTP-Referer": "https://doclens.app",
  "X-Title": "DocLens",
};

function getServerOpenRouterKey(): string {
  return process.env.OPENROUTER_API_KEY?.trim() ?? "";
}

function getEffectiveKey(userKey?: string): string {
  if (!userKey || userKey === SERVER_KEY_SENTINEL) {
    return getServerOpenRouterKey();
  }
  return userKey;
}

const validateServerOpenRouterKey = createServerFn({ method: "POST" })
  .validator((input: { userKey?: string } | undefined) => input)
  .handler(async ({ data }) => {
    "use server";
    const key = getEffectiveKey(data?.userKey);
    if (!key) return { status: "missing" as KeyStatus };
    const res = await fetch("https://openrouter.ai/api/v1/auth/key", {
      headers: { Authorization: `Bearer ${key}`, ...HEADERS_BASE },
    });
    return { status: res.ok ? ("valid" as KeyStatus) : ("invalid" as KeyStatus) };
  });

const fetchServerOpenRouterModels = createServerFn({ method: "POST" })
  .validator((input: { userKey?: string } | undefined) => input)
  .handler(async ({ data }) => {
    "use server";
    const key = getEffectiveKey(data?.userKey);
    if (!key) throw new Error("No OpenRouter API key provided.");
    const res = await fetch("https://openrouter.ai/api/v1/models", {
      headers: { Authorization: `Bearer ${key}`, ...HEADERS_BASE },
    });
    if (!res.ok) throw new Error(`Failed to fetch models: ${res.status}`);
    const json = await res.json();
    return (json.data ?? []) as ORModel[];
  });

/**
 * Proxies the OpenRouter chat-completions endpoint as a live SSE stream instead of
 * buffering the full response. Returning a raw `Response` here (rather than a plain
 * object) makes the TanStack Start client RPC hand back the real fetch `Response`
 * un-deserialized, so the caller can read `response.body` as it arrives.
 */
const completeWithServerOpenRouter = createServerFn({ method: "POST" })
  .validator((input: { payload: Record<string, unknown>; userKey?: string }) => input)
  .handler(async ({ data }): Promise<Response> => {
    "use server";
    const key = getEffectiveKey(data.userKey);
    if (!key) {
      return new Response(JSON.stringify({ error: "No OpenRouter API key provided." }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      });
    }

    // Tie the upstream request to the incoming client connection so an aborted
    // client request (page cancel/navigation) also cancels the OpenRouter call.
    const upstream = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
        ...HEADERS_BASE,
      },
      body: JSON.stringify({ ...data.payload, stream: true }),
      signal: getRequest().signal,
    });

    if (!upstream.ok || !upstream.body) {
      const body = await upstream.text();
      return new Response(body, {
        status: upstream.status,
        headers: { "Content-Type": "application/json" },
      });
    }

    return new Response(upstream.body, {
      status: 200,
      headers: {
        "Content-Type": "text/event-stream; charset=utf-8",
        "Cache-Control": "no-cache",
      },
    });
  });

export async function validateKey(key?: string): Promise<boolean> {
  try {
    const effectiveKey = key !== undefined ? key : getCustomKey();
    const { status } = await validateServerOpenRouterKey({ data: { userKey: effectiveKey } });
    setKeyStatus(status);
    return status === "valid";
  } catch {
    setKeyStatus("unknown");
    return false;
  }
}

export async function fetchModels(key?: string): Promise<ORModel[]> {
  const effectiveKey = key !== undefined ? key : getCustomKey();
  try {
    return await fetchServerOpenRouterModels({ data: { userKey: effectiveKey } });
  } catch (err) {
    if (isNetworkError(err)) throw new Error(OFFLINE_MESSAGE);
    throw err;
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
  readonly status: number;
  readonly kind: OpenRouterErrorKind;
  constructor(message: string, status: number, kind: OpenRouterErrorKind) {
    super(message);
    this.name = "OpenRouterError";
    this.status = status;
    this.kind = kind;
  }
}

function friendlyOpenRouterError(
  status: number,
  body: string,
  isServerManagedKey: boolean,
): OpenRouterError {
  if (status === 401 && body.includes("OPENROUTER_API_KEY"))
    return new OpenRouterError("OPENROUTER_API_KEY is not configured on the server.", 401, "auth");
  if (status === 401)
    return new OpenRouterError(
      "Your OpenRouter API key is invalid or expired. Add a valid key to continue.",
      401,
      "auth",
    );
  if (status === 403)
    return new OpenRouterError(
      "OpenRouter rejected this key for the selected model. Check key permissions or pick another model.",
      403,
      "auth",
    );
  if (status === 402)
    return new OpenRouterError(
      "Your OpenRouter account is out of credits. Add credits or switch to a free model.",
      402,
      "credits",
    );
  if (status === 429 && isServerManagedKey)
    return new OpenRouterError(
      "The global free quota has been exhausted, so this service is temporarily unavailable. " +
        "You can continue using the app by creating your own free OpenRouter API key, then paste " +
        "it into the settings. This will use your personal free quota instead of the shared global " +
        "quota, allowing you to keep using the service without waiting for the global limit to reset.",
      429,
      "quota",
    );
  if (status === 429)
    return new OpenRouterError(
      "Rate limit reached on OpenRouter. Please wait a moment and try again.",
      429,
      "rate_limit",
    );
  if (status >= 500)
    return new OpenRouterError(
      "OpenRouter is having trouble right now. Please retry shortly.",
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

/** Default timeout for a single streaming request (ms). */
const STREAM_TIMEOUT_MS = 60_000;
/** Max retries on transient errors (429 / 503). */
const MAX_RETRIES = 1;
/** Base delay between retries (ms). Doubled on each attempt. */
const RETRY_BASE_MS = 2_000;

export interface StreamOpts {
  key?: string;
  /** Full payload sent to OpenRouter — must include `model`, `messages`, `stream: true`. */
  payload: Record<string, unknown>;
  signal?: AbortSignal;
  onDelta: (text: string) => void;
  /** Override default timeout (ms). */
  timeoutMs?: number;
}

/** Combine user abort signal with a timeout signal.
 *  The fallback path used to leak `"abort"` listeners on both source signals
 *  when the request completed normally — we now expose a cleanup hook so
 *  callers can detach listeners in a `finally`. */
function combinedSignal(
  userSignal: AbortSignal | undefined,
  timeoutMs: number,
): { signal: AbortSignal; cleanup: () => void } {
  const timeout = AbortSignal.timeout(timeoutMs);
  if (!userSignal) return { signal: timeout, cleanup: () => {} };
  if (typeof AbortSignal.any === "function") {
    // AbortSignal.any returns a signal that is GC'd with its sources — no
    // manual cleanup needed.
    return { signal: AbortSignal.any([userSignal, timeout]), cleanup: () => {} };
  }
  // Manual fallback for older engines.
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

/** Returns true for HTTP statuses that should be retried. */
function isRetryable(status: number): boolean {
  return status === 429 || status === 503;
}

function abortableDelay(ms: number, signal: AbortSignal): Promise<void> {
  if (signal.aborted) return Promise.reject(new DOMException("Aborted", "AbortError"));
  return new Promise((resolve, reject) => {
    const id = globalThis.setTimeout(resolve, ms);
    signal.addEventListener(
      "abort",
      () => {
        globalThis.clearTimeout(id);
        reject(new DOMException("Aborted", "AbortError"));
      },
      { once: true },
    );
  });
}

/**
 * Reads an OpenAI/OpenRouter-style SSE stream (`data: {...}\n\n`, terminated by
 * `data: [DONE]`), invoking `onDelta` once per content chunk as it arrives — this
 * is what makes the UI feel like it's flowing in real time instead of jumping from
 * empty to complete.
 */
async function readSseStream(
  body: ReadableStream<Uint8Array>,
  onDelta: (text: string) => void,
  signal: AbortSignal,
): Promise<void> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  const onAbort = () => {
    reader.cancel().catch(() => {});
  };
  signal.addEventListener("abort", onAbort, { once: true });

  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      let sep: number;
      while ((sep = buffer.indexOf("\n\n")) !== -1) {
        const rawEvent = buffer.slice(0, sep);
        buffer = buffer.slice(sep + 2);
        for (const line of rawEvent.split("\n")) {
          const trimmed = line.trim();
          if (!trimmed.startsWith("data:")) continue;
          const payload = trimmed.slice(5).trim();
          if (payload === "[DONE]") return;
          try {
            const parsed = JSON.parse(payload);
            const delta: unknown = parsed?.choices?.[0]?.delta?.content;
            if (typeof delta === "string" && delta) onDelta(delta);
          } catch {
            // Ignore malformed/partial SSE chunks (e.g. OpenRouter keep-alive comments).
          }
        }
      }
    }
  } finally {
    signal.removeEventListener("abort", onAbort);
  }
}

export async function streamCompletion(opts: StreamOpts): Promise<void> {
  const { signal, cleanup } = combinedSignal(opts.signal, opts.timeoutMs ?? STREAM_TIMEOUT_MS);
  let lastError: Error | null = null;
  const resolvedUserKey = opts.key || getCustomKey();
  const isServerManagedKey = !resolvedUserKey || resolvedUserKey === SERVER_KEY_SENTINEL;

  try {
    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      if (signal.aborted) throw new DOMException("Aborted", "AbortError");

      // Backoff delay on retries
      if (attempt > 0) {
        const delay = RETRY_BASE_MS * Math.pow(2, attempt - 1);
        await abortableDelay(delay, signal);
      }

      const body = { ...opts.payload, stream: true };
      let response: Awaited<ReturnType<typeof completeWithServerOpenRouter>>;
      try {
        response = await completeWithServerOpenRouter({
          data: { payload: body, userKey: resolvedUserKey },
          signal,
        });
      } catch (fetchErr) {
        if (signal.aborted) throw fetchErr;
        if (isNetworkError(fetchErr)) throw new OpenRouterError(OFFLINE_MESSAGE, 0, "network");
        throw fetchErr;
      }

      if (!response.ok) {
        const bodyText = await response.text();
        const friendly = friendlyOpenRouterError(response.status, bodyText, isServerManagedKey);
        if (friendly.kind === "auth") {
          setKeyStatus(friendly.message.includes("OPENROUTER_API_KEY") ? "missing" : "invalid");
        }
        lastError = friendly;
        // A daily quota exhaustion won't clear within a short backoff — retrying wastes time.
        if (friendly.kind !== "quota" && isRetryable(response.status) && attempt < MAX_RETRIES)
          continue;
        throw friendly;
      }

      if (!response.body) {
        throw new OpenRouterError("OpenRouter returned an empty stream.", 502, "server");
      }

      // Once the stream has started, a mid-stream failure is surfaced as an error
      // rather than retried — retrying here would re-run the whole prompt and
      // duplicate whatever partial text has already reached the UI.
      await readSseStream(response.body, opts.onDelta, signal);
      return; // Success
    }

    if (lastError) throw lastError;
  } finally {
    // Always detach any AbortSignal listeners we attached, success or failure.
    cleanup();
  }
}

/**
 * Negative-generation rules embedded directly into the system prompt so the
 * model produces clean, TTS-friendly plain text natively (no post-filter).
 */
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
  | "ELI5"
  | "Storytelling"
  | "Socratic"
  | "Step-by-Step"
  | "Visual Thinking"
  | "Analogical"
  | "Practical"
  | "Expert Deep-Dive"
  | "Debate"
  | "Historical Context"
  | "Motivational"
  | "Critical Thinking";

export const EXPLANATION_STYLES: ExplanationStyleSpec[] = [
  {
    id: "Standard",
    label: "Standard",
    instruction:
      "Use balanced, neutral, clear, and easy-to-understand explanations. Maintain readability and structured flow.",
  },
  {
    id: "ELI5",
    label: "ELI5",
    instruction:
      "Explain as if teaching a complete beginner or young learner. Avoid jargon when possible; if technical terms are necessary, define them immediately in simple language. Use intuitive examples and simplified reasoning.",
  },
  {
    id: "Storytelling",
    label: "Storytelling",
    instruction:
      "Teach concepts using narratives, scenarios, characters, or story-like progression. Make the explanation emotionally engaging and memorable.",
  },
  {
    id: "Socratic",
    label: "Socratic",
    instruction:
      "Teach primarily through guided questions and progressive reasoning. Encourage critical thinking and self-discovery. Avoid instantly revealing conclusions unless necessary.",
  },
  {
    id: "Step-by-Step",
    label: "Step-by-Step",
    instruction:
      "Break the explanation into sequential logical stages. Ensure each step builds naturally on the previous one. Maintain clarity throughout the progression.",
  },
  {
    id: "Visual Thinking",
    label: "Visual Thinking",
    instruction:
      "Explain using mental imagery, hierarchy, structure, spatial relationships, and diagram-like descriptions. Help the learner mentally visualize systems and relationships.",
  },
  {
    id: "Analogical",
    label: "Analogical",
    instruction:
      "Use analogies and comparisons with familiar real-world systems or experiences. Simplify abstract concepts through relatable examples.",
  },
  {
    id: "Practical",
    label: "Practical",
    instruction:
      "Focus on real-world applications, implementation methods, use cases, and practical outcomes. Emphasize how concepts are actually used in reality.",
  },
  {
    id: "Expert Deep-Dive",
    label: "Expert Deep-Dive",
    instruction:
      "Provide advanced technical depth, nuance, complexity, edge cases, and detailed reasoning. Assume the learner already understands foundational concepts.",
  },
  {
    id: "Debate",
    label: "Debate",
    instruction:
      "Present multiple viewpoints, interpretations, arguments, strengths, weaknesses, and counterarguments. Avoid oversimplifying nuanced topics.",
  },
  {
    id: "Historical Context",
    label: "Historical Context",
    instruction:
      "Explain the historical background, evolution, discoveries, timeline, and major contributors behind the concepts. Include important historical developments where relevant.",
  },
  {
    id: "Motivational",
    label: "Motivational",
    instruction:
      "Use encouraging, confidence-building, supportive language. Reduce intimidation around difficult concepts while remaining informative.",
  },
  {
    id: "Critical Thinking",
    label: "Critical Thinking",
    instruction:
      "Analyze assumptions, evaluate evidence, identify limitations, and encourage deeper reasoning. Promote analytical understanding rather than passive acceptance.",
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
    ? `TRANSLATION MODE\nTarget language: ${i.language}.\n${MODE_INSTRUCTIONS.translate.instruction}`
    : `EXPLANATION MODE\nResponse language: ${i.language}.\nSelected Explanation Style: ${styleSpec.label}.\nStyle directive: ${styleSpec.instruction}`;

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
    model: i.modelId,
    stream: true,
    temperature: i.temperature,
    max_tokens: 4000,
    messages: [
      { role: "system", content: system },
      { role: "user", content: user },
    ],
  };
}

export function chunkForContext(
  text: string,
  contextTokens: number,
  reserveOutput = 1500,
): string[] {
  // ~4 chars per token. Leave room for system + user instruction overhead + output.
  const usableTokens = Math.max(1000, contextTokens - reserveOutput - 500);
  const charsPerChunk = usableTokens * 4;
  if (text.length <= charsPerChunk) return [text];
  const chunks: string[] = [];
  // Try to split on paragraph boundaries
  const paragraphs = text.split(/\n\n+/);
  let buf = "";
  for (const p of paragraphs) {
    if (buf.length + p.length + 2 > charsPerChunk) {
      if (buf) chunks.push(buf);
      if (p.length > charsPerChunk) {
        for (let i = 0; i < p.length; i += charsPerChunk) {
          chunks.push(p.slice(i, i + charsPerChunk));
        }
        buf = "";
      } else {
        buf = p;
      }
    } else {
      buf = buf ? buf + "\n\n" + p : p;
    }
  }
  if (buf) chunks.push(buf);
  return chunks;
}

export async function mapLimit<T, R>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  const results: R[] = [];
  const promises: Promise<void>[] = [];
  let index = 0;

  async function worker() {
    while (index < items.length) {
      const curIndex = index++;
      if (curIndex >= items.length) break;
      results[curIndex] = await fn(items[curIndex]);
    }
  }

  for (let i = 0; i < Math.min(limit, items.length); i++) {
    promises.push(worker());
  }

  await Promise.all(promises);
  return results;
}
