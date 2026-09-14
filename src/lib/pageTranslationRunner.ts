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
  isOmniRouterConfigured,
  parseStructuredTranslationResponse,
  type Globals,
} from "@/lib/openrouter";
import {
  getDoc,
  getPageData,
  upsertPageAi,
  type PageAi,
} from "@/lib/storage";
import { cleanAiText, effective, hashFor, dispatchPageReady } from "@/lib/pageAi";
import { fetchSupabaseLanguagePage, saveSupabaseLanguagePage } from "@/lib/supabase";
import { getPreviousContext, mergeContextDelta } from "@/lib/contextStore";

export interface PageTranslationOptions {
  docId: string;
  pageNumber: number;
  globals?: Globals;
  signal?: AbortSignal;
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

/**
 * Executes translation and continuity context extraction for a single page.
 * Reusable by both individual page workstations and the full book batch translation engine.
 */
export async function executePageTranslation({
  docId,
  pageNumber,
  globals,
  signal,
  onDelta,
  customTextOverride,
  forceRegenerate = false,
}: PageTranslationOptions): Promise<PageTranslationResult> {
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
  // 2. PAGE GENERATION (With OmniRouter -> OpenRouter Fallback)
  // ─────────────────────────────────────────────────────────────────
  if (isOmni && !isOmniRouterConfigured()) {
    console.warn("OmniRouter not configured. Auto-switching to OpenRouter fallback.");
    setAiProvider("openrouter");
    isOmni = false;
    eff = { ...eff, provider: "openrouter" };
  }

  const key = getKey();
  if (!isOmni && !key) {
    const errorMsg = "No OpenRouter API key configured.";
    await upsertPageAi(docId, pageNumber, {
      status: "error",
      error: errorMsg,
    });
    return { success: false, error: errorMsg };
  }

  const modelId =
    eff.modelId ||
    (isOmni
      ? currentGlobals.omniModelId || ""
      : getSelectedModel() || getDefaultModelSync());

  const effectiveText = customTextOverride ?? pageRec.text;
  const previousContext = await getPreviousContext(docId, pageNumber, eff);

  let payload: Record<string, unknown>;
  if (state.isCustom && state.customRequest) {
    payload = { ...state.customRequest, stream: true };
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

  await upsertPageAi(docId, pageNumber, { status: "running", error: undefined });

  let fullBuffer = "";
  const onDeltaHandler = (chunk: string) => {
    fullBuffer += chunk;
    onDelta?.(chunk);
  };

  try {
    if (isOmni) {
      try {
        await streamOmniRouterCompletion({
          payload,
          signal,
          onDelta: onDeltaHandler,
        });
      } catch (omniErr) {
        if ((omniErr as Error).name === "AbortError" || signal?.aborted) throw omniErr;
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
          signal,
          onDelta: onDeltaHandler,
        });
      }
    } else {
      await streamCompletion({
        key: key || "",
        payload,
        signal,
        onDelta: onDeltaHandler,
      });
    }

    const structured = parseStructuredTranslationResponse(fullBuffer);
    const result = cleanAiText(structured.translation);
    const contextDelta = structured.context_delta?.trim();

    // ─────────────────────────────────────────────────────────────────
    // 3. STORAGE PERSISTENCE & CONTEXT DELTA MERGE
    // ─────────────────────────────────────────────────────────────────
    await upsertPageAi(docId, pageNumber, {
      status: "done",
      result,
      contextDelta: contextDelta || undefined,
      error: undefined,
      settingsHash: hash,
    });

    if (contextDelta) {
      await mergeContextDelta(docId, pageNumber, contextDelta);
    }

    if (isDefaultTranslation && bookId) {
      void saveSupabaseLanguagePage({
        data: { language: eff.language, bookId, pageNumber, content: result, docId },
      });
    }

    // Confirm write in IndexedDB
    const confirmed = await getPageData(docId, pageNumber);
    if (!confirmed?.pageAi?.result) {
      throw new Error(`Failed to confirm persistence for page ${pageNumber}`);
    }

    dispatchPageReady(docId, pageNumber, result);
    return { success: true, result, contextDelta };
  } catch (e) {
    if ((e as Error).name === "AbortError" || signal?.aborted) {
      const status = state.result ? "done" : "idle";
      await upsertPageAi(docId, pageNumber, { status });
      return { success: false, error: "Aborted by user" };
    }

    const err = e instanceof Error ? e.message : "Unknown error";
    await upsertPageAi(docId, pageNumber, { status: "error", error: err });
    return { success: false, error: err };
  }
}
