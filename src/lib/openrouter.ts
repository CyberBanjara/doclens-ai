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

export interface StreamOpts {
  key: string;
  model: string;
  system: string;
  user: string;
  signal?: AbortSignal;
  onDelta: (text: string) => void;
}

export async function streamCompletion(opts: StreamOpts): Promise<void> {
  const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    signal: opts.signal,
    headers: {
      Authorization: `Bearer ${opts.key}`,
      "Content-Type": "application/json",
      ...HEADERS_BASE,
    },
    body: JSON.stringify({
      model: opts.model,
      stream: true,
      messages: [
        { role: "system", content: opts.system },
        { role: "user", content: opts.user },
      ],
    }),
  });
  if (!res.ok || !res.body) {
    const txt = await res.text().catch(() => "");
    throw new Error(`OpenRouter error ${res.status}: ${txt.slice(0, 200)}`);
  }
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
