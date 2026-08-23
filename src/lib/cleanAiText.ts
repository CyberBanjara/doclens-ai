/**
 * Cleans and sanitizes AI output (translated/explained results) before saving to local DB
 * and feeding to TTS.
 *
 * Removes all hashes (#), asterisks (*), markdown syntax, and formatting artifacts so:
 * 1. Text is clean, readable, and naturally formatted.
 * 2. TTS engine never pronounces "hash", "hashtag", "asterisk", or "star".
 * 3. Saved records in IndexedDB / Supabase stay clean and formatted.
 */
export function cleanAiText(text: string | null | undefined): string {
  if (!text || typeof text !== "string") return "";

  let cleaned = text;

  // 1. Remove markdown code fences (```lang ... ``` or standalone ```)
  cleaned = cleaned.replace(/```[a-zA-Z0-9_-]*\n?/g, "").replace(/```/g, "");

  // 2. Remove markdown heading hashes at the beginning of lines (e.g. "### Heading" -> "Heading")
  cleaned = cleaned.replace(/^[ \t]*#{1,6}[ \t]*/gm, "");

  // 3. Remove bullet asterisks at the beginning of lines (e.g. "* Item" -> "Item")
  cleaned = cleaned.replace(/^[ \t]*\*[ \t]+/gm, "");

  // 4. Unwrap bold / italic / bold-italic markdown (e.g. "***text***", "**text**", "*text*")
  cleaned = cleaned.replace(/\*{3}([^*]+?)\*{3}/g, "$1");
  cleaned = cleaned.replace(/\*{2}([^*]+?)\*{2}/g, "$1");
  cleaned = cleaned.replace(/\*([^*]+?)\*/g, "$1");

  // 5. Remove any remaining asterisk or hash symbols anywhere in the string
  cleaned = cleaned.replace(/[*#]/g, "");

  // 6. Clean markdown blockquotes (e.g. "> Quote" -> "Quote")
  cleaned = cleaned.replace(/^[ \t]*>[ \t]?/gm, "");

  // 7. Clean markdown horizontal rules (e.g. "---", "___")
  cleaned = cleaned.replace(/^[ \t]*[-_]{3,}[ \t]*$/gm, "");

  // 8. Unwrap inline backticks (e.g. `code` -> code)
  cleaned = cleaned.replace(/`([^`]+)`/g, "$1").replace(/`/g, "");

  // 9. Clean up trailing spaces per line and excessive blank lines
  cleaned = cleaned
    .split("\n")
    .map((line) => line.replace(/[^\S\r\n]{2,}/g, " ").trimEnd())
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  return cleaned;
}
