export interface ORModel {
  id: string;
  name: string;
  context_length: number;
  pricing?: { prompt?: string; completion?: string };
  description?: string;
  top_provider?: { context_length?: number };
}

const KEY_LS = "doclens.openrouter.key";
const MODEL_LS = "doclens.openrouter.model";
const LANG_LS = "doclens.outputLanguage";
const MODE_LS = "doclens.mode";
const STYLE_LS = "doclens.style";
const TEMP_LS = "doclens.temperature";
const MEM_LS = "doclens.memory";
const SEQ_LS = "doclens.sequential";
const KEY_STATUS_LS = "doclens.openrouter.keyStatus";
const KEY_CHANGE_EVT = "doclens:openrouter-key-change";
export const OPEN_API_KEY_MODAL_EVT = "doclens:open-api-key-modal";

export type KeyStatus = "missing" | "valid" | "invalid" | "unknown";

function emitKeyChange() {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event(KEY_CHANGE_EVT));
  }
}

export function getKey(): string {
  if (typeof window === "undefined") return "";
  return localStorage.getItem(KEY_LS) ?? "";
}
export function setKey(k: string) {
  localStorage.setItem(KEY_LS, k);
  emitKeyChange();
}
export function clearKey() {
  localStorage.removeItem(KEY_LS);
  localStorage.removeItem(KEY_STATUS_LS);
  emitKeyChange();
}

/** Heuristic: OpenRouter keys are prefixed with sk-or-... */
export function isKeyFormatValid(k: string): boolean {
  return /^sk-or-[A-Za-z0-9_-]{20,}$/.test(k.trim());
}

export function getKeyStatus(): KeyStatus {
  if (typeof window === "undefined") return "unknown";
  const k = getKey();
  if (!k) return "missing";
  const v = localStorage.getItem(KEY_STATUS_LS);
  return v === "valid" || v === "invalid" ? v : "unknown";
}

