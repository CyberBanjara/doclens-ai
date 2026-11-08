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

import { getHeader } from "h3";
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

/** Request headers used by the client to pass user-provided OmniRouter credentials to the proxy. */
export const OMNI_BASE_URL_HEADER = "x-omni-base-url";
export const OMNI_API_KEY_HEADER = "x-omni-api-key";

export class OmniConfigError extends Error {
  statusCode: number;
  constructor(message: string, statusCode = 400) {
    super(message);
    this.statusCode = statusCode;
  }
}

/**
 * Blocks endpoints the serverless proxy must never call (SSRF protection) and that it
 * could not reach anyway (the user's own localhost / LAN).
 */
function isPrivateHost(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (
    host === "localhost" ||
    host.endsWith(".localhost") ||
    host.endsWith(".local") ||
    host.endsWith(".internal") ||
    host === "0.0.0.0" ||
    host === "::" ||
    host === "::1" ||
    (host.includes(":") && (host.startsWith("fc") || host.startsWith("fd"))) ||
    host.startsWith("fe80:") ||
    host.startsWith("::ffff:")
  ) {
    return true;
  }
  const v4 = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (v4) {
    const [a, b] = [Number(v4[1]), Number(v4[2])];
    if (a === 10 || a === 127 || a === 0) return true;
    if (a === 169 && b === 254) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
    if (a === 100 && b >= 64 && b <= 127) return true;
  }
  return false;
}

export function validateUserBaseUrl(raw: string): string {
  const baseUrl = sanitizeBaseUrl(raw);
  let parsed: URL;
  try {
    parsed = new URL(baseUrl);
  } catch {
    throw new OmniConfigError("Invalid OmniRouter endpoint URL.");
  }
  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
    throw new OmniConfigError("OmniRouter endpoint must use http:// or https://.");
  }
  if (parsed.username || parsed.password) {
    throw new OmniConfigError("OmniRouter endpoint URL must not contain credentials.");
  }
  if (isPrivateHost(parsed.hostname)) {
    throw new OmniConfigError(
      "This endpoint is private (localhost/LAN) and cannot be reached from the cloud. Expose it publicly (e.g. ngrok or Cloudflare Tunnel) or allow CORS from this site.",
    );
  }
  return baseUrl;
}

type HeaderSource = Parameters<typeof getHeader>[0];

function readHeader(event: HeaderSource, name: string): string {
  return (getHeader(event, name) || "").trim();
}

/**
 * Resolves the OmniRouter config for a request. When the client supplies its own endpoint
 * (user-configured in Settings), that endpoint and the user's key are used exclusively —
 * the server's own key is never forwarded to a user-supplied URL. Otherwise falls back to
 * the server env configuration.
 */
export function resolveOmniConfig(
  event: HeaderSource,
): OmniServerConfig & { source: "user" | "server" } {
  const serverCfg = getOmniServerConfig();
  const userBaseUrl = readHeader(event, OMNI_BASE_URL_HEADER);
  if (userBaseUrl) {
    const baseUrl = validateUserBaseUrl(userBaseUrl);
    const apiKey = readHeader(event, OMNI_API_KEY_HEADER);
    if (!apiKey) {
      throw new OmniConfigError("OmniRouter API key is required.", 401);
    }
    return { baseUrl, apiKey, defaultModel: serverCfg.defaultModel, source: "user" };
  }
  return { ...serverCfg, source: "server" };
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
export function sanitizeUpstreamError(rawText: string, baseUrl?: string, apiKey?: string): string {
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
