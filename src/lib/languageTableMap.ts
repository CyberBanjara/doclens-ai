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
export function getLanguageSlug(language: string | unknown): string {
  if (!language || typeof language !== "string" || !language.trim()) {
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

export type SupportedTranslationSlug = (typeof SUPPORTED_TRANSLATION_SLUGS)[number];

/**
 * Checks whether a language has a dedicated physical translation table in Supabase.
 */
export function isSupportedTranslationLanguage(language: string | unknown): boolean {
  if (!language || typeof language !== "string" || !language.trim()) {
    return false;
  }
  const slug = getLanguageSlug(language);
  return (SUPPORTED_TRANSLATION_SLUGS as readonly string[]).includes(slug);
}

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
 * ============================================================================
 * SCRIPT-LEVEL LANGUAGE GUARD
 * ----------------------------------------------------------------------------
 * Translations are stored in per-language tables, but nothing at the database
 * level stops (say) Bengali text from being upserted into `translations_hindi`.
 * These helpers detect the dominant writing system of a text so both the write
 * path and the read path can reject content that is clearly in another script.
 *
 * The check is deliberately conservative: it only reports a mismatch when the
 * text is dominated by a *different non-Latin* script than the one the language
 * is written in (Latin is ignored for Indic targets because translations
 * legitimately contain English terms, numbers and names).
 * ============================================================================
 */

type ScriptId =
  | "devanagari"
  | "bengali"
  | "gurmukhi"
  | "gujarati"
  | "odia"
  | "tamil"
  | "telugu"
  | "kannada"
  | "malayalam"
  | "arabic"
  | "han"
  | "kana"
  | "hangul"
  | "cyrillic"
  | "latin";

const SCRIPT_RANGES: Array<[ScriptId, number, number]> = [
  ["devanagari", 0x0900, 0x097f],
  ["bengali", 0x0980, 0x09ff],
  ["gurmukhi", 0x0a00, 0x0a7f],
  ["gujarati", 0x0a80, 0x0aff],
  ["odia", 0x0b00, 0x0b7f],
  ["tamil", 0x0b80, 0x0bff],
  ["telugu", 0x0c00, 0x0c7f],
  ["kannada", 0x0c80, 0x0cff],
  ["malayalam", 0x0d00, 0x0d7f],
  ["arabic", 0x0600, 0x06ff],
  ["cyrillic", 0x0400, 0x04ff],
  ["kana", 0x3040, 0x30ff],
  ["han", 0x4e00, 0x9fff],
  ["hangul", 0xac00, 0xd7af],
];

/** Expected script per language slug. Languages not listed are never script-checked. */
const SLUG_SCRIPT: Record<string, ScriptId> = {
  hindi: "devanagari",
  marathi: "devanagari",
  bengali: "bengali",
  assamese: "bengali",
  punjabi: "gurmukhi",
  gujarati: "gujarati",
  odia: "odia",
  tamil: "tamil",
  telugu: "telugu",
  kannada: "kannada",
  malayalam: "malayalam",
  urdu: "arabic",
  arabic: "arabic",
  mandarin: "han",
  russian: "cyrillic",
  korean: "hangul",
  english: "latin",
  spanish: "latin",
  french: "latin",
  german: "latin",
};

/** Returns the dominant non-Latin script of a text (or "latin" if no other script is present). */
export function detectDominantScript(text: string): ScriptId | null {
  if (!text) return null;
  const counts = new Map<ScriptId, number>();
  let latin = 0;
  // Sample at most the first ~4000 chars — plenty to identify the script cheaply.
  const sample = text.length > 4000 ? text.slice(0, 4000) : text;
  for (const ch of sample) {
    const cp = ch.codePointAt(0)!;
    if ((cp >= 0x41 && cp <= 0x5a) || (cp >= 0x61 && cp <= 0x7a) || (cp >= 0xc0 && cp <= 0x24f)) {
      latin++;
      continue;
    }
    for (const [id, lo, hi] of SCRIPT_RANGES) {
      if (cp >= lo && cp <= hi) {
        counts.set(id, (counts.get(id) || 0) + 1);
        break;
      }
    }
  }
  let best: ScriptId | null = null;
  let bestCount = 0;
  for (const [id, n] of counts) {
    if (n > bestCount) {
      best = id;
      bestCount = n;
    }
  }
  // Require a meaningful amount of script characters before deciding.
  if (best && bestCount >= 20) return best;
  if (latin >= 20) return "latin";
  return null;
}

/**
 * True when `content` is clearly written in a script that does not belong to `language`
 * (e.g. Bengali text for Hindi). Returns false whenever the result is uncertain.
 */
export function isContentScriptMismatch(language: string, content: string): boolean {
  const expected = SLUG_SCRIPT[getLanguageSlug(language)];
  if (!expected) return false;
  const actual = detectDominantScript(content);
  if (!actual) return false;
  if (expected === "latin") {
    // Latin-script languages: mismatch only when a non-Latin script dominates.
    return actual !== "latin";
  }
  // Non-Latin languages: Latin-heavy pages (tables, formulas, names) are not proof of a mismatch.
  if (actual === "latin") return false;
  if (expected === "han" && actual === "kana") return false;
  return actual !== expected;
}

/**
 * Extracts the language slug a cached page result was produced in, from its
 * recorded `language` field or (for older records) its settings hash
 * `mode|language|style|temperature`. Returns null when it cannot be determined.
 */
export function getPageAiLanguageSlug(
  ai:
    | {
        language?: string;
        settingsHash?: string;
      }
    | null
    | undefined,
): string | null {
  if (!ai) return null;
  if (ai.language && ai.language.trim()) return getLanguageSlug(ai.language);
  if (ai.settingsHash) {
    const parts = ai.settingsHash.split("|");
    if (parts.length >= 2 && parts[1]?.trim()) return getLanguageSlug(parts[1]);
  }
  return null;
}

/**
 * Normalizes a book key, filename, or ID into search candidate IDs.
 * This guarantees matches whether the book is identified by:
 * - Full R2 path (e.g. "history/class-10/jess101.pdf")
 * - Base filename (e.g. "jess101.pdf")
 * - Code without extension (e.g. "jess101")
 * - Document UUID (e.g. "9a1b2c3d-...")
 */
export function normalizeBookCandidates(
  keyOrFileName: string,
  docId?: string,
): {
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
  const parts = raw
    .split("/")
    .map((p) => p.trim())
    .filter(Boolean);
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
