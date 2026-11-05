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

import fs from "node:fs";
import path from "node:path";

function readEnvFallback(): Record<string, string> {
  try {
    const envPath = path.resolve(process.cwd(), ".env");
    if (!fs.existsSync(envPath)) return {};
    const content = fs.readFileSync(envPath, "utf-8");
    const parsed: Record<string, string> = {};
    for (const line of content.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eqIdx = trimmed.indexOf("=");
      if (eqIdx !== -1) {
        const key = trimmed.slice(0, eqIdx).trim();
        let val = trimmed.slice(eqIdx + 1).trim();
        if (
          (val.startsWith('"') && val.endsWith('"')) ||
          (val.startsWith("'") && val.endsWith("'"))
        ) {
          val = val.slice(1, -1);
        }
        parsed[key] = val;
      }
    }
    return parsed;
  } catch {
    return {};
  }
}

export function getOmniServerConfig(): OmniServerConfig {
  const fileEnv = readEnvFallback();

  const baseUrl = sanitizeBaseUrl(
    process.env.OMNIROUTER_BASE_URL ||
      fileEnv.OMNIROUTER_BASE_URL ||
      process.env.VITE_OMNIROUTER_BASE_URL ||
      fileEnv.VITE_OMNIROUTER_BASE_URL ||
      "",
  );
  const apiKey = (
    process.env.OMNIROUTER_API_KEY ||
    fileEnv.OMNIROUTER_API_KEY ||
    process.env.VITE_OMNIROUTER_API_KEY ||
    fileEnv.VITE_OMNIROUTER_API_KEY ||
    ""
  ).trim();
  const defaultModel = (
    process.env.OMNIROUTER_DEFAULT_MODEL ||
    fileEnv.OMNIROUTER_DEFAULT_MODEL ||
    process.env.VITE_OMNIROUTER_DEFAULT_MODEL ||
    fileEnv.VITE_OMNIROUTER_DEFAULT_MODEL ||
    ""
  ).trim();

  // Keep process.env in sync
  if (baseUrl) process.env.OMNIROUTER_BASE_URL = baseUrl;
  if (apiKey) process.env.OMNIROUTER_API_KEY = apiKey;
  if (defaultModel) process.env.OMNIROUTER_DEFAULT_MODEL = defaultModel;

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

/**
 * Sanitizes upstream error text to strictly ensure no internal endpoints, hostnames,
 * or credentials are ever returned or leaked to the client.
 */
export function sanitizeUpstreamError(
  rawText: string,
  baseUrl?: string,
  apiKey?: string,
): string {
  if (!rawText) return "OmniRouter upstream request failed.";
  let sanitized = rawText;
  if (apiKey && apiKey.length > 4) {
    sanitized = sanitized.replaceAll(apiKey, "[REDACTED_API_KEY]");
  }
  if (baseUrl) {
    try {
      const parsedUrl = new URL(baseUrl);
      sanitized = sanitized.replaceAll(baseUrl, "[REDACTED_GATEWAY]");
      if (parsedUrl.host) {
        sanitized = sanitized.replaceAll(parsedUrl.host, "[REDACTED_HOST]");
      }
    } catch {
      sanitized = sanitized.replaceAll(baseUrl, "[REDACTED_GATEWAY]");
    }
  }
  // Strip any raw bearer tokens or URL patterns that may have leaked from upstream error traces
  sanitized = sanitized.replace(/Bearer\s+[A-Za-z0-9_\-\.]+/gi, "Bearer [REDACTED]");
  sanitized = sanitized.replace(/https?:\/\/[^\s"'<>]+/gi, "[REDACTED_URL]");
  return sanitized.slice(0, 300).trim();
}
