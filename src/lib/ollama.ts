import { isNetworkError } from "./network";
import type { ORModel } from "./openrouter";

export const DEFAULT_OLLAMA_ENDPOINT = "http://localhost:11434";
const OLLAMA_ENDPOINT_LS = "doclens.ollama.endpoint";
const OLLAMA_MODEL_LS = "doclens.ollama.model";
const OLLAMA_STATUS_EVT = "doclens:ollama-status-change";

/** Normalize Ollama endpoint by removing trailing slashes and ensuring protocol. */
export function sanitizeOllamaEndpoint(url: string): string {
  if (!url) return DEFAULT_OLLAMA_ENDPOINT;
  let trimmed = url.trim().replace(/\/+$/, "");
  if (!trimmed) return DEFAULT_OLLAMA_ENDPOINT;
  if (!/^https?:\/\//i.test(trimmed)) {
    trimmed = `http://${trimmed}`;
  }
  return trimmed;
}

/** Synchronously returns active Ollama endpoint from localStorage or default. */
export function getOllamaEndpoint(): string {
  if (typeof window === "undefined") return DEFAULT_OLLAMA_ENDPOINT;
  const stored = localStorage.getItem(OLLAMA_ENDPOINT_LS);
  if (stored && stored.trim()) {
    return sanitizeOllamaEndpoint(stored);
  }
  return DEFAULT_OLLAMA_ENDPOINT;
}

/** Saves custom Ollama endpoint to localStorage. */
export function setOllamaEndpoint(url: string): void {
  if (typeof window === "undefined") return;
  const sanitized = sanitizeOllamaEndpoint(url);
  localStorage.setItem(OLLAMA_ENDPOINT_LS, sanitized);
  window.dispatchEvent(new CustomEvent(OLLAMA_STATUS_EVT, { detail: { endpoint: sanitized } }));
}

/** Returns the currently selected Ollama model from localStorage. */
export function getOllamaSelectedModel(): string {
  if (typeof window === "undefined") return "";
  return localStorage.getItem(OLLAMA_MODEL_LS) ?? "";
}

/** Saves the selected Ollama model to localStorage. */
export function setOllamaSelectedModel(id: string): void {
  if (typeof window === "undefined") return;
  if (id) {
    localStorage.setItem(OLLAMA_MODEL_LS, id.trim());
  } else {
    localStorage.removeItem(OLLAMA_MODEL_LS);
  }
  window.dispatchEvent(new CustomEvent(OLLAMA_STATUS_EVT, { detail: { modelId: id } }));
}

/** Checks whether Ollama is configured or selected as provider. */
export function isOllamaConfigured(): boolean {
  if (typeof window === "undefined") return false;
  const storedProvider = localStorage.getItem("doclens.provider");
  return storedProvider === "ollama";
}

export class OllamaError extends Error {
  status: number;
  kind: "cors" | "network" | "server" | "not_found" | "unknown";
  constructor(
    message: string,
    status = 0,
    kind: "cors" | "network" | "server" | "not_found" | "unknown" = "unknown",
  ) {
    super(message);
    this.name = "OllamaError";
    this.status = status;
    this.kind = kind;
  }
}

export function friendlyOllamaError(status: number, body: string, endpoint: string): OllamaError {
  if (status === 404) {
    return new OllamaError(
      `Model or route not found on Ollama server at ${endpoint} (HTTP 404). Please ensure the model is pulled ('ollama pull <model>') and selected.`,
      status,
      "not_found",
    );
  }
  if (status >= 500) {
    const snippet = body.replace(/\s+/g, " ").trim().slice(0, 160);
    return new OllamaError(
      `Ollama server error (${status})${snippet ? `: ${snippet}` : ". Please check your Ollama instance."}`,
      status,
      "server",
    );
  }
  const snippet = body.replace(/\s+/g, " ").trim().slice(0, 160);
  return new OllamaError(
    `Ollama request failed (${status})${snippet ? `: ${snippet}` : "."}`,
    status,
    "unknown",
  );
}

/**
 * Helper to construct helpful connection error messages including CORS troubleshooting.
 */
function getOllamaConnectionErrorMessage(endpoint: string, err?: unknown): string {
  const base = `Could not connect to Ollama at ${endpoint}.`;
  const corsHint =
    "Make sure Ollama is running (OLLAMA_ORIGINS=\"*\" ollama serve) and click 'Allow' if your browser prompts to 'Access other apps and services on this device'.";
  if (err instanceof Error && err.message) {
    if (err.name === "AbortError" || err.name === "TimeoutError") {
      return `${base} Connection timed out. ${corsHint}`;
    }
  }
  return `${base} ${corsHint}`;
}

