/**
 * Voice-Language Intelligence Engine
 *
 * Central module for mapping UI language names (including native scripts)
 * to BCP-47 locale prefixes, and filtering voices from any provider
 * (browser native, Piper neural, Google TTS, etc.) by language.
 *
 * Adding a new language is a single entry in LANGUAGE_ALIASES + LANGUAGES.
 */

import type { TtsVoice } from "@/context/TtsContext";

/* ─── Language metadata for UI cards ─── */

export interface LanguageInfo {
  /** The value stored in localStorage / used as the translation target */
  id: string;
  /** Name in native script (displayed prominently on the card) */
  native: string;
  /** English name (displayed as subtitle) */
  english: string;
  /** Script family name — useful for future grouping */
  script: string;
}

export const LANGUAGES: LanguageInfo[] = [
  { id: "हिंदी", native: "हिंदी", english: "Hindi", script: "Devanagari" },
  { id: "English", native: "English", english: "English", script: "Latin" },
  { id: "বাংলা", native: "বাংলা", english: "Bengali", script: "Bengali" },
  { id: "मराठी", native: "मराठी", english: "Marathi", script: "Devanagari" },
  { id: "తెలుగు", native: "తెలుగు", english: "Telugu", script: "Telugu" },
  { id: "தமிழ்", native: "தமிழ்", english: "Tamil", script: "Tamil" },
  { id: "ગુજરાતી", native: "ગુજરાતી", english: "Gujarati", script: "Gujarati" },
  { id: "ಕನ್ನಡ", native: "ಕನ್ನಡ", english: "Kannada", script: "Kannada" },
  { id: "മലയാളം", native: "മലയാളം", english: "Malayalam", script: "Malayalam" },
  { id: "ਪੰਜਾਬੀ", native: "ਪੰਜਾਬੀ", english: "Punjabi", script: "Gurmukhi" },
  { id: "ଓଡ଼ିଆ", native: "ଓଡ଼ିଆ", english: "Odia", script: "Odia" },
  { id: "اردو", native: "اردو", english: "Urdu", script: "Arabic" },
  { id: "অসমীয়া", native: "অসমীয়া", english: "Assamese", script: "Bengali" },
  { id: "Spanish", native: "Español", english: "Spanish", script: "Latin" },
  { id: "French", native: "Français", english: "French", script: "Latin" },
  { id: "German", native: "Deutsch", english: "German", script: "Latin" },
  { id: "Mandarin", native: "中文", english: "Mandarin", script: "Chinese" },
  { id: "Japanese", native: "日本語", english: "Japanese", script: "Japanese" },
  { id: "Arabic", native: "العربية", english: "Arabic", script: "Arabic" },
  { id: "Russian", native: "Русский", english: "Russian", script: "Cyrillic" },
  { id: "Portuguese", native: "Português", english: "Portuguese", script: "Latin" },
  // Additional languages with Piper neural voices
  { id: "Albanian", native: "Shqip", english: "Albanian", script: "Latin" },
  { id: "Armenian", native: "Հայերեն", english: "Armenian", script: "Armenian" },
  { id: "Basque", native: "Euskara", english: "Basque", script: "Latin" },
  { id: "Bulgarian", native: "Български", english: "Bulgarian", script: "Cyrillic" },
  { id: "Catalan", native: "Català", english: "Catalan", script: "Latin" },
  { id: "Czech", native: "Čeština", english: "Czech", script: "Latin" },
  { id: "Danish", native: "Dansk", english: "Danish", script: "Latin" },
  { id: "Dutch", native: "Nederlands", english: "Dutch", script: "Latin" },
  { id: "Estonian", native: "Eesti", english: "Estonian", script: "Latin" },
  { id: "Finnish", native: "Suomi", english: "Finnish", script: "Latin" },
  { id: "Georgian", native: "ქართული", english: "Georgian", script: "Georgian" },
  { id: "Greek", native: "Ελληνικά", english: "Greek", script: "Greek" },
  { id: "Hebrew", native: "עברית", english: "Hebrew", script: "Hebrew" },
  { id: "Hungarian", native: "Magyar", english: "Hungarian", script: "Latin" },
  { id: "Icelandic", native: "Íslenska", english: "Icelandic", script: "Latin" },
  { id: "Indonesian", native: "Bahasa Indonesia", english: "Indonesian", script: "Latin" },
  { id: "Italian", native: "Italiano", english: "Italian", script: "Latin" },
  { id: "Kazakh", native: "Қазақша", english: "Kazakh", script: "Cyrillic" },
  { id: "Korean", native: "한국어", english: "Korean", script: "Hangul" },
  { id: "Kurdish", native: "Kurmancî", english: "Kurdish", script: "Latin" },
  { id: "Latvian", native: "Latviešu", english: "Latvian", script: "Latin" },
  { id: "Lithuanian", native: "Lietuvių", english: "Lithuanian", script: "Latin" },
  { id: "Luxembourgish", native: "Lëtzebuergesch", english: "Luxembourgish", script: "Latin" },
  { id: "Nepali", native: "नेपाली", english: "Nepali", script: "Devanagari" },
  { id: "Norwegian", native: "Norsk", english: "Norwegian", script: "Latin" },
  { id: "Persian", native: "فارسی", english: "Persian", script: "Arabic" },
  { id: "Polish", native: "Polski", english: "Polish", script: "Latin" },
  { id: "Romanian", native: "Română", english: "Romanian", script: "Latin" },
  { id: "Serbian", native: "Srpski", english: "Serbian", script: "Latin" },
  { id: "Slovak", native: "Slovenčina", english: "Slovak", script: "Latin" },
  { id: "Slovenian", native: "Slovenščina", english: "Slovenian", script: "Latin" },
  { id: "Swahili", native: "Kiswahili", english: "Swahili", script: "Latin" },
  { id: "Swedish", native: "Svenska", english: "Swedish", script: "Latin" },
  { id: "Thai", native: "ไทย", english: "Thai", script: "Thai" },
  { id: "Turkish", native: "Türkçe", english: "Turkish", script: "Latin" },
  { id: "Ukrainian", native: "Українська", english: "Ukrainian", script: "Cyrillic" },
  { id: "Vietnamese", native: "Tiếng Việt", english: "Vietnamese", script: "Latin" },
  { id: "Welsh", native: "Cymraeg", english: "Welsh", script: "Latin" },
];

