import { defineEventHandler, createError } from "h3";
import { getOmniServerConfig, getOmniUpstreamHeaders } from "../../lib/omnirouter-server";

export default defineEventHandler(async () => {
  const { baseUrl, apiKey } = getOmniServerConfig();

  if (!baseUrl || !apiKey) {
    throw createError({
      statusCode: 503,
      statusMessage: "OmniRouter Gateway is not configured on the server.",
      data: { error: "OmniRouter Gateway is not configured." },
    });
  }

  try {
    const res = await fetch(`${baseUrl}/models`, {
      headers: getOmniUpstreamHeaders(apiKey),
      signal: AbortSignal.timeout(10_000),
    });

    if (!res.ok) {
      const errText = await res.text();
      throw createError({
        statusCode: res.status,
        statusMessage: `Upstream OmniRouter error (${res.status})`,
        data: { error: errText.slice(0, 200) },
      });
    }

    const json = await res.json();
    const rawData = (json?.data as any[]) || [];
    const models = Array.isArray(rawData)
      ? rawData.map((m) => ({
          id: m.id,
          name: m.name || m.id,
          context_length: m.context_length || m.max_input_tokens || 128000,
          pricing: m.pricing || { prompt: "0", completion: "0" },
          description: m.description,
          top_provider: m.top_provider,
        }))
      : [];

    return {
      ok: true,
      data: models,
      count: models.length,
    };
  } catch (err: any) {
    if (err.statusCode) throw err;
    throw createError({
      statusCode: 502,
      statusMessage: "Failed to fetch models from OmniRouter gateway.",
      data: { error: err?.message || "Gateway unreachable" },
    });
  }
});
