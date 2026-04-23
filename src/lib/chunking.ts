import type { PageExtraction } from "./pdf";

/** Rough heuristic: 1 token ≈ 4 characters of English text. */
export function estimateTokens(text: string): number {
  if (!text) return 0;
  return Math.ceil(text.length / 4);
}

export interface Chunk {
  index: number;
  text: string;
  pageRange: [number, number];
  tokens: number;
}

/**
 * Chunk pages so each chunk fits in `budgetTokens`. Pages stay together when
 * they fit; oversized single pages are split by characters.
 */
export function chunkPages(pages: PageExtraction[], budgetTokens: number): Chunk[] {
  const budget = Math.max(500, budgetTokens);
  const chunks: Chunk[] = [];
  let buffer = "";
  let startPage = pages[0]?.pageNumber ?? 1;
  let endPage = startPage;

  const flush = () => {
    if (!buffer.trim()) return;
    chunks.push({
      index: chunks.length,
      text: buffer.trim(),
      pageRange: [startPage, endPage],
      tokens: estimateTokens(buffer),
    });
    buffer = "";
  };

  for (const page of pages) {
    const block = `\n\n--- Page ${page.pageNumber} ---\n${page.text}`;
    const blockTokens = estimateTokens(block);
    if (estimateTokens(buffer) + blockTokens > budget && buffer) {
      flush();
      startPage = page.pageNumber;
    }
    if (blockTokens > budget) {
      const charsPerChunk = budget * 4;
      for (let i = 0; i < page.text.length; i += charsPerChunk) {
        const slice = page.text.slice(i, i + charsPerChunk);
        chunks.push({
          index: chunks.length,
          text: `--- Page ${page.pageNumber} (part ${Math.floor(i / charsPerChunk) + 1}) ---\n${slice}`,
          pageRange: [page.pageNumber, page.pageNumber],
          tokens: estimateTokens(slice),
        });
      }
      buffer = "";
      startPage = page.pageNumber + 1;
      continue;
    }
    if (!buffer) startPage = page.pageNumber;
    buffer += block;
    endPage = page.pageNumber;
  }
  flush();
  return chunks;
}

export type Operation = "translate" | "summarize" | "explain" | "keypoints";

export const OPERATIONS: { id: Operation; label: string; instruction: string }[] = [
  {
    id: "translate",
    label: "Translate",
    instruction:
      "Translate the following document excerpt into English. Preserve structure, lists, and headings. If text is already English, output it as-is.",
  },
  {
    id: "summarize",
    label: "Summarize",
    instruction:
      "Write a concise summary of this document excerpt. Use short paragraphs and preserve any critical numbers, names, and dates.",
  },
  {
    id: "explain",
    label: "Explain",
    instruction:
      "Explain this document excerpt in plain language for a non-expert reader. Define jargon and clarify acronyms when first used.",
  },
  {
    id: "keypoints",
    label: "Key Points",
    instruction:
      "Extract the key points from this document excerpt as a bulleted list. Be specific. Include numbers and named entities verbatim.",
  },
];

export function operationPrompt(op: Operation): string {
  return OPERATIONS.find((o) => o.id === op)!.instruction;
}
