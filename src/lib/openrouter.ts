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

export function getKey(): string {
  if (typeof window === "undefined") return "";
  return localStorage.getItem(KEY_LS) ?? "";
}
export function setKey(k: string) {
  localStorage.setItem(KEY_LS, k);
}
export function clearKey() {
  localStorage.removeItem(KEY_LS);
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

export type GlobalMode = "translate" | "summarize" | "explain" | "keypoints";
export function getMode(): GlobalMode {
  if (typeof window === "undefined") return "summarize";
  return (localStorage.getItem(MODE_LS) as GlobalMode) ?? "summarize";
}
export function setMode(m: GlobalMode) {
  localStorage.setItem(MODE_LS, m);
}

export function getStyle(): string {
  if (typeof window === "undefined") return "Neutral";
  return localStorage.getItem(STYLE_LS) ?? "Neutral";
}
export function setStyle(s: string) {
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
  try {
    const res = await fetch("https://openrouter.ai/api/v1/auth/key", {
      headers: { Authorization: `Bearer ${key}`, ...HEADERS_BASE },
    });
    return res.ok;
  } catch {
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
      lastError = new Error(`OpenRouter error ${res.status}: ${txt.slice(0, 200)}`);
      if (isRetryable(res.status) && attempt < MAX_RETRIES) continue;
      throw lastError;
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

export interface BuildPagePayloadInput {
  modelId: string;
  mode: GlobalMode;
  language: string;
  style: string;
  temperature: number;
  pageNumber: number;
  pageText: string;
  /** Optional trailing excerpt from previous page's result. */
  previousExcerpt?: string;
}

export function buildPagePayload(i: BuildPagePayloadInput): Record<string, unknown> {
  const modeInstr = MODE_INSTRUCTIONS[i.mode]?.instruction ?? MODE_INSTRUCTIONS.summarize.instruction;
  const styleClause = i.style && i.style !== "Neutral" ? ` Use a ${i.style.toLowerCase()} tone.` : "";
  const system =
    `You are a document analysis assistant. Always respond in ${i.language}.${styleClause} ` +
    `Process one page at a time. Output only the final answer — no preamble.`;
  const memoryBlock = i.previousExcerpt
    ? `\n\n[Context from end of previous page — for continuity only, do not re-translate or re-summarize]:\n${i.previousExcerpt}\n`
    : "";
  const user = `${modeInstr}${memoryBlock}\n\n--- Page ${i.pageNumber} ---\n${i.pageText}`;
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

export const MODE_INSTRUCTIONS: Record<string, { label: string; instruction: string }> = {
  translate: {
    label: "Translate",
    instruction:
      "Translate the following document excerpt. Preserve structure, headings, and lists. Output only the translation.",
  },
  summarize: {
    label: "Summarize",
    instruction:
      "Summarize the following document excerpt clearly and concisely. Keep key facts, names, and numbers.",
  },
  explain: {
    label: "Explain",
    instruction:
      "Explain the following document excerpt in plain, accessible language. Define jargon as you go.",
  },
  keypoints: {
    label: "Key Points",
    instruction:
      "Extract the key points from the following document excerpt as a clean bulleted list.",
  },
};

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