/* ─── Alias Map: UI name → BCP-47 locale prefix(es) ─── */

/**
 * Maps every known UI language name (in any script) to BCP-47 locale
 * prefix(es). The matching is case-insensitive for Latin scripts and
 * exact for non-Latin scripts. Multiple aliases allow intelligent
 * matching (e.g. "Hindi" / "हिन्दी" / "हिंदी" all resolve to ["hi"]).
 */
const LANGUAGE_ALIASES: Record<string, string[]> = {
  // Hindi variants
  hindi: ["hi"],
  हिंदी: ["hi"],
  हिन्दी: ["hi"],

  // Bengali variants
  bengali: ["bn"],
  bangla: ["bn"],
  বাংলা: ["bn"],

  // Telugu variants
  telugu: ["te"],
  తెలుగు: ["te"],

  // Malayalam variants
  malayalam: ["ml"],
  മലയാളം: ["ml"],

  // Tamil variants
  tamil: ["ta"],
  தமிழ்: ["ta"],

  // English
  english: ["en"],

  // Spanish
  spanish: ["es"],
  español: ["es"],

  // Mandarin / Chinese
  mandarin: ["zh"],
  chinese: ["zh"],
  中文: ["zh"],
  普通话: ["zh"],

  // French
  french: ["fr"],
  français: ["fr"],

  // German
  german: ["de"],
  deutsch: ["de"],

  // Japanese
  japanese: ["ja"],
  日本語: ["ja"],

  // Korean
  korean: ["ko"],
  한국어: ["ko"],

  // Arabic
  arabic: ["ar"],
  العربية: ["ar"],

  // Russian
  russian: ["ru"],
  русский: ["ru"],

  // Portuguese
  portuguese: ["pt"],
  português: ["pt"],

  // Italian
  italian: ["it"],
  italiano: ["it"],

  // Dutch
  dutch: ["nl"],
  nederlands: ["nl"],

  // Turkish
  turkish: ["tr"],
  türkçe: ["tr"],

  // Bulgarian
  bulgarian: ["bg"],
  български: ["bg"],

  // Welsh
  welsh: ["cy"],
  cymraeg: ["cy"],

  // Estonian
  estonian: ["et"],
  eesti: ["et"],

  // Basque
  basque: ["eu"],
  euskara: ["eu"],

  // Hebrew
  hebrew: ["he"],
  עברית: ["he"],

  // Armenian
  armenian: ["hy"],
  հայերեն: ["hy"],

  // Kurdish (Kurmanji)
  kurdish: ["ku"],
  kurmancî: ["ku"],

  // Latvian
  latvian: ["lv"],
  latviešu: ["lv"],

  // Albanian
  albanian: ["sq"],
  shqip: ["sq"],

  // Lithuanian
  lithuanian: ["lt"],
  lietuvių: ["lt"],

  // Polish
  polish: ["pl"],
  polski: ["pl"],

  // Vietnamese
  vietnamese: ["vi"],
  "tiếng việt": ["vi"],

  // Czech
  czech: ["cs"],
  čeština: ["cs"],

  // Danish
  danish: ["da"],
  dansk: ["da"],

  // Finnish
  finnish: ["fi"],
  suomi: ["fi"],

  // Greek
  greek: ["el"],
  ελληνικά: ["el"],

  // Hungarian
  hungarian: ["hu"],
  magyar: ["hu"],

  // Nepali
  nepali: ["ne"],
  नेपाली: ["ne"],

  // Norwegian
  norwegian: ["no", "nb", "nn"],
  norsk: ["no", "nb", "nn"],

  // Romanian
  romanian: ["ro"],
  română: ["ro"],

  // Slovak
  slovak: ["sk"],
  slovenčina: ["sk"],

  // Slovenian
  slovenian: ["sl"],
  slovenščina: ["sl"],

  // Swedish
  swedish: ["sv"],
  svenska: ["sv"],

  // Ukrainian
  ukrainian: ["uk"],
  українська: ["uk"],

  // Catalan
  catalan: ["ca"],
  català: ["ca"],

  // Persian / Farsi
  persian: ["fa"],
  farsi: ["fa"],
  فارسی: ["fa"],

  // Swahili
  swahili: ["sw"],
  kiswahili: ["sw"],

  // Kazakh
  kazakh: ["kk"],
  қазақша: ["kk"],

  // Georgian
  georgian: ["ka"],
  ქართული: ["ka"],

  // Icelandic
  icelandic: ["is"],
  íslenska: ["is"],

  // Serbian
  serbian: ["sr"],
  српски: ["sr"],
  srpski: ["sr"],

  // Luxembourgish
  luxembourgish: ["lb"],
  lëtzebuergesch: ["lb"],

  // Kannada
  kannada: ["kn"],
  ಕನ್ನಡ: ["kn"],

  // Marathi
  marathi: ["mr"],
  मराठी: ["mr"],

  // Gujarati
  gujarati: ["gu"],
  ગુજરાતી: ["gu"],

  // Punjabi
  punjabi: ["pa"],
  ਪੰਜਾਬੀ: ["pa"],
  پنجابی: ["pa"],

  // Urdu
  urdu: ["ur"],
  اردو: ["ur"],

  // Odia
  odia: ["or"],
  ଓଡ଼ିଆ: ["or"],

  // Assamese
  assamese: ["as"],
  অসমীয়া: ["as"],

  // Thai
  thai: ["th"],
  ไทย: ["th"],

  // Indonesian
  indonesian: ["id"],
  "bahasa indonesia": ["id"],

  // Malay
  malay: ["ms"],
  "bahasa melayu": ["ms"],
};