/**
 * Dynamically fetches all available models from the specified Ollama endpoint
 * using Ollama's model-list API (/api/tags) directly from the browser.
 */
export async function fetchOllamaModels(endpoint?: string): Promise<ORModel[]> {
  const targetEndpoint = sanitizeOllamaEndpoint(endpoint || getOllamaEndpoint());

  // 1. Direct /api/tags endpoint
  try {
    const res = await fetch(`${targetEndpoint}/api/tags`, {
      method: "GET",
      headers: {
        Accept: "application/json",
      },
      signal: AbortSignal.timeout(8_000),
    });

    if (res.ok) {
      const json = (await res.json()) as { models?: unknown[] };
      const rawList = Array.isArray(json?.models) ? json.models : [];
      if (rawList.length > 0) {
        return rawList.map((item) => {
          const m = (typeof item === "object" && item !== null ? item : {}) as Record<
            string,
            unknown
          >;
          const name = String(m.name || m.model || "");
          const id = name;
          const details =
            typeof m.details === "object" && m.details !== null
              ? (m.details as Record<string, unknown>)
              : undefined;
          const paramSize = details?.parameter_size ? String(details.parameter_size) : "";
          const family = details?.family ? String(details.family) : "";
          const desc = [paramSize, family].filter(Boolean).join(" • ");

          return {
            id,
            name: id,
            context_length: 8192,
            pricing: { prompt: "0", completion: "0" },
            description: desc || "Local Ollama model",
          };
        });
      }
    }
  } catch {
    // Fall through to /v1/models fallback
  }

  // 2. OpenAI-compatible /v1/models endpoint fallback
  try {
    const res = await fetch(`${targetEndpoint}/v1/models`, {
      method: "GET",
      headers: {
        Accept: "application/json",
      },
      signal: AbortSignal.timeout(8_000),
    });

    if (res.ok) {
      const json = (await res.json()) as { data?: unknown[] };
      const rawList = Array.isArray(json?.data) ? json.data : [];
      return rawList.map((item) => {
        const m = (typeof item === "object" && item !== null ? item : {}) as Record<string, unknown>;
        const id = String(m.id || "");
        return {
          id,
          name: id,
          context_length: 8192,
          pricing: { prompt: "0", completion: "0" },
          description: "Local Ollama model",
        };
      });
    }
  } catch {
    // Both failed
  }

  return [];
}

/**
 * Validates connectivity to the configured Ollama endpoint directly from the client.
 */
export async function validateOllamaConnection(endpoint?: string): Promise<{
  ok: boolean;
  error?: string;
  modelCount?: number;
  models?: ORModel[];
}> {
  const targetEndpoint = sanitizeOllamaEndpoint(endpoint || getOllamaEndpoint());

  try {
    const models = await fetchOllamaModels(targetEndpoint);
    if (models.length > 0) {
      return { ok: true, modelCount: models.length, models };
    }

    // If models array is empty, verify if endpoint itself responds to /api/version or /
    const checkRes = await fetch(`${targetEndpoint}/api/version`, {
      method: "GET",
      signal: AbortSignal.timeout(5_000),
    }).catch(() => null);

    if (checkRes && checkRes.ok) {
      return { ok: true, modelCount: 0, models: [] };
    }

    const rootRes = await fetch(`${targetEndpoint}/`, {
      method: "GET",
      signal: AbortSignal.timeout(5_000),
    }).catch(() => null);

    if (rootRes && rootRes.ok) {
      return { ok: true, modelCount: 0, models: [] };
    }

    return {
      ok: false,
      error: getOllamaConnectionErrorMessage(targetEndpoint),
    };
  } catch (err: unknown) {
    return {
      ok: false,
      error: getOllamaConnectionErrorMessage(targetEndpoint, err),
    };
  }
}

/** Default timeout for Ollama streaming request (ms). */
const STREAM_TIMEOUT_MS = 90_000;
const MAX_RETRIES = 1;

