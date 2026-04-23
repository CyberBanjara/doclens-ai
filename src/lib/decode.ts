/**
 * Item-level text decoding utilities.
 * Handles: ligatures, soft hyphens, CID sequences, common PUA glyphs.
 * Light-touch: preserves non-English characters and meaningful Unicode.
 */

// Common Latin ligatures → ASCII pairs.
const LIGATURES: Record<string, string> = {
  "\uFB00": "ff",
  "\uFB01": "fi",
  "\uFB02": "fl",
  "\uFB03": "ffi",
  "\uFB04": "ffl",
  "\uFB05": "ft",
  "\uFB06": "st",
  "\u0132": "IJ",
  "\u0133": "ij",
  "\u0152": "OE",
  "\u0153": "oe",
  "\u00C6": "AE",
  "\u00E6": "ae",
};

// Some PDFs emit fancy quote/space variants — normalize a tiny subset only.
const SPACES = /[\u00A0\u2000-\u200B\u202F\u205F\u3000]/g;

// CID fallback markers from broken font extraction.
const CID_RE = /\(cid:\d+\)/g;

// Wingdings / dingbats fallback: a small map of the most common arrows/bullets.
const SYMBOL_MAP: Record<string, string> = {
  "\uF0B7": "•",
  "\uF0A7": "▪",
  "\uF0E0": "→",
  "\uF0DF": "←",
  "\uF0E1": "↓",
  "\uF0E2": "↑",
  "\uF0FC": "✓",
  "\uF0FB": "✗",
  "\uF076": "✔",
  "\uF077": "✘",
};

function mapSymbols(s: string): string {
  let out = "";
  for (const ch of s) out += SYMBOL_MAP[ch] ?? ch;
  return out;
}

function expandLigatures(s: string): string {
  let out = "";
  for (const ch of s) out += LIGATURES[ch] ?? ch;
  return out;
}

/**
 * Decode a single text item's string. Runs at item-level, before joining.
 */
export function decodeItemString(raw: string): string {
  if (!raw) return "";
  let s = raw;
  // strip CID markers (no useful info; leave a space so words don't fuse)
  s = s.replace(CID_RE, " ");
  // ligatures
  s = expandLigatures(s);
  // PUA dingbats / Wingdings remap
  s = mapSymbols(s);
  // soft hyphen — drop
  s = s.replace(/\u00AD/g, "");
  // normalize exotic spaces to a regular space
  s = s.replace(SPACES, " ");
  // Unicode NFC for combining marks (preserves accents like ñ, é, ü, 漢字)
  try {
    s = s.normalize("NFC");
  } catch {
    /* noop */
  }
  return s;
}

/**
 * Light final cleanup applied to a fully-joined page text.
 * Does NOT strip non-English characters.
 */
export function lightCleanPageText(text: string): string {
  return text
    // collapse runs of inline spaces but keep newlines
    .replace(/[ \t]{2,}/g, " ")
    // trim trailing spaces on each line
    .replace(/[ \t]+\n/g, "\n")
    // collapse 3+ newlines
    .replace(/\n{3,}/g, "\n\n")
    // join words broken by hyphenation at line ends: "exam-\nple" → "example"
    .replace(/(\w)-\n(\w)/g, "$1$2")
    .trim();
}
