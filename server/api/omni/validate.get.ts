import { defineEventHandler } from "h3";
import {
  resolveOmniConfig,
  OmniConfigError,
  getOmniUpstreamHeaders,
  sanitizeUpstreamError,
} from "../../lib/omnirouter-server";

export default defineEventHandler(async (event) => {
  let config;
  try {
    config = resolveOmniConfig(event);
  } catch (err) {
    if (err instanceof OmniConfigError) {
      return { ok: false, error: err.message };
    }
    throw err;
  }
  const { baseUrl, apiKey } = config;

  if (!baseUrl || !apiKey) {
    return {
      ok: false,
      error: "OmniRouter Gateway is not configured on the server.",
    };
  }

  try {
    const res = await fetch(`${baseUrl}/models`, {
      headers: getOmniUpstreamHeaders(apiKey),
      signal: AbortSignal.timeout(10_000),
    });

    if (!res.ok) {
      const txt = await res.text();
      return {
        ok: false,
        error:
          res.status === 401 || res.status === 403
            ? "OmniRouter rejected the API key. Please check it and try again."
            : `Upstream Gateway HTTP ${res.status}: ${sanitizeUpstreamError(txt, baseUrl, apiKey)}`,
      };
    }

    const json = await res.json();
    const count = Array.isArray(json?.data) ? json.data.length : 0;

    return {
      ok: true,
      modelCount: count,
    };
  } catch (err: any) {
    return {
      ok: false,
      error: sanitizeUpstreamError(
        err?.message || "Could not connect to upstream OmniRouter gateway.",
        baseUrl,
        apiKey,
      ),
    };
  }
});
