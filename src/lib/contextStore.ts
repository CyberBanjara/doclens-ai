import { getPageData, upsertPageAi, type PageDataRecord } from "./storage";

/** In-memory cache for fast access to recent context deltas across pages. */
const docContextCache = new Map<string, Map<number, string>>();

/** Max characters of context to prevent context window bloating while preserving high signal. */
const MAX_CONTEXT_LENGTH = 2000;

/**
 * Retrieves the compiled previous context for `pageNumber` in a given document.
 * Scans preceding translated pages (1 .. pageNumber - 1) to build a coherent
 * continuity context including terminology, entity names, tone, and story/argument flow.
 */
export async function getPreviousContext(
  docId: string,
  pageNumber: number,
  options?: { language?: string; mode?: string },
): Promise<string> {
  if (pageNumber <= 1 || !docId) {
    return "";
  }

  const deltas: { page: number; delta: string }[] = [];

  // Look back at up to 8 preceding pages in reverse chronological order
  const startPage = Math.max(1, pageNumber - 8);
  for (let p = pageNumber - 1; p >= startPage; p--) {
    let delta = docContextCache.get(docId)?.get(p);

    if (!delta) {
      try {
        const pageRec = await getPageData(docId, p);
        if (pageRec?.pageAi?.contextDelta) {
          delta = pageRec.pageAi.contextDelta.trim();
          cacheContextDelta(docId, p, delta);
        } else if (pageRec?.pageAi?.result && !pageRec.pageAi.isCustom) {
          // Fallback heuristic if earlier translation did not produce a delta:
          // Use a concise excerpt of the last 1-2 sentences of the previous page
          const clean = pageRec.pageAi.result.trim();
          const sentences = clean.split(/(?<=[.!?।॥])\s+/).filter(Boolean);
          if (sentences.length > 0) {
            delta = `Previous narrative excerpt: ${sentences.slice(-2).join(" ")}`;
          }
        }
      } catch (e) {
        console.warn(`[ContextStore] Error reading page ${p} context:`, e);
      }
    }

    if (delta && delta.trim()) {
      deltas.unshift({ page: p, delta: delta.trim() });
    }
  }

  if (deltas.length === 0) {
    return "";
  }

  // Format into a structured continuity block
  const lines: string[] = [
    "--- PREVIOUS DOCUMENT CONTEXT & CONTINUITY ---",
    "Use this context to maintain translation consistency, character/entity naming, terminology, and narrative flow from previous pages:",
  ];

  let currentLength = lines.join("\n").length;
  for (const item of deltas) {
    const entry = `[Page ${item.page} Context]: ${item.delta}`;
    if (currentLength + entry.length > MAX_CONTEXT_LENGTH) {
      break;
    }
    lines.push(entry);
    currentLength += entry.length + 1;
  }

  return lines.join("\n");
}

/**
 * Cache and persist a newly generated context delta for a specific page.
 */
export async function mergeContextDelta(
  docId: string,
  pageNumber: number,
  delta: string,
): Promise<void> {
  if (!docId || !pageNumber || !delta) return;

  const cleanDelta = delta.trim();
  if (!cleanDelta) return;

  cacheContextDelta(docId, pageNumber, cleanDelta);

  try {
    await upsertPageAi(docId, pageNumber, {
      contextDelta: cleanDelta,
    });
  } catch (err) {
    console.warn(`[ContextStore] Failed to persist contextDelta for page ${pageNumber}:`, err);
  }
}

/** In-memory cache helper. */
function cacheContextDelta(docId: string, pageNumber: number, delta: string) {
  let docMap = docContextCache.get(docId);
  if (!docMap) {
    docMap = new Map<number, string>();
    docContextCache.set(docId, docMap);
  }
  docMap.set(pageNumber, delta);
}

/**
 * Evicts document context memory cache (e.g. when changing document or switching global language).
 */
export function clearDocContext(docId?: string) {
  if (docId) {
    docContextCache.delete(docId);
  } else {
    docContextCache.clear();
  }
}
