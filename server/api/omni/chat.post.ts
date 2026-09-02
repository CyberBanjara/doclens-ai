import { defineEventHandler, readBody, createError, sendStream, setHeader, setResponseStatus } from "h3";
import { getOmniServerConfig, getOmniUpstreamHeaders } from "../../lib/omnirouter-server";

export default defineEventHandler(async (event) => {
  const { baseUrl, apiKey, defaultModel } = getOmniServerConfig();

  if (!baseUrl || !apiKey) {
    throw createError({
      statusCode: 503,
      statusMessage: "OmniRouter Gateway is not configured on the server.",
      data: { error: "OmniRouter Gateway is not configured." },
    });
  }

  const body = await readBody<Record<string, any>>(event);
  if (!body || typeof body !== "object") {
    throw createError({
      statusCode: 400,
      statusMessage: "Invalid or missing request body.",
      data: { error: "Invalid request payload." },
    });
  }

  const payload = {
    ...body,
    model: body.model || defaultModel || "auto/best-coding",
    stream: true,
  };

  try {
    const upstreamRes = await fetch(`${baseUrl}/chat/completions`, {
      method: "POST",
      headers: getOmniUpstreamHeaders(apiKey),
      body: JSON.stringify(payload),
    });

    if (!upstreamRes.ok) {
      const errText = await upstreamRes.text();
      let parsedError: any = null;
      try {
        parsedError = JSON.parse(errText);
      } catch {
        // Not JSON
      }

      const errMsg =
        parsedError?.error?.message ||
        parsedError?.message ||
        errText.slice(0, 200) ||
        `Upstream gateway returned ${upstreamRes.status}`;

      throw createError({
        statusCode: upstreamRes.status,
        statusMessage: `OmniRouter Error (${upstreamRes.status})`,
        data: { error: errMsg },
      });
    }

    if (!upstreamRes.body) {
      throw createError({
        statusCode: 502,
        statusMessage: "OmniRouter returned an empty stream response.",
        data: { error: "Empty stream body from gateway." },
      });
    }

    // Set streaming headers for Server-Sent Events (SSE)
    setHeader(event, "Content-Type", "text/event-stream; charset=utf-8");
    setHeader(event, "Cache-Control", "no-cache, no-transform");
    setHeader(event, "Connection", "keep-alive");
    setHeader(event, "X-Accel-Buffering", "no");
    setResponseStatus(event, 200);

    return sendStream(event, upstreamRes.body);
  } catch (err: any) {
    if (err.statusCode) throw err;
    throw createError({
      statusCode: 502,
      statusMessage: "Failed to connect to OmniRouter gateway.",
      data: { error: err?.message || "Gateway communication failure." },
    });
  }
});
