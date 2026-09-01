/**
 * Language Table Mapping & Book ID Normalizer
 *
 * Provides utilities to map target language identifiers (native scripts,
 * English names, or BCP-47 codes) to their dedicated Supabase PostgreSQL
 * table names (e.g. `translations_hindi`, `translations_telugu`, etc.),
 * and normalizes book IDs to support folder-prefixed, code-based, and filename lookups.
 */

import { LANGUAGES, resolveLanguagePrefixes } from "./voiceLanguageMap";

/**
 * Normalized slug mapping for standard and extended languages.
 */
const LANGUAGE_SLUG_MAP: Record<string, string> = {
  // Indic Languages
  hindi: "hindi",
  हिंदी: "hindi",
  हिन्दी: "hindi",
  hi: "hindi",

  telugu: "telugu",
  తెలుగు: "telugu",
  te: "telugu",

  tamil: "tamil",
  தமிழ்: "tamil",
  ta: "tamil",

  bengali: "bengali",
  bangla: "bengali",
  বাংলা: "bengali",
  bn: "bengali",

  malayalam: "malayalam",
  മലയാളം: "malayalam",
  ml: "malayalam",

  kannada: "kannada",
  ಕನ್ನಡ: "kannada",
  kn: "kannada",

  marathi: "marathi",
  मराठी: "marathi",
  mr: "marathi",

  gujarati: "gujarati",
  ગુજરાતી: "gujarati",
  gu: "gujarati",

  punjabi: "punjabi",
  ਪੰਜਾਬੀ: "punjabi",
  pa: "punjabi",

  urdu: "urdu",
  اردو: "urdu",
  ur: "urdu",

  odia: "odia",
  ଓଡ଼ିଆ: "odia",
  or: "odia",

  assamese: "assamese",
  অসমীয়া: "assamese",
  as: "assamese",

  // Global & European Languages
  english: "english",
  en: "english",

  spanish: "spanish",
  español: "spanish",
  es: "spanish",

  french: "french",
  français: "french",
  fr: "french",

  german: "german",
  deutsch: "german",
  de: "german",

  mandarin: "mandarin",
  chinese: "mandarin",
  中文: "mandarin",
  普通话: "mandarin",
  zh: "mandarin",

  japanese: "japanese",
  日本語: "japanese",
  ja: "japanese",

  korean: "korean",
  한국어: "korean",
  ko: "korean",

  arabic: "arabic",
  العربية: "arabic",
  ar: "arabic",

  russian: "russian",
  русский: "russian",
  ru: "russian",

  portuguese: "portuguese",
  português: "portuguese",
  pt: "portuguese",

  italian: "italian",
  italiano: "italian",
  it: "italian",

  dutch: "dutch",
  nederlands: "dutch",
  nl: "dutch",

  turkish: "turkish",
  türkçe: "turkish",
  tr: "turkish",

  polish: "polish",
  polski: "polish",
  pl: "polish",

  vietnamese: "vietnamese",
  "tiếng việt": "vietnamese",
  vi: "vietnamese",
};

/**
 * Resolves a language identifier (in any script or name) to a normalized
 * language slug (e.g., 'hindi', 'telugu', 'bengali').
 */
