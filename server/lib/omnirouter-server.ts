/**
 * Server-side OmniRouter configuration & utilities.
 * Strictly executed in Node.js runtime / serverless functions.
 * Never exposed to client bundle.
 */

export interface OmniServerConfig {
  baseUrl: string;
  apiKey: string;
  defaultModel: string;
}

export function sanitizeBaseUrl(url: string): string {
  if (!url) return "";
  return url.trim().replace(/\/+$/, "");
}

export function getOmniServerConfig(): OmniServerConfig {
  const baseUrl = sanitizeBaseUrl(
    process.env.OMNIROUTER_BASE_URL || process.env.VITE_OMNIROUTER_BASE_URL || "",
  );
  const apiKey = (
    process.env.OMNIROUTER_API_KEY ||
    process.env.VITE_OMNIROUTER_API_KEY ||
    ""
  ).trim();
  const defaultModel = (
    process.env.OMNIROUTER_DEFAULT_MODEL ||
    process.env.VITE_OMNIROUTER_DEFAULT_MODEL ||
    ""
  ).trim();

  return {
    baseUrl,
    apiKey,
    defaultModel,
  };
}

export function isOmniServerConfigured(): boolean {
  const { baseUrl, apiKey } = getOmniServerConfig();
  return Boolean(baseUrl && apiKey);
}

export function getOmniUpstreamHeaders(apiKey: string): Record<string, string> {
  return {
    Authorization: `Bearer ${apiKey}`,
    "Content-Type": "application/json",
    "ngrok-skip-browser-warning": "true",
  };
}