export function resolveLanguagePrefixes(language: string | unknown): string[] | null {
  if (!language || typeof language !== "string" || !language.trim()) return null;
  const normalized = language.trim().toLowerCase();
  if (LANGUAGE_ALIASES[normalized]) return LANGUAGE_ALIASES[normalized];

  // Try original (for non-Latin scripts that shouldn't be lowercased for lookup)
  const trimmed = language.trim();
  if (LANGUAGE_ALIASES[trimmed]) return LANGUAGE_ALIASES[trimmed];

  // If it's a BCP-47 code like "en-US", "hi-IN", "ta-IN", return [base]
  if (/^[a-z]{2,3}([-_][a-z]{4})?([-_][a-z]{2}|\d{3})?$/i.test(normalized)) {
    const base = normalized.split("-")[0].split("_")[0].toLowerCase();
    return [base];
  }

  return null;
}

/**
 * Check if a voice's lang tag matches any of the given locale prefixes.
 * e.g. lang="hi-IN" matches prefix "hi", lang="en-US" matches prefix "en".
 */
function voiceMatchesPrefixes(voiceLang: string, prefixes: string[]): boolean {
  const lower = voiceLang.toLowerCase();
  return prefixes.some((prefix) => {
    const p = prefix.toLowerCase();
    return lower === p || lower.startsWith(p + "-") || lower.startsWith(p + "_");
  });
}

