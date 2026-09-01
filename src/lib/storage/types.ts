export type AiProvider = "openrouter" | "omnirouter";
export type AiMode = "translate" | "explain";
export type PageStatus = "idle" | "ready" | "running" | "done" | "error";

export interface AiResult {
  id: string;
  mode: AiMode;
  language: string;
  modelId: string;
  modelLabel: string;
  content: string;
  createdAt: number;
  chunkCount: number;
}

export interface PageOverrides {
  provider?: AiProvider;
  mode?: AiMode;
  language?: string;
  modelId?: string;
  style?: string;
  temperature?: number;
}

export interface StoredPage {
  pageNumber: number;
  text: string;
  columns: number;
  garbageRatio?: number;
}

export interface PageAi {
  pageNumber: number;
  status: PageStatus;
  customRequest?: Record<string, unknown> | null;
  isCustom?: boolean;
  result?: string;
  error?: string;
  overrides?: PageOverrides;
  settingsHash?: string;
  updatedAt?: number;
}

/** Per-page data record stored independently for memory-friendly lazy loading. */
export interface PageDataRecord {
  key: string;
  docId: string;
  pageNumber: number;
  text: string;
  columns: number;
  garbageRatio: number;
  pageAi?: PageAi;
  ocrRun?: boolean;
}

/** Lightweight summary of AI state across pages — used for headers/badges only. */
export interface PageAiSummaryEntry {
  status: PageStatus;
  hasResult: boolean;
  isCustom?: boolean;
  settingsHash?: string;
  updatedAt?: number;
}

export function computeSettingsHash(input: {
  mode: string;
  language: string;
  style: string;
  temperature: number;
  modelId?: string;
  provider?: string;
}): string {
  // Model selection and AI provider are intentionally excluded from the hash
  // so that switching models or providers never invalidates or deletes existing translations.
  return [
    input.mode,
    input.language,
    input.style,
    input.temperature.toFixed(3),
  ].join("|");
}

/**
 * Document metadata only. Page text and AI state are stored separately
 * in the `pageData` store (keyed by `${id}:${nnnnnn}`).
 */
export interface DocRecord {
  id: string;
  fileName: string;
  fileSize: number;
  pages: StoredPage[] | null; // legacy — always null after v6 migration
  pageCount: number;
  createdAt: number;
  lastOpenedAt: number;
  aiResults?: AiResult[];
  /** @deprecated kept on the type for back-compat; not loaded into memory after v6. */
  pageAi?: Record<number, PageAi>;
  /** Cached count of pages with status === "done". */
  aiDoneCount?: number;
  lastReadPage?: number;
  isScannedPdf?: boolean;
  /** Unique book identifier for Supabase multi-table tracking */
  bookId?: string;
  /** Language chosen by the user for translation */
  selectedLanguage?: string;
  /** Tracks whether the user has been prompted to choose a translation language */
  hasChosenLanguage?: boolean;
}

export interface DocSummary {
  id: string;
  fileName: string;
  fileSize: number;
  pageCount: number;
  createdAt: number;
  lastOpenedAt: number;
  hasExtraction: boolean;
  aiResultCount: number;
  lastReadPage?: number;
  isScannedPdf?: boolean;
  bookId?: string;
  selectedLanguage?: string;
  hasChosenLanguage?: boolean;
}

export class StorageError extends Error {
  constructor(
    message: string,
    public readonly code: "QUOTA_EXCEEDED" | "WRITE_FAILED" | "NOT_FOUND",
  ) {
    super(message);
    this.name = "StorageError";
  }
}
