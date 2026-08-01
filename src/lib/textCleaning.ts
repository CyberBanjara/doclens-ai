/**
 * Regex matching Unicode Private Use Area (PUA) characters.
 * These appear as garbled glyphs when fonts lack proper ToUnicode mappings.
 * Ranges: BMP PUA (E000-F8FF), Supplementary PUA-A (F0000-FFFFD),
 *         Supplementary PUA-B (100000-10FFFD)
 */
const PUA_REGEX = /[\uE000-\uF8FF]|\uDB80[\uDC00-\uDFFD]|\uDBC0[\uDC00-\uDFFD]/g;

/**
 * Replacement char / surrogate / control char ranges (except normal whitespace).
 */
const GARBAGE_REGEX = /[\uFFFD\uFFFE\uFFFF]|[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g;

/**
 * Regex matching standard Unicode symbol and dingbat ranges (ZapfDingbats, Wingdings, Webdings).
 * When normal English text extracts as these symbols, it indicates a bad font map.
 */
const SYMBOL_FONT_CHARS = /[\u2600-\u27BF]|[\uD83C-\uD83F][\uDC00-\uDFFF]/g;

/**
 * Clean extracted text by stripping unmappable PUA glyphs and garbage characters.
 * Returns the cleaned string plus a ratio of how much was garbage (0–1).
 */
export function cleanExtractedText(raw: string): { text: string; garbageRatio: number } {
  if (!raw) return { text: "", garbageRatio: 0 };

  const puaMatches = raw.match(PUA_REGEX);
  const garbageMatches = raw.match(GARBAGE_REGEX);
  const symbolMatches = raw.match(SYMBOL_FONT_CHARS);
  const totalGarbage =
    (puaMatches?.length ?? 0) + (garbageMatches?.length ?? 0) + (symbolMatches?.length ?? 0);
  const nonSpaceChars = raw.replace(/\s/g, "").length;
  const garbageRatio = nonSpaceChars > 0 ? totalGarbage / nonSpaceChars : 0;

  let cleaned = raw.replace(PUA_REGEX, "").replace(GARBAGE_REGEX, "");

  // Collapse whitespace artifacts left after stripping
  cleaned = cleaned
    .replace(/[ \t]{2,}/g, " ")
    .replace(/^ +| +$/gm, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  return { text: cleaned, garbageRatio };
}

function isGarbageLine(line: string): boolean {
  const trimmed = line.trim();
  if (trimmed.length === 0) return false;

  const words = trimmed.split(/\s+/);
  let score = 0;
  let standaloneSymbolsCount = 0;
  let unusualShortWordsCount = 0;
  let noVowelWordsCount = 0;
  let mixedCaseWordsCount = 0;

  const vowelRegex = /[aeiouyAEIOUY]/;
  const letterRegex = /[a-zA-Z]/;
  const alphanumericRegex = /[a-zA-Z0-9]/;

  const commonShortWords = new Set([
    "a",
    "i",
    "o",
    "am",
    "an",
    "as",
    "at",
    "be",
    "by",
    "co",
    "do",
    "dr",
    "ex",
    "go",
    "he",
    "hi",
    "id",
    "if",
    "in",
    "is",
    "it",
    "me",
    "mr",
    "ms",
    "my",
    "no",
    "of",
    "oh",
    "ok",
    "on",
    "or",
    "so",
    "st",
    "to",
    "tv",
    "up",
    "us",
    "vs",
    "we",
    "ye",
  ]);

  for (const word of words) {
    // 1. Standalone symbols/punctuation
    if (!alphanumericRegex.test(word)) {
      standaloneSymbolsCount++;
      continue;
    }

    const cleanWord = word.replace(/^[^a-zA-Z0-9]+|[^a-zA-Z0-9]+$/g, "");
    if (cleanWord.length === 0) {
      standaloneSymbolsCount++;
      continue;
    }

    // 2. Unusual short words (length 1 or 2, excluding numbers)
    const isNumber = /^\d+$/.test(cleanWord);
    if (cleanWord.length <= 2 && !isNumber) {
      const lower = cleanWord.toLowerCase();
      if (!commonShortWords.has(lower)) {
        unusualShortWordsCount++;
      }
    }

    // 3. No-vowel words (length >= 2, excluding purely numeric)
    const hasLetters = letterRegex.test(cleanWord);
    if (cleanWord.length >= 2 && hasLetters) {
      const hasVowels = vowelRegex.test(cleanWord);
      if (!hasVowels) {
        noVowelWordsCount++;
      }
    }

    // 4. Mixed Casing (e.g. oS, eS, oF, aR)
    if (/[a-z][A-Z]/.test(cleanWord)) {
      mixedCaseWordsCount++;
    }
  }

  const totalWords = words.length;

  // Score Accumulation
  score += standaloneSymbolsCount * 1.5;
  score += unusualShortWordsCount * 1.5;
  score += noVowelWordsCount * 2.0;
  score += mixedCaseWordsCount * 1.5;

  // Triple consecutive letters (like SSS, eee)
  if (/([a-zA-Z])\1\1/i.test(trimmed)) {
    score += 2.0;
  }

  // Character-level non-alphanumeric ratio (excluding spaces)
  const nonSpaceChars = trimmed.replace(/\s/g, "");
  const specialChars = nonSpaceChars.replace(/[a-zA-Z0-9.,?!'"()]/g, "");
  const specialCharRatio =
    nonSpaceChars.length > 0 ? specialChars.length / nonSpaceChars.length : 0;
  if (specialCharRatio > 0.15) {
    score += specialCharRatio * 8;
  }

  // If the line consists of exactly 1 word and it is a single character that is non-alphanumeric, it is garbage
  if (totalWords === 1) {
    const singleWord = words[0];
    if (singleWord.length <= 2 && !alphanumericRegex.test(singleWord)) {
      return true;
    }
    const cleanWord = singleWord.replace(/^[^a-zA-Z0-9]+|[^a-zA-Z0-9]+$/g, "");
    if (cleanWord.length >= 2 && !/^\d+$/.test(cleanWord) && !vowelRegex.test(cleanWord)) {
      return true;
    }
  }

  return score >= 2.5;
}

export function cleanOcrText(text: string): string {
  if (!text) return "";
  const lines = text.split("\n");
  const cleanedLines = lines.filter((line) => !isGarbageLine(line));
  return cleanedLines.join("\n").trim();
}

export function checkTextQuality(text: string): {
  isGarbled: boolean;
  isScanned: boolean;
  symbolRatio: number;
} {
  if (!text || text.trim().length === 0) {
    return { isGarbled: false, isScanned: true, symbolRatio: 0 };
  }
  const symbolMatches = text.match(SYMBOL_FONT_CHARS);
  const puaMatches = text.match(PUA_REGEX);
  const garbageMatches = text.match(GARBAGE_REGEX);

  const totalGarbage =
    (symbolMatches?.length ?? 0) + (puaMatches?.length ?? 0) + (garbageMatches?.length ?? 0);
  const nonSpaceChars = text.replace(/\s/g, "").length;
  const symbolRatio = nonSpaceChars > 0 ? totalGarbage / nonSpaceChars : 0;

  return {
    isGarbled: symbolRatio > 0.05 || totalGarbage > 3,
    isScanned: text.trim().length < 20,
    symbolRatio,
  };
}
