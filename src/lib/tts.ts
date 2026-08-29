import { cleanAiText } from "./cleanAiText";

/**
 * Splits input text into clean sentence chunks.
 * Uses punctuation rules for Latin and East Asian languages.
 */
export function splitSentences(text: string): string[] {
  if (!text) return [];
  const cleaned = cleanAiText(text);
  if (!cleaned) return [];

  // Split by newlines, keeping the newlines in the tokens array
  const tokens = cleaned.split(/(\r?\n+)/);
  const chunks: string[] = [];
  let currentChunk = "";

  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i];
    if (!token) continue;

    // If it's a newline token, append to current chunk and flush
    if (/^\r?\n+$/.test(token)) {
      currentChunk += token;
      chunks.push(currentChunk);
      currentChunk = "";
      continue;
    }

    // Split the text line by punctuation/special characters
    const subChunks = splitLineByPunctuation(token);
    for (let j = 0; j < subChunks.length; j++) {
      if (j === subChunks.length - 1) {
        currentChunk += subChunks[j];
      } else {
        chunks.push(subChunks[j]);
      }
    }
  }

  if (currentChunk) {
    chunks.push(currentChunk);
  }

  return chunks;
}

function splitLineByPunctuation(text: string): string[] {
  // Matches sentence-terminating punctuation marks (. | ! ? etc.) followed by space or end of string.
  // We exclude commas (,) to let the native TTS engine handle them continuously with a natural micro-pause.
  const delimiterRegex = /([.|!?\u0964\u0965]+(?:\s+|$))/;
  const tokens = text.split(delimiterRegex);

  const chunks: string[] = [];
  const nonSentenceEndingAbbrev =
    /\b(?:[A-Za-z]|Adm|Assn|Ave|Blvd|Bldg|Brig|Capt|Cmdr|Col|Comdr|Corp|Cpl|Ct|Dept|Dr|Drs|Fig|Figs|Fig|Fr|Ft|Gen|Gov|Hon|Inc|Jr|Lieut|Ln|Lt|Ltd|Maj|Messrs|Mmes|Mr|Mrs|Ms|Mt|Mx|No|Nos|Pl|Pres|Prof|Rd|Rep|Reps|Rev|Sen|Sens|Sgt|Sr|St|Ste|Univ|Jan|Feb|Mar|Apr|Aug|Sep|Sept|Oct|Nov|Dec|dept|ed|eds|est|fig|figs|misc|pp|ref|refs|vol|vols|vs)\.$/;

  for (let i = 0; i < tokens.length; i += 2) {
    const part = tokens[i];
    const sep = tokens[i + 1] || "";

    if (part) {
      const fullPart = part + sep;
      // If the previous chunk ended with an abbreviation, merge them
      if (chunks.length && nonSentenceEndingAbbrev.test(chunks[chunks.length - 1].trim())) {
        chunks[chunks.length - 1] += " " + fullPart;
      } else {
        chunks.push(fullPart);
      }
    } else if (sep) {
      if (chunks.length) {
        chunks[chunks.length - 1] += sep;
      } else {
        chunks.push(sep);
      }
    }
  }

  // Safety fallback: only if a chunk has no punctuation and is extremely long (> 500 chars),
  // split it by space. Otherwise, keep it intact to avoid arbitrary boundaries.
  const finalChunks: string[] = [];
  for (const chunk of chunks) {
    if (chunk.length > 500) {
      finalChunks.push(...splitByLength(chunk, 500));
    } else {
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
      if (current) chunks.push(current.trim());
      current = word;
    }
  }
  if (current) chunks.push(current.trim());
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
