import {
  buildPagePayload,
  getDefaultModelSync,
  getSelectedModel,
  setSelectedModel,
  getKey,
  setAiProvider,
  OpenRouterError,
  readGlobals,
  streamCompletion,
  streamOmniRouterCompletion,
  streamOllamaCompletion,
  getOllamaEndpoint,
  getOllamaSelectedModel,
  isOmniRouterConfigured,
  parseStructuredTranslationResponse,
  type Globals,
} from "@/lib/openrouter";
import { getDoc, getPageData, upsertPageAi, type PageAi } from "@/lib/storage";
import { cleanAiText, effective, hashFor, dispatchPageReady } from "@/lib/pageAi";
import { fetchSupabaseLanguagePage, saveSupabaseLanguagePage } from "@/lib/supabase";
import { getPreviousContext, mergeContextDelta } from "@/lib/contextStore";
import { dispatchDocEvent } from "@/lib/docEvents";

export interface PageTranslationOptions {
  docId: string;
  pageNumber: number;
  globals?: Globals;
  onDelta?: (delta: string) => void;
  customTextOverride?: string;
  forceRegenerate?: boolean;
}

export interface PageTranslationResult {
  success: boolean;
  result?: string;
  contextDelta?: string;
  fromCache?: boolean;
  error?: string;
}

interface InFlightTask {
  promise: Promise<PageTranslationResult>;
  abortController: AbortController;
  listeners: Set<(chunk: string) => void>;
  accumulatedBuffer: string;
}

/** Global in-flight registry ensuring 1 page = 1 request lifecycle across UI unmounts */
const inFlightMap = new Map<string, InFlightTask>();

function getTaskKey(docId: string, pageNumber: number): string {
  return `${docId}:${pageNumber}`;
}

/** Check if a page translation is actively running in the background */
export function isPageTranslating(docId: string, pageNumber: number): boolean {
  return inFlightMap.has(getTaskKey(docId, pageNumber));
}

/** Get list of all currently translating page numbers for a document */
export function getRunningPagesForDoc(docId: string): number[] {
  const prefix = `${docId}:`;
  const pages: number[] = [];
  for (const key of inFlightMap.keys()) {
    if (key.startsWith(prefix)) {
      const pNum = parseInt(key.slice(prefix.length), 10);
      if (!isNaN(pNum)) pages.push(pNum);
    }
  }
  return pages;
}

/** Subscribe a listener to live streaming chunks of an active in-flight translation */
export function subscribePageTranslation(
  docId: string,
  pageNumber: number,
  onDelta: (chunk: string) => void,
): () => void {
  const task = inFlightMap.get(getTaskKey(docId, pageNumber));
  if (!task) return () => {};
  task.listeners.add(onDelta);
  if (task.accumulatedBuffer) {
    onDelta(task.accumulatedBuffer);
  }
  return () => {
    task.listeners.delete(onDelta);
  };
}

/** Explicitly cancel an in-flight page translation by user action */
export function cancelPageTranslation(docId: string, pageNumber: number): boolean {
  const key = getTaskKey(docId, pageNumber);
  const task = inFlightMap.get(key);
  if (task) {
    task.abortController.abort();
    inFlightMap.delete(key);
    return true;
  }
  return false;
}

/**
 * Executes translation for a single page in the background.
 * Lifecycle Guarantees:
 * 1. Deduplication: Returns existing in-flight promise if page is already being translated.
 * 2. Background Persistence: Completes and saves translation even if UI unmounts or routes change.
 * 3. Provider Check: Verifies provider once at the start of translation (no continuous ping loop).
 * 4. Explicit Cancellation Only: Only cancelled when cancelPageTranslation() or user abort is explicitly triggered.
 */