export function setKeyStatus(s: KeyStatus): void {
  if (typeof window === "undefined") return;
  if (s === "missing" || s === "unknown") localStorage.removeItem(KEY_STATUS_LS);
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

export function getOutputLanguage(): string {
  if (typeof window === "undefined") return "English";
  return localStorage.getItem(LANG_LS) ?? "English";
}
export function setOutputLanguage(lang: string) {
  localStorage.setItem(LANG_LS, lang);
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

export function getTemperature(): number {
  if (typeof window === "undefined") return 0.3;
  const v = parseFloat(localStorage.getItem(TEMP_LS) ?? "0.3");
  return Number.isFinite(v) ? v : 0.3;
}
export function setTemperature(t: number) {
  localStorage.setItem(TEMP_LS, String(t));
}

export function getMemory(): boolean {
  if (typeof window === "undefined") return true;
  return localStorage.getItem(MEM_LS) !== "false";
}
export function setMemory(b: boolean) {
  localStorage.setItem(MEM_LS, b ? "true" : "false");
}

export function getSequential(): boolean {
  if (typeof window === "undefined") return true;
  return localStorage.getItem(SEQ_LS) !== "false";
}
export function setSequential(b: boolean) {
  localStorage.setItem(SEQ_LS, b ? "true" : "false");
}

const HEADERS_BASE = {
  "HTTP-Referer": "https://doclens.app",
  "X-Title": "DocLens",
};

export async function validateKey(key: string): Promise<boolean> {
  const trimmed = key.trim();
  if (!trimmed) {
    setKeyStatus("missing");
    return false;
  }
  if (!isKeyFormatValid(trimmed)) {
    setKeyStatus("invalid");
    return false;
  }
  try {
    const res = await fetch("https://openrouter.ai/api/v1/auth/key", {
      headers: { Authorization: `Bearer ${trimmed}`, ...HEADERS_BASE },
    });
    setKeyStatus(res.ok ? "valid" : "invalid");
    return res.ok;
  } catch {
    // Network error — don't mark invalid; status stays unknown.
    return false;
  }
}

export async function fetchModels(key: string): Promise<ORModel[]> {
  const res = await fetch("https://openrouter.ai/api/v1/models", {
    headers: { Authorization: `Bearer ${key}`, ...HEADERS_BASE },
  });
  if (!res.ok) throw new Error(`Failed to fetch models: ${res.status}`);
  const json = await res.json();
  return (json.data ?? []) as ORModel[];
}

/* -------- Friendly errors -------- */

export type OpenRouterErrorKind =
  | "auth"
  | "credits"
  | "rate_limit"
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

function friendlyOpenRouterError(status: number, body: string): OpenRouterError {
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
  key: string;
  /** Full payload sent to OpenRouter — must include `model`, `messages`, `stream: true`. */
  payload: Record<string, unknown>;
  signal?: AbortSignal;
  onDelta: (text: string) => void;
  /** Override default timeout (ms). */
  timeoutMs?: number;
}

/** Combine user abort signal with a timeout signal. */
function combinedSignal(userSignal?: AbortSignal, timeoutMs = STREAM_TIMEOUT_MS): AbortSignal {
  const timeout = AbortSignal.timeout(timeoutMs);
  if (!userSignal) return timeout;
  // AbortSignal.any is available in modern browsers; fallback for older engines.
  if (typeof AbortSignal.any === "function") {
    return AbortSignal.any([userSignal, timeout]);
  }
  // Manual fallback
  const ctrl = new AbortController();
  const onAbort = () => ctrl.abort();
  userSignal.addEventListener("abort", onAbort, { once: true });
  timeout.addEventListener("abort", onAbort, { once: true });
  return ctrl.signal;
}

/** Returns true for HTTP statuses that should be retried. */
function isRetryable(status: number): boolean {
  return status === 429 || status === 503;
}

export async function streamCompletion(opts: StreamOpts): Promise<void> {
  const signal = combinedSignal(opts.signal, opts.timeoutMs ?? STREAM_TIMEOUT_MS);
  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    if (signal.aborted) throw new DOMException("Aborted", "AbortError");

    // Backoff delay on retries
    if (attempt > 0) {
      const delay = RETRY_BASE_MS * Math.pow(2, attempt - 1);
      await new Promise((r) => setTimeout(r, delay));
      if (signal.aborted) throw new DOMException("Aborted", "AbortError");
    }

    const body = { ...opts.payload, stream: true };
    let res: Response;
    try {
      res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
        method: "POST",
        signal,
        headers: {
          Authorization: `Bearer ${opts.key}`,
          "Content-Type": "application/json",
          ...HEADERS_BASE,
        },
        body: JSON.stringify(body),
      });
    } catch (e) {
      // Network error or abort
      throw e;
    }

    if (!res.ok || !res.body) {
      const txt = await res.text().catch(() => "");
      const friendly = friendlyOpenRouterError(res.status, txt);
      // Persist key-status side effects for auth failures.
      if (friendly.kind === "auth") setKeyStatus("invalid");
      lastError = friendly;
      if (isRetryable(res.status) && attempt < MAX_RETRIES) continue;
      throw friendly;
    }


    // Stream reading — no retry once streaming starts
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buf = "";
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });
      let idx: number;
      while ((idx = buf.indexOf("\n")) !== -1) {
        let line = buf.slice(0, idx);
        buf = buf.slice(idx + 1);
        if (line.endsWith("\r")) line = line.slice(0, -1);
        if (!line || line.startsWith(":")) continue;
        if (!line.startsWith("data: ")) continue;
        const data = line.slice(6).trim();
        if (data === "[DONE]") return;
        try {
          const parsed = JSON.parse(data);
          const delta = parsed.choices?.[0]?.delta?.content;
          if (typeof delta === "string" && delta) opts.onDelta(delta);
        } catch {
          buf = line + "\n" + buf;
          break;
        }
      }
    }
    return; // Success
  }

  if (lastError) throw lastError;
}

