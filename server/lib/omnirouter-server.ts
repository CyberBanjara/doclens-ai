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
    fileEnv.OMNIROUTER_BASE_URL ||
      process.env.OMNIROUTER_BASE_URL ||
      fileEnv.VITE_OMNIROUTER_BASE_URL ||
      process.env.VITE_OMNIROUTER_BASE_URL ||
      "",
  );
  const apiKey = (
    fileEnv.OMNIROUTER_API_KEY ||
    process.env.OMNIROUTER_API_KEY ||
    fileEnv.VITE_OMNIROUTER_API_KEY ||
    process.env.VITE_OMNIROUTER_API_KEY ||
    ""
  ).trim();
  const defaultModel = (
    fileEnv.OMNIROUTER_DEFAULT_MODEL ||
    process.env.OMNIROUTER_DEFAULT_MODEL ||
    fileEnv.VITE_OMNIROUTER_DEFAULT_MODEL ||
    process.env.VITE_OMNIROUTER_DEFAULT_MODEL ||
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