export async function executePageTranslation({
  docId,
  pageNumber,
  globals,
  onDelta,
  customTextOverride,
  forceRegenerate = false,
}: PageTranslationOptions): Promise<PageTranslationResult> {
  const taskKey = getTaskKey(docId, pageNumber);

  // 1. DEDUPLICATION: If request is already in-flight, attach listener and reuse promise immediately
  const existingTask = inFlightMap.get(taskKey);
  if (existingTask) {
    if (onDelta) {
      existingTask.listeners.add(onDelta);
      if (existingTask.accumulatedBuffer) {
        onDelta(existingTask.accumulatedBuffer);
      }
    }
    return existingTask.promise;
  }

  // Setup abort controller and listener set immediately for explicit cancellation only
  const internalAbort = new AbortController();
  const listeners = new Set<(chunk: string) => void>();
  if (onDelta) listeners.add(onDelta);

  const inFlightTask: InFlightTask = {
    promise: Promise.resolve({ success: false }),
    abortController: internalAbort,
    listeners,
    accumulatedBuffer: "",
  };

  const executionPromise = (async (): Promise<PageTranslationResult> => {
    try {
      const docRec = await getDoc(docId);
      const pageRec = await getPageData(docId, pageNumber);

      if (!pageRec || !pageRec.text?.trim()) {
        return {
          success: false,
          error: "No text content found on this page to process.",
        };
      }

      const bookId = docRec?.bookId || docRec?.fileName || docId;
      const currentGlobals = globals || readGlobals();
      const state: PageAi = pageRec.pageAi ?? { pageNumber, status: "idle" };
      let eff = effective(currentGlobals, state.overrides);
      let isOmni = eff.provider === "omnirouter";
      let isOllama = eff.provider === "ollama";
      const hash = hashFor(eff);

      // ─────────────────────────────────────────────────────────────────
      // 1. SUPABASE MULTI-TABLE REUSE CHECK
      // ─────────────────────────────────────────────────────────────────
      const isDefaultTranslation =
        eff.mode === "translate" &&
        eff.style === "Native" &&
        !state.isCustom &&
        !state.overrides?.style &&
        !state.overrides?.mode;

      if (!forceRegenerate && !customTextOverride && isDefaultTranslation && bookId) {
        try {
          const supabaseLookup = await fetchSupabaseLanguagePage({
            data: {
              language: eff.language,
              bookId,
              pageNumber,
              docId,
            },
          });

          if (supabaseLookup && supabaseLookup.found && supabaseLookup.content) {
            const result = cleanAiText(supabaseLookup.content);

            await upsertPageAi(docId, pageNumber, {
              status: "done",
              result,
              error: undefined,
              settingsHash: hash,
            });

            dispatchPageReady(docId, pageNumber, result);
            return { success: true, result, fromCache: true };
          }
        } catch (lookupErr) {
          console.warn("Supabase language cache lookup note:", lookupErr);
        }
      }

      // ─────────────────────────────────────────────────────────────────
      // 2. ONE-TIME PROVIDER AVAILABILITY CHECK AT TRANSLATION START
      // ─────────────────────────────────────────────────────────────────
      if (isOmni && !isOmniRouterConfigured()) {
        setAiProvider("openrouter");
        isOmni = false;
        eff = { ...eff, provider: "openrouter" };
      }

      const key = getKey();
      if (!isOmni && !isOllama && !key) {
        const errorMsg = "No OpenRouter API key configured.";
        await upsertPageAi(docId, pageNumber, {
          status: "error",
          error: errorMsg,
        });
        return { success: false, error: errorMsg };
      }

      const modelId =
        eff.modelId ||
        (isOllama
          ? currentGlobals.ollamaModelId || getOllamaSelectedModel() || ""
          : isOmni
            ? currentGlobals.omniModelId || ""
            : getSelectedModel() || getDefaultModelSync());

      const effectiveText = customTextOverride ?? pageRec.text;
      const previousContext = await getPreviousContext(docId, pageNumber, eff);

      let payload: Record<string, unknown>;
      if (state.isCustom && state.customRequest) {
        payload = { ...state.customRequest, stream: true, model: modelId };
      } else {
        payload = buildPagePayload({
          modelId,
          mode: eff.mode,
          language: eff.language,
          style: eff.style,
          temperature: eff.temperature,
          pageNumber,
          pageText: effectiveText,
          previousContext,
        });
      }

      // Mark status in storage
      await upsertPageAi(docId, pageNumber, { status: "running", error: undefined });
      dispatchDocEvent("doclens:page-status-changed", { docId, pageNumber, status: "running" });

      let fullBuffer = "";

      const onChunk = (chunk: string) => {
        fullBuffer += chunk;
        const currentTask = inFlightMap.get(taskKey);
        if (currentTask) currentTask.accumulatedBuffer = fullBuffer;
        listeners.forEach((l) => {
          try {
            l(chunk);
          } catch {
            // Ignore listener errors
          }
        });
      };

      if (isOllama) {
        await streamOllamaCompletion({
          endpoint: currentGlobals.ollamaEndpoint || getOllamaEndpoint(),
          payload,
          signal: internalAbort.signal,
          onDelta: onChunk,
        });
      } else if (isOmni) {
        try {
          await streamOmniRouterCompletion({
            payload,
            signal: internalAbort.signal,
            onDelta: onChunk,
          });
        } catch (omniErr) {
          if ((omniErr as Error).name === "AbortError" || internalAbort.signal.aborted) throw omniErr;
          console.warn("OmniRouter failed, switching to OpenRouter:", omniErr);
          setAiProvider("openrouter");
          const openRouterModel = getSelectedModel() || getDefaultModelSync();
          setSelectedModel(openRouterModel);
          fullBuffer = "";

          const fallbackPayload =
            state.isCustom && state.customRequest
              ? { ...state.customRequest, model: openRouterModel, stream: true }
              : buildPagePayload({
                  modelId: openRouterModel,
                  mode: eff.mode,
                  language: eff.language,
                  style: eff.style,
                  temperature: eff.temperature,
                  pageNumber,
                  pageText: effectiveText,
                  previousContext,
                });

          const openRouterKey = getKey();
          if (!openRouterKey) {
            throw new OpenRouterError("No OpenRouter API key configured.", 401, "auth");
          }
          await streamCompletion({
            key: openRouterKey,
            payload: fallbackPayload,
            signal: internalAbort.signal,
            onDelta: onChunk,
          });
        }
      } else {
        await streamCompletion({
          key: key || "",
          payload,
          signal: internalAbort.signal,
          onDelta: onChunk,
        });
      }

      const structured = parseStructuredTranslationResponse(fullBuffer);
      const result = cleanAiText(structured.translation);
      const contextDelta = structured.context_delta?.trim();

      // ─────────────────────────────────────────────────────────────────
      // 3. PERSISTENCE IN BACKGROUND
      // ─────────────────────────────────────────────────────────────────
      await upsertPageAi(docId, pageNumber, {
        status: "done",
        result,
        contextDelta: contextDelta || undefined,
        error: undefined,
        settingsHash: hash,
      });

      if (contextDelta) {
        await mergeContextDelta(docId, pageNumber, contextDelta, true);
      }

      if (isDefaultTranslation && bookId) {
        void saveSupabaseLanguagePage({
          data: { language: eff.language, bookId, pageNumber, content: result, docId },
        }).catch((err) => {
          console.warn("Supabase background save note:", err?.message || err);
        });
      }

      dispatchPageReady(docId, pageNumber, result);
      dispatchDocEvent("doclens:page-status-changed", { docId, pageNumber, status: "done", result });

      return { success: true, result, contextDelta };
    } catch (e) {
      if ((e as Error).name === "AbortError" || internalAbort.signal.aborted) {
        const pageRec = await getPageData(docId, pageNumber).catch(() => null);
        const status = pageRec?.pageAi?.result ? "done" : "idle";
        await upsertPageAi(docId, pageNumber, { status });
        dispatchDocEvent("doclens:page-status-changed", { docId, pageNumber, status });
        return { success: false, error: "Aborted by user" };
      }

      const err = e instanceof Error ? e.message : "Unknown error";
      await upsertPageAi(docId, pageNumber, { status: "error", error: err });
      dispatchDocEvent("doclens:page-status-changed", { docId, pageNumber, status: "error", error: err });
      return { success: false, error: err };
    } finally {
      inFlightMap.delete(taskKey);
    }
  })();

  // Synchronously store task with its live promise in the inFlightMap
  inFlightTask.promise = executionPromise;
  inFlightMap.set(taskKey, inFlightTask);

  return executionPromise;
}
