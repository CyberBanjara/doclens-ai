/**
 * OpenRouter client. All calls happen from the browser using a key the user
 * stores locally — nothing is ever transmitted to any other backend.
 */

export interface ORModel {
  id: string;
  name: string;
  description?: string;
  context_length?: number;
  pricing?: { prompt?: string; completion?: string };
  top_provider?: { context_length?: number };
}

const MODELS_URL = "https://openrouter.ai/api/v1/models";
const CHAT_URL = "https://openrouter.ai/api/v1/chat/completions";

export async function fetchModels(): Promise<ORModel[]> {
  const res = await fetch(MODELS_URL);
  if (!res.ok) throw new Error(`Failed to load models (${res.status})`);
  const json = (await res.json()) as { data: ORModel[] };
  return json.data ?? [];
}

export function modelContext(m: ORModel): number {
  return m.top_provider?.context_length ?? m.context_length ?? 8000;
}

export function isFreeModel(m: ORModel): boolean {
  const p = parseFloat(m.pricing?.prompt ?? "0");
  const c = parseFloat(m.pricing?.completion ?? "0");
  return p === 0 && c === 0;
}

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface StreamArgs {
  apiKey: string;
  model: string;
  messages: ChatMessage[];
  onDelta: (chunk: string) => void;
  signal?: AbortSignal;
}

/**
 * Stream a chat completion from OpenRouter using SSE. Calls onDelta for each
 * incremental token chunk. Resolves when the stream ends.
 */
export async function streamChat({
  apiKey,
  model,
  messages,
  onDelta,
  signal,
}: StreamArgs): Promise<void> {
  const res = await fetch(CHAT_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "HTTP-Referer": typeof window !== "undefined" ? window.location.origin : "",
      "X-Title": "DocLens",
    },
    body: JSON.stringify({ model, messages, stream: true }),
    signal,
  });

  if (!res.ok || !res.body) {
    const text = await res.text().catch(() => "");
    throw new Error(`OpenRouter ${res.status}: ${text || res.statusText}`);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let done = false;

  while (!done) {
    const { done: rdone, value } = await reader.read();
    if (rdone) break;
    buffer += decoder.decode(value, { stream: true });

    let nl: number;
    while ((nl = buffer.indexOf("\n")) !== -1) {
      let line = buffer.slice(0, nl);
      buffer = buffer.slice(nl + 1);
      if (line.endsWith("\r")) line = line.slice(0, -1);
      if (line.startsWith(":") || line.trim() === "") continue;
      if (!line.startsWith("data: ")) continue;
      const json = line.slice(6).trim();
      if (json === "[DONE]") {
        done = true;
        break;
      }
      try {
        const parsed = JSON.parse(json);
        const delta = parsed.choices?.[0]?.delta?.content as string | undefined;
        if (delta) onDelta(delta);
      } catch {
        buffer = line + "\n" + buffer;
        break;
      }
    }
  }
}
