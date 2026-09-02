import { defineEventHandler } from "h3";
import { getOmniServerConfig, getOmniUpstreamHeaders } from "../../lib/omnirouter-server";

export default defineEventHandler(async () => {
  const { baseUrl, apiKey } = getOmniServerConfig();

  if (!baseUrl || !apiKey) {
    return {
      ok: false,
      error: "OmniRouter Gateway is not configured on the server.",
    };
  }

  try {
    const res = await fetch(`${baseUrl}/models`, {
      headers: getOmniUpstreamHeaders(apiKey),
      signal: AbortSignal.timeout(8_000),
    });

    if (!res.ok) {
      const txt = await res.text();
      return {
        ok: false,
        error: `Upstream Gateway HTTP ${res.status}: ${txt.slice(0, 120)}`,
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
      error: err?.message || "Could not connect to upstream OmniRouter gateway.",
    };
  }
});
