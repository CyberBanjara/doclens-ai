import { cleanAiText } from "./cleanAiText";

const SENTENCE_DELIMITER_REGEX =
  /([.!?|।॥]+(?:\s+|\n+|$)|[\u3002\uff01\uff1f]+|\n\n+)/;

const NON_SENTENCE_ENDING_ABBREV =
  /\b(?:[A-Za-z]|Adm|Assn|Ave|Blvd|Bldg|Brig|Capt|Cmdr|Col|Comdr|Corp|Cpl|Ct|Dept|Dr|Drs|Fig|Figs|Fr|Ft|Gen|Gov|Hon|Inc|Jr|Lieut|Ln|Lt|Ltd|Maj|Messrs|Mmes|Mr|Mrs|Ms|Mt|Mx|No|Nos|Pl|Pres|Prof|Rd|Rep|Reps|Rev|Sen|Sens|Sgt|Sr|St|Ste|Univ|Jan|Feb|Mar|Apr|Aug|Sep|Sept|Oct|Nov|Dec|dept|ed|eds|est|fig|figs|misc|pp|ref|refs|vol|vols|vs)\.$/i;

/**
 * Splits input text into clean sentence chunks.
 * Uses sentence-terminating punctuation rules and paragraph breaks
 * without arbitrarily breaking on single line wraps within sentences.
 */
export function splitSentences(text: string): string[] {
  if (!text) return [];
  const cleaned = cleanAiText(text);
  if (!cleaned) return [];

  const tokens = cleaned.split(SENTENCE_DELIMITER_REGEX);
  const rawChunks: string[] = [];

  for (let i = 0; i < tokens.length; i += 2) {
    const part = tokens[i];
    const sep = tokens[i + 1] || "";

    if (part) {
      const fullPart = part + sep;
      // If the previous chunk ended with an abbreviation, merge them
      if (
        rawChunks.length > 0 &&
        NON_SENTENCE_ENDING_ABBREV.test(rawChunks[rawChunks.length - 1].trim())
      ) {
        rawChunks[rawChunks.length - 1] += fullPart;
      } else {
        rawChunks.push(fullPart);
      }
    } else if (sep) {
      if (rawChunks.length > 0) {
        rawChunks[rawChunks.length - 1] += sep;
      } else {
        rawChunks.push(sep);
      }
    }
  }

  // Safety fallback: only if a chunk has no punctuation and is extremely long (> 500 chars),
  // split it by word boundary. Otherwise, keep it intact.
  const finalChunks: string[] = [];
  for (const chunk of rawChunks) {
    if (chunk.length > 500) {
      finalChunks.push(...splitByLength(chunk, 500));
    } else if (chunk.trim().length > 0) {
      finalChunks.push(chunk);
    }
  }

  return finalChunks;
}

function splitByLength(text: string, limit: number): string[] {
  const words = text.split(/(\s+)/);
  const chunks: string[] = [];
  let current = "";

  for (const word of words) {
    if (current.length + word.length <= limit) {
      current += word;
    } else {
      if (current.trim()) chunks.push(current);
      current = word;
    }
  }
  if (current.trim()) chunks.push(current);
  return chunks.filter(Boolean);
}

/**
 * Promise-wrapped speechSynthesis.getVoices() that resolves reliably
 * across browsers (handling initial cold loads when voices are not loaded yet).
 */
export function getBrowserVoices(): Promise<SpeechSynthesisVoice[]> {
  return new Promise((resolve) => {
    if (typeof window === "undefined" || !window.speechSynthesis) {
      resolve([]);
      return;
    }

    const voices = window.speechSynthesis.getVoices();
    if (voices.length > 0) {
      resolve(voices);
      return;
    }

    // Fallback: wait for onvoiceschanged
    const handleVoicesChanged = () => {
      const updatedVoices = window.speechSynthesis.getVoices();
      if (updatedVoices.length > 0) {
        window.speechSynthesis.onvoiceschanged = null;
        resolve(updatedVoices);
      }
    };
    window.speechSynthesis.onvoiceschanged = handleVoicesChanged;

    // Timeout fallback just in case
    setTimeout(() => {
      if (window.speechSynthesis.onvoiceschanged === handleVoicesChanged) {
        window.speechSynthesis.onvoiceschanged = null;
        resolve(window.speechSynthesis.getVoices());
      }
    }, 1500);
  });
}