export function getLanguageSlug(language: string): string {
  if (!language || !language.trim()) {
    return "hindi";
  }

  const trimmed = language.trim();
  const lower = trimmed.toLowerCase();

  // 1. Direct slug map lookup
  if (LANGUAGE_SLUG_MAP[lower]) {
    return LANGUAGE_SLUG_MAP[lower];
  }
  if (LANGUAGE_SLUG_MAP[trimmed]) {
    return LANGUAGE_SLUG_MAP[trimmed];
  }

  // 2. Check UI LANGUAGES catalog
  const foundInCatalog = LANGUAGES.find(
    (l) =>
      l.id.toLowerCase() === lower ||
      l.native.toLowerCase() === lower ||
      l.english.toLowerCase() === lower,
  );
  if (foundInCatalog) {
    return foundInCatalog.english.toLowerCase().replace(/[^a-z0-9]/g, "");
  }

  // 3. Check BCP-47 locale prefixes
  const prefixes = resolveLanguagePrefixes(trimmed);
  if (prefixes && prefixes.length > 0) {
    const p = prefixes[0].toLowerCase();
    if (LANGUAGE_SLUG_MAP[p]) {
      return LANGUAGE_SLUG_MAP[p];
    }
  }

  // 4. Fallback sanitization for custom languages
  const sanitized = lower.replace(/[^a-z0-9_]/g, "_").replace(/^_+|_+$/g, "");
  return sanitized || "hindi";
}

/**
 * Returns user-facing display metadata (id, native script name, English name) for a given slug or language string.
 */
export function getLanguageInfoFromSlug(slugOrLang: string): {
  id: string;
  native: string;
  english: string;
} {
  const slug = getLanguageSlug(slugOrLang);

  // Match in LANGUAGES catalog
  const found = LANGUAGES.find(
    (l) =>
      l.english.toLowerCase().replace(/[^a-z0-9]/g, "") === slug ||
      l.id.toLowerCase() === slug ||
      l.native.toLowerCase() === slug,
  );
  if (found) {
    return {
      id: found.id,
      native: found.native,
      english: found.english,
    };
  }

  // Common title-case fallback
  const capitalized = slug.charAt(0).toUpperCase() + slug.slice(1);
  return {
    id: capitalized,
    native: capitalized,
    english: capitalized,
  };
}

/**
 * List of standard supported language tables in Supabase
 */
export const SUPPORTED_TRANSLATION_SLUGS = [
  "hindi",
  "telugu",
  "tamil",
  "bengali",
  "malayalam",
  "kannada",
  "marathi",
  "gujarati",
  "english",
  "spanish",
  "french",
  "german",
  "mandarin",
] as const;

/**
 * Resolves a language identifier (in any script or name) to a sanitized
 * Supabase table name in the format `translations_<slug>`.
 *
 * Example:
 *  "हिंदी" -> "translations_hindi"
 *  "Telugu" -> "translations_telugu"
 *  "fr" -> "translations_french"
 */
export function getLanguageTableName(language: string): string {
  const slug = getLanguageSlug(language);
  return `translations_${slug}`;
}

/**
 * Normalizes a book key, filename, or ID into search candidate IDs.
 * This guarantees matches whether the book is identified by:
 * - Full R2 path (e.g. "history/class-10/jess101.pdf")
 * - Base filename (e.g. "jess101.pdf")
 * - Code without extension (e.g. "jess101")
 * - Document UUID (e.g. "9a1b2c3d-...")
 */
export function normalizeBookCandidates(keyOrFileName: string, docId?: string): {
  primaryId: string;
  candidateIds: string[];
} {
  const raw = (keyOrFileName || "").trim();
  if (!raw) {
    const fallback = docId || "unknown_book";
    return { primaryId: fallback, candidateIds: [fallback] };
  }

  const candidatesSet = new Set<string>();

  // Full key
  candidatesSet.add(raw);

  // Filename without folder path
  const parts = raw.split("/").map((p) => p.trim()).filter(Boolean);
  const baseName = parts[parts.length - 1] || raw;
  candidatesSet.add(baseName);

  // Base code without extension (e.g. "jess101" from "jess101.pdf")
  const baseCode = baseName.replace(/\.[^/.]+$/, "");
  if (baseCode) {
    candidatesSet.add(baseCode);
  }

  // Also include document ID if available
  if (docId && docId.trim()) {
    candidatesSet.add(docId.trim());
  }

  const candidateIds = Array.from(candidatesSet);
  // Primary ID is the cleanest standard filename key
  const primaryId = baseName || raw;

  return { primaryId, candidateIds };
}