/** Trailing excerpt from previous page used as memory in next request. */
export function memoryExcerpt(prev: string | undefined, maxChars = 600): string {
  if (!prev) return "";
  const trimmed = prev.trim();
  if (trimmed.length <= maxChars) return trimmed;
  return "…" + trimmed.slice(-maxChars);
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
  { id: "Standard", label: "Standard", instruction: "Use balanced, neutral, clear, and easy-to-understand explanations. Maintain readability and structured flow." },
  { id: "ELI5", label: "ELI5", instruction: "Explain as if teaching a complete beginner or young learner. Avoid jargon when possible; if technical terms are necessary, define them immediately in simple language. Use intuitive examples and simplified reasoning." },
  { id: "Storytelling", label: "Storytelling", instruction: "Teach concepts using narratives, scenarios, characters, or story-like progression. Make the explanation emotionally engaging and memorable." },
  { id: "Socratic", label: "Socratic", instruction: "Teach primarily through guided questions and progressive reasoning. Encourage critical thinking and self-discovery. Avoid instantly revealing conclusions unless necessary." },
  { id: "Step-by-Step", label: "Step-by-Step", instruction: "Break the explanation into sequential logical stages. Ensure each step builds naturally on the previous one. Maintain clarity throughout the progression." },
  { id: "Visual Thinking", label: "Visual Thinking", instruction: "Explain using mental imagery, hierarchy, structure, spatial relationships, and diagram-like descriptions. Help the learner mentally visualize systems and relationships." },
  { id: "Analogical", label: "Analogical", instruction: "Use analogies and comparisons with familiar real-world systems or experiences. Simplify abstract concepts through relatable examples." },
  { id: "Practical", label: "Practical", instruction: "Focus on real-world applications, implementation methods, use cases, and practical outcomes. Emphasize how concepts are actually used in reality." },
  { id: "Expert Deep-Dive", label: "Expert Deep-Dive", instruction: "Provide advanced technical depth, nuance, complexity, edge cases, and detailed reasoning. Assume the learner already understands foundational concepts." },
  { id: "Debate", label: "Debate", instruction: "Present multiple viewpoints, interpretations, arguments, strengths, weaknesses, and counterarguments. Avoid oversimplifying nuanced topics." },
  { id: "Historical Context", label: "Historical Context", instruction: "Explain the historical background, evolution, discoveries, timeline, and major contributors behind the concepts. Include important historical developments where relevant." },
  { id: "Motivational", label: "Motivational", instruction: "Use encouraging, confidence-building, supportive language. Reduce intimidation around difficult concepts while remaining informative." },
  { id: "Critical Thinking", label: "Critical Thinking", instruction: "Analyze assumptions, evaluate evidence, identify limitations, and encourage deeper reasoning. Promote analytical understanding rather than passive acceptance." },
];

export const MODE_INSTRUCTIONS: Record<GlobalMode, { label: string; instruction: string }> = {
  translate: {
    label: "Translate",
    instruction:
      "Translate the provided content into the target language. Preserve the original meaning, structure, hierarchy, headings, lists, and logical flow. Do not add explanations, summaries, commentary, interpretation, or extra information. Output only the translated content.",
  },
  explain: {
    label: "Explain",
    instruction:
      "Process the provided content according to the selected Explanation Style.",
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
  /** Optional trailing excerpt from previous page's result. */
  previousExcerpt?: string;
}

export function buildPagePayload(i: BuildPagePayloadInput): Record<string, unknown> {
  const isTranslate = i.mode === "translate";
  const styleSpec =
    EXPLANATION_STYLES.find((s) => s.id === i.style) ?? EXPLANATION_STYLES[0];

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

  const memoryBlock = i.previousExcerpt
    ? `\n\n[Context from end of previous page — for continuity only, do not re-translate or re-process]:\n${i.previousExcerpt}\n`
    : "";
  const user = `--- Page ${i.pageNumber} ---\n${i.pageText}${memoryBlock}`;

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

export function chunkForContext(text: string, contextTokens: number, reserveOutput = 1500): string[] {
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
