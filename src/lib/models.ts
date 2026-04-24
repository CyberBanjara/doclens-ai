export interface ModelSpec {
  id: string;
  label: string;
  provider: "anthropic" | "openai" | "google";
  contextTokens: number;
  /** Reserved for response so chunks stay safely under context */
  reservedOutputTokens: number;
}

export const MODELS: ModelSpec[] = [
  {
    id: "claude-3-5-sonnet-20241022",
    label: "Claude 3.5 Sonnet",
    provider: "anthropic",
    contextTokens: 200_000,
    reservedOutputTokens: 4_000,
  },
  {
    id: "gpt-4o",
    label: "GPT-4o",
    provider: "openai",
    contextTokens: 128_000,
    reservedOutputTokens: 4_000,
  },
  {
    id: "gemini-1.5-pro",
    label: "Gemini 1.5 Pro",
    provider: "google",
    contextTokens: 1_000_000,
    reservedOutputTokens: 8_000,
  },
];

/** Rough heuristic: 1 token ≈ 4 characters of English text. */
export function estimateTokens(text: string): number {
  if (!text) return 0;
  return Math.ceil(text.length / 4);
}

/** Target chunk size: keep well under context, leave room for prompt + output. */
export function chunkBudgetTokens(model: ModelSpec): number {
  const usable = model.contextTokens - model.reservedOutputTokens - 2_000; // system/instructions buffer
  // Cap individual chunks for practicality regardless of huge windows
  return Math.min(usable, 8_000);
}

export interface Chunk {
  index: number;
  text: string;
  pageRange: [number, number];
  tokens: number;
}

export function chunkPages(
  pages: { pageNumber: number; text: string }[],
  model: ModelSpec,
): Chunk[] {
  const budget = chunkBudgetTokens(model);
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
    const pageBlock = `\n\n--- Page ${page.pageNumber} ---\n${page.text}`;
    const pageTokens = estimateTokens(pageBlock);
    if (estimateTokens(buffer) + pageTokens > budget && buffer) {
      flush();
      startPage = page.pageNumber;
    }
    if (pageTokens > budget) {
      // Split a single huge page by characters
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
    buffer += pageBlock;
    endPage = page.pageNumber;
  }
  flush();
  return chunks;
}

export function buildRequestPayload(model: ModelSpec, chunk: Chunk): unknown {
  const systemPrompt =
    "You are a document analysis assistant. Analyze the following document excerpt and answer questions about it.";
  if (model.provider === "anthropic") {
    return {
      model: model.id,
      max_tokens: model.reservedOutputTokens,
      system: systemPrompt,
      messages: [{ role: "user", content: chunk.text }],
    };
  }
  if (model.provider === "openai") {
    return {
      model: model.id,
      max_tokens: model.reservedOutputTokens,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: chunk.text },
      ],
    };
  }
  // google
  return {
    model: model.id,
    generationConfig: { maxOutputTokens: model.reservedOutputTokens },
    systemInstruction: { parts: [{ text: systemPrompt }] },
    contents: [{ role: "user", parts: [{ text: chunk.text }] }],
  };
}