/**
 * Filter TtsVoice[] to only those matching the given language.
 * Works across ALL providers (browser native, Piper neural, Google TTS, etc.)
 *
 * If no alias mapping is found, falls back to substring matching against
 * the voice's lang or name fields for future-proofing.
 */
export function filterVoicesByLanguage(voices: TtsVoice[], language: string | unknown): TtsVoice[] {
  if (!language || typeof language !== "string" || !language.trim()) return voices;

  const prefixes = resolveLanguagePrefixes(language);

  if (prefixes) {
    return voices.filter((v) => voiceMatchesPrefixes(v.lang, prefixes));
  }

  // Fuzzy fallback: match against voice lang or name
  const q = language.trim().toLowerCase();
  return voices.filter((v) => v.lang.toLowerCase().includes(q) || v.name.toLowerCase().includes(q));
}

/**
 * Filter the raw Piper catalog (Voice[] from vits-web) by language.
 * Uses the Voice object's rich language metadata for matching.
 */
export function filterPiperCatalogByLanguage(
  piperVoices: Array<{
    key: string;
    name: string;
    language: {
      code: string;
      name_native: string;
      name_english: string;
    };
    quality: string;
  }>,
  language: string | unknown,
): typeof piperVoices {
  if (!language || typeof language !== "string" || !language.trim()) return piperVoices;

  const prefixes = resolveLanguagePrefixes(language);

  if (prefixes) {
    return piperVoices.filter((v) => {
      const code = v.language.code.toLowerCase().replace("_", "-");
      return prefixes.some((p) => {
        const pl = p.toLowerCase();
        return (
          code === pl ||
          code.startsWith(pl + "-") ||
          code.startsWith(pl + "_") ||
          code.split("_")[0] === pl ||
          code.split("-")[0] === pl
        );
      });
    });
  }

  // Fuzzy fallback
  const q = language.trim().toLowerCase();
  return piperVoices.filter(
    (v) =>
      v.language.name_english.toLowerCase().includes(q) ||
      v.language.name_native.toLowerCase().includes(q) ||
      v.language.code.toLowerCase().includes(q),
  );
}

/**
 * Get the English name for a language ID, or return the ID itself.
 */
export function getLanguageEnglishName(languageId: string): string {
  const lang = LANGUAGES.find((l) => l.id === languageId);
  return lang?.english ?? languageId;
}
