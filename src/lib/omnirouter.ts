import { isNetworkError } from "./network";
import type { ORModel } from "./openrouter";

declare const __OMNIROUTER_CONFIGURED__: boolean | undefined;
declare const __OMNIROUTER_DEFAULT_MODEL__: string | undefined;

const OMNI_MODEL_LS = "doclens.omnirouter.model";
const OMNI_STATUS_EVT = "doclens:omnirouter-status-change";

/** Base endpoint for backend-proxied OmniRouter API. */
export function getOmniRouterBaseUrl(): string {
  return "/api/omni";
}

/**
 * Returns true only when OmniRouter is configured on the backend.
 * When false, all OmniRouter options are completely hidden from UI.
 */
export function isOmniRouterConfigured(): boolean {
  try {
    if (typeof __OMNIROUTER_CONFIGURED__ !== "undefined") {
      return Boolean(__OMNIROUTER_CONFIGURED__);
    }
  } catch {
    // Ignore ReferenceError in non-Vite environments
  }
  return false;
}

export function getOmniSelectedModel(): string {
  if (typeof window === "undefined") return "";
  return localStorage.getItem(OMNI_MODEL_LS) ?? "";
}

export function setOmniSelectedModel(id: string) {
  if (typeof window === "undefined") return;
  if (id) {
    localStorage.setItem(OMNI_MODEL_LS, id.trim());
  } else {
    localStorage.removeItem(OMNI_MODEL_LS);
  }
}

export function getOmniDefaultModelSync(): string {
  try {
    if (typeof __OMNIROUTER_DEFAULT_MODEL__ !== "undefined" && __OMNIROUTER_DEFAULT_MODEL__) {
      return __OMNIROUTER_DEFAULT_MODEL__.trim();
    }
  } catch {
    // Ignore ReferenceError
  }
  return "";
}

export async function getEffectiveOmniModel(): Promise<string> {
  const selected = getOmniSelectedModel();
  if (selected) return selected;
  const def = getOmniDefaultModelSync();
  if (def) return def;
  const models = await fetchOmniRouterModels();
  return models[0]?.id || "";
}

export class OmniRouterError extends Error {
  status: number;
  kind: "auth" | "rate_limit" | "server" | "network" | "unknown";
  constructor(
    message: string,
    status = 0,
    kind: "auth" | "rate_limit" | "server" | "network" | "unknown" = "unknown",
  ) {
    super(message);
    this.name = "OmniRouterError";
    this.status = status;
    this.kind = kind;
  }
}

export function friendlyOmniRouterError(status: number, body: string): OmniRouterError {
  if (status === 401 || status === 403) {
    return new OmniRouterError("OmniRouter authentication failed on server.", status, "auth");
  }
  if (status === 429) {
    return new OmniRouterError(
      "OmniRouter rate limit reached. Please retry shortly.",
      429,
      "rate_limit",
    );
  }
  if (status >= 500) {
    const snippet = body.replace(/\s+/g, " ").trim().slice(0, 160);
    return new OmniRouterError(
      `OmniRouter server error (${status})${snippet ? `: ${snippet}` : ". Please check your gateway."}`,
      status,
      "server",
    );
  }
  const snippet = body.replace(/\s+/g, " ").trim().slice(0, 160);
  return new OmniRouterError(
    `OmniRouter request failed (${status})${snippet ? `: ${snippet}` : "."}`,
    status,
    "unknown",
  );
}

/** Fetches available models from backend OmniRouter proxy API. */
export async function fetchOmniRouterModels(): Promise<ORModel[]> {
  if (!isOmniRouterConfigured()) return [];

  try {
    const res = await fetch("/api/omni/models", {
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) return [];
    const json = await res.json();
    const data = (json?.data as any[]) || [];
    if (!Array.isArray(data)) return [];
    return data.map((m) => ({
      id: m.id,
      name: m.name || m.id,
      context_length: m.context_length || m.max_input_tokens || 128000,
      pricing: m.pricing || { prompt: "0", completion: "0" },
      description: m.description,
      top_provider: m.top_provider,
    }));
  } catch {
    return [];
  }
}

/** Validates connectivity to the configured OmniRouter backend proxy. */
export async function validateOmniRouterConnection(): Promise<{
  ok: boolean;
  error?: string;
  modelCount?: number;
}> {
  if (!isOmniRouterConfigured()) {
    return { ok: false, error: "OmniRouter Gateway is not configured." };
  }

  try {
    const res = await fetch("/api/omni/validate", {
      signal: AbortSignal.timeout(8_000),
    });
    const json = await res.json();
    if (!res.ok || !json?.ok) {
      return { ok: false, error: json?.error || `HTTP ${res.status}` };
    }
    return { ok: true, modelCount: json.modelCount ?? 0 };
  } catch (err: any) {
    if (isNetworkError(err)) {
      return {
        ok: false,
        error: "Could not connect to backend OmniRouter proxy.",
      };
    }
    return { ok: false, error: err?.message || "Connection failed." };
  }
}

/** Default timeout for streaming completion request (ms). */
const STREAM_TIMEOUT_MS = 60_000;
const MAX_RETRIES = 1;

export interface OmniStreamOpts {
  baseUrl?: string;
  apiKey?: string;
  payload: Record<string, unknown>;
  signal?: AbortSignal;
  onDelta: (text: string) => void;
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

/** High-speed SSE stream parser for OmniRouter chat completion responses. */
async function readOmniSseStream(
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
          const errMsg =
            typeof parsed.error === "string"
              ? parsed.error
              : parsed.error.message || "Model streaming error";
          const errCode = typeof parsed.error === "object" ? parsed.error.code : undefined;
          const statusNum = typeof errCode === "number" ? errCode : 500;
          throw friendlyOmniRouterError(statusNum, errMsg);
        }

        // Ignore keepalive chunks (where delta is empty {})
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
        if (err instanceof OmniRouterError) throw err;
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

/** Streaming completion through secure server backend proxy. */
export async function streamOmniRouterCompletion(opts: OmniStreamOpts): Promise<void> {
  if (!isOmniRouterConfigured()) {
    throw new OmniRouterError("OmniRouter gateway is not configured on the server.", 401, "auth");
  }

  const { signal, cleanup } = combinedSignal(opts.signal, opts.timeoutMs ?? STREAM_TIMEOUT_MS);

  try {
    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      if (signal.aborted) throw new DOMException("Aborted", "AbortError");

      let response: Response;
      try {
        response = await fetch("/api/omni/chat", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(opts.payload),
          signal,
        });
      } catch (fetchErr: any) {
        if (signal.aborted) throw fetchErr;
        throw new OmniRouterError(
          fetchErr?.message || "Failed to connect to OmniRouter proxy endpoint",
          0,
          "network",
        );
      }

      if (!response.ok) {
        const bodyText = await response.text();
        const friendly = friendlyOmniRouterError(response.status, bodyText);
        if ((response.status === 429 || response.status === 503) && attempt < MAX_RETRIES) {
          await new Promise((r) => setTimeout(r, 1000));
          continue;
        }
        throw friendly;
      }

      if (!response.body) {
        throw new OmniRouterError("OmniRouter returned an empty stream.", 502, "server");
      }

      const totalChars = await readOmniSseStream(response.body, opts.onDelta, signal);
      if (totalChars === 0 && !signal.aborted) {
        throw new OmniRouterError(
          "OmniRouter model returned an empty response. Please check model availability or select another model.",
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