export interface OllamaStreamOpts {
  endpoint?: string;
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

/**
 * Universal high-speed stream reader for Ollama streaming responses.
 * Handles both Ollama NDJSON streams (`{"message":{"content":"..."}}`)
 * and OpenAI-compatible SSE streams (`data: {"choices":[{"delta":{"content":"..."}}]}`).
 */
async function readOllamaStream(
  body: ReadableStream<Uint8Array>,
  onDelta: (text: string) => void,
  signal: AbortSignal,
  endpoint: string,
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

    let payloadStr = line;
    if (payloadStr.startsWith("data:")) {
      payloadStr = payloadStr.slice(5).trim();
    }
    if (payloadStr === "[DONE]") return;

    try {
      const parsed = JSON.parse(payloadStr);
      if (parsed?.error) {
        const errMsg =
          typeof parsed.error === "string"
            ? parsed.error
            : parsed.error.message || "Ollama model streaming error";
        throw friendlyOllamaError(500, errMsg, endpoint);
      }

      // 1. Ollama /api/chat format: { message: { content: "..." }, done: boolean }
      // 2. Ollama /api/generate format: { response: "...", done: boolean }
      // 3. OpenAI /v1/chat/completions format: { choices: [ { delta: { content: "..." } } ] }
      const delta =
        parsed?.message?.content ??
        parsed?.response ??
        parsed?.choices?.[0]?.delta?.content ??
        parsed?.choices?.[0]?.delta?.text ??
        parsed?.choices?.[0]?.text ??
        "";

      if (typeof delta === "string" && delta.length > 0) {
        emittedTokens += delta.length;
        onDelta(delta);
      }
    } catch (err) {
      if (err instanceof OllamaError) throw err;
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
    try {
      reader.releaseLock();
    } catch {}
  }
}

/**
 * Direct client-side streaming completion to the configured Ollama endpoint.
 * Never passes through the server backend or proxy.
 */
export async function streamOllamaCompletion(opts: OllamaStreamOpts): Promise<void> {
  const targetEndpoint = sanitizeOllamaEndpoint(opts.endpoint || getOllamaEndpoint());
  const { signal, cleanup } = combinedSignal(opts.signal, opts.timeoutMs ?? STREAM_TIMEOUT_MS);

  // Format Ollama request payload
  const model = String(opts.payload.model || "");
  const messages = Array.isArray(opts.payload.messages) ? opts.payload.messages : [];
  const temperature =
    typeof opts.payload.temperature === "number" ? opts.payload.temperature : 0.3;

  const ollamaNativeBody = JSON.stringify({
    model,
    messages,
    stream: true,
    format: "json",
    options: {
      temperature,
    },
  });

  try {
    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      if (signal.aborted) throw new DOMException("Aborted", "AbortError");

      let response: Response;
      let usedEndpoint = `${targetEndpoint}/api/chat`;

      try {
        response = await fetch(usedEndpoint, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Accept: "application/json, text/event-stream",
          },
          body: ollamaNativeBody,
          signal,
        });

        // If /api/chat returns 404, fallback to /v1/chat/completions
        if (response.status === 404) {
          try {
            await response.body?.cancel();
          } catch {}
          usedEndpoint = `${targetEndpoint}/v1/chat/completions`;
          const openaiBody = JSON.stringify({
            model,
            messages,
            stream: true,
            temperature,
            response_format: { type: "json_object" },
          });

          response = await fetch(usedEndpoint, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Accept: "text/event-stream, application/json",
            },
            body: openaiBody,
            signal,
          });
        }
      } catch (fetchErr: unknown) {
        if (signal.aborted) throw fetchErr;
        const msg = getOllamaConnectionErrorMessage(targetEndpoint, fetchErr);
        throw new OllamaError(msg, 0, "network");
      }

      if (!response.ok) {
        const bodyText = await response.text();
        const friendly = friendlyOllamaError(response.status, bodyText, targetEndpoint);
        if ((response.status === 429 || response.status === 503) && attempt < MAX_RETRIES) {
          await new Promise((r) => setTimeout(r, 1000));
          continue;
        }
        throw friendly;
      }

      if (!response.body) {
        throw new OllamaError("Ollama returned an empty stream.", 502, "server");
      }

      let totalChars = 0;
      try {
        totalChars = await readOllamaStream(
          response.body,
          opts.onDelta,
          signal,
          targetEndpoint,
        );
      } finally {
        try {
          if (!response.body.locked) {
            await response.body.cancel();
          }
        } catch {}
      }

      if (totalChars === 0 && !signal.aborted) {
        throw new OllamaError(
          `Ollama model "${model}" returned an empty response. Please verify that the model is loaded properly.`,
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
