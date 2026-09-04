import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import {
  buildPagePayload,
  getDefaultModelSync,
  getSelectedModel,
  setSelectedModel,
  getKey,
  setAiProvider,
  OpenRouterError,
  openApiKeyModal,
  readGlobals,
  streamCompletion,
  streamOmniRouterCompletion,
  isOmniRouterConfigured,
  OmniRouterError,
  type Globals,
} from "@/lib/openrouter";
import {
  getDoc,
  getPageData,
  upsertPageAi,
  type PageAi,
  type PageAiSummaryEntry,
} from "@/lib/storage";
import { cleanAiText, effective, hashFor, summarize, dispatchPageReady } from "@/lib/pageAi";
import { fetchSupabaseLanguagePage, saveSupabaseLanguagePage } from "@/lib/supabase";

/**
 * Throttle stream state updates to maintain 60fps rendering without choking React.
 * Leading edge fires immediately.
 */
const STREAM_FLUSH_MS = 60;

/**
 * The per-page AI translation/explain engine: runs direct client streaming requests to
 * OpenRouter or OmniRouter, updates live text buffers in real-time, persists progress to IndexedDB,
 * and de-dupes concurrent requests for the same page.
 */
export function usePageTranslation(
  docId: string,
  globalsRef: React.RefObject<Globals>,
  onPageAiChangeRef: React.RefObject<
    (pageNumber: number, entry: PageAiSummaryEntry | null) => void
  >,
  mountedRef: React.RefObject<boolean>,
  ensureKeyReady: () => boolean,
) {
  const [runningPages, setRunningPages] = useState<Set<number>>(new Set());
  /** Live streaming buffers. */
  const [streamBufs, setStreamBufs] = useState<Record<number, string>>({});
  const abortMap = useRef<Map<number, AbortController>>(new Map());
  /** One-shot text overrides keyed by pageNumber (from PDF selection translate). */
  const selectionOverridesRef = useRef<Map<number, string>>(new Map());

  // Abort everything in flight on unmount.
  useEffect(() => {
    return () => {
      abortMap.current.forEach((c) => c.abort());
      abortMap.current.clear();
    };
  }, []);

  const runPage = useCallback(
    async (pageNumber: number): Promise<string | undefined> => {
      // Read fresh page text + state from IDB
      const docRec = await getDoc(docId);
      const pageRec = await getPageData(docId, pageNumber);

      if (!pageRec || !pageRec.text?.trim()) {
        // If document pages are still being extracted / document is not ready yet, bail out quietly
        if (!docRec || (docRec.pageCount ?? 0) === 0) {
          return undefined;
        }

        const msg = "No text content found on this page to process.";
        toast.error(msg);
        await upsertPageAi(docId, pageNumber, { status: "error", error: msg });
        onPageAiChangeRef.current?.(pageNumber, {
          status: "error",
          hasResult: false,
          isCustom: false,
        });
        return undefined;
      }

      const bookId = docRec?.bookId || docRec?.fileName || docId;
      const currentGlobals = globalsRef.current || readGlobals();
      const state: PageAi = pageRec.pageAi ?? { pageNumber, status: "idle" };
      let eff = effective(currentGlobals, state.overrides);
      let isOmni = eff.provider === "omnirouter";
      const hash = hashFor(eff);

      // ─────────────────────────────────────────────────────────────────
      // 1. SUPABASE MULTI-TABLE REUSE CHECK
      // ─────────────────────────────────────────────────────────────────
      const selOverride = selectionOverridesRef.current.get(pageNumber);
      const isDefaultTranslation =
        eff.mode === "translate" &&
        eff.style === "Native" &&
        !state.isCustom &&
        !state.overrides?.style &&
        !state.overrides?.mode;

      if (!selOverride && isDefaultTranslation && bookId) {
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

            onPageAiChangeRef.current?.(
              pageNumber,
              summarize({
                ...state,
                status: "done",
                result,
                settingsHash: hash,
              }),
            );

            dispatchPageReady(docId, pageNumber, result);
            return result;
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
        toast.info("OmniRouter is offline/unconfigured. Automatically switched to OpenRouter.");
      }

      const key = getKey();
      if (!isOmni && !key) {
        ensureKeyReady();
        await upsertPageAi(docId, pageNumber, {
          status: "error",
          error: "No OpenRouter API key configured.",
        });
        onPageAiChangeRef.current?.(pageNumber, {
          status: "error",
          hasResult: false,
          isCustom: false,
        });
        return undefined;
      }

      const modelId =
        eff.modelId ||
        (isOmni
          ? currentGlobals.omniModelId || ""
          : getSelectedModel() || getDefaultModelSync());

      if (selOverride) selectionOverridesRef.current.delete(pageNumber);
      const effectiveText = selOverride ?? pageRec.text;

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
        });
      }

      const ctrl = new AbortController();
      abortMap.current.set(pageNumber, ctrl);
      if (mountedRef.current) {
        setRunningPages((s) => new Set(s).add(pageNumber));
        setStreamBufs((b) => ({ ...b, [pageNumber]: "" }));
      }

      await upsertPageAi(docId, pageNumber, { status: "running", error: undefined });
      onPageAiChangeRef.current?.(pageNumber, {
        status: "running",
        hasResult: !!state.result,
        isCustom: state.isCustom,
        settingsHash: state.settingsHash,
      });

      const bufferRef = { current: "" };
      const lastUiRef = { current: "" };
      let flushScheduled = false;

      const flushUi = () => {
        if (!mountedRef.current) return;
        if (bufferRef.current === lastUiRef.current) return;
        lastUiRef.current = bufferRef.current;
        const snapshot = cleanAiText(bufferRef.current);
        setStreamBufs((b) => ({ ...b, [pageNumber]: snapshot }));
      };

      const scheduleFlush = () => {
        if (flushScheduled) return;
        flushScheduled = true;
        setTimeout(() => {
          flushScheduled = false;
          flushUi();
        }, STREAM_FLUSH_MS);
      };

      try {
        const onDeltaHandler = (d: string) => {
          bufferRef.current += d;
          if (!lastUiRef.current) {
            flushUi();
          } else {
            scheduleFlush();
          }
        };

        if (isOmni) {
          try {
            await streamOmniRouterCompletion({
              payload,
              signal: ctrl.signal,
              onDelta: onDeltaHandler,
            });
          } catch (omniErr) {
            if ((omniErr as Error).name === "AbortError" || ctrl.signal.aborted) throw omniErr;
            console.warn("OmniRouter failed, switching to OpenRouter:", omniErr);
            setAiProvider("openrouter");
            const openRouterModel = getSelectedModel() || getDefaultModelSync();
            setSelectedModel(openRouterModel);
            bufferRef.current = "";
            lastUiRef.current = "";
            toast.info("OmniRouter failed. Automatically switched to OpenRouter fallback.");

            const fallbackPayload = state.isCustom && state.customRequest
                ? { ...state.customRequest, model: openRouterModel, stream: true }
                : buildPagePayload({
                    modelId: openRouterModel,
                    mode: eff.mode,
                    language: eff.language,
                    style: eff.style,
                    temperature: eff.temperature,
                    pageNumber,
                    pageText: effectiveText,
                  });

            const openRouterKey = getKey();
            if (!openRouterKey) {
              ensureKeyReady();
              throw new OpenRouterError("No OpenRouter API key configured.", 401, "auth");
            }
            await streamCompletion({ key: openRouterKey, payload: fallbackPayload, signal: ctrl.signal, onDelta: onDeltaHandler });
          }
        } else {
          await streamCompletion({ key, payload, signal: ctrl.signal, onDelta: onDeltaHandler });
        }

        flushUi();
        const result = cleanAiText(bufferRef.current);
        await upsertPageAi(docId, pageNumber, { status: "done", result, error: undefined, settingsHash: hash });
        onPageAiChangeRef.current?.(pageNumber, summarize({ ...state, status: "done", result, settingsHash: hash }));

        if (isDefaultTranslation && bookId) {
          void saveSupabaseLanguagePage({ data: { language: eff.language, bookId, pageNumber, content: result, docId } });
        }
        return result;
      } catch (e) {
        if ((e as Error).name === "AbortError" || ctrl.signal.aborted) {
          const status = state.result ? "done" : "idle";
          await upsertPageAi(docId, pageNumber, { status });
          onPageAiChangeRef.current?.(pageNumber, { ...summarize(state), status });
        } else {
          const err = e instanceof Error ? e.message : "Unknown error";
          await upsertPageAi(docId, pageNumber, { status: "error", error: err });
          onPageAiChangeRef.current?.(pageNumber, { ...summarize(state), status: "error" });
          if (!(e instanceof OmniRouterError)) {
            const isDailyOrQuota = (e instanceof OpenRouterError && /daily_limit|rate_limit|quota|credits/i.test(e.kind)) || /50 free pages|daily limit|rate limit|quota/i.test(err);
            if (isDailyOrQuota) {
              toast.error(err, { duration: 8000, action: { label: "Get Free Key", onClick: () => openApiKeyModal(err, true) } });
              openApiKeyModal(err, true);
            } else if (e instanceof OpenRouterError && e.kind === "auth") {
              toast.error(err);
              openApiKeyModal(err, false);
            } else {
              toast.error(err);
            }
          }
        }
        return undefined;
      } finally {
        abortMap.current.delete(pageNumber);
        if (mountedRef.current) {
          setRunningPages((s) => {
            const n = new Set(s);
            n.delete(pageNumber);
            return n;
          });
          setStreamBufs((b) => {
            const next = { ...b };
            delete next[pageNumber];
            return next;
          });
        }
      }
    },
    [docId, ensureKeyReady, globalsRef, onPageAiChangeRef, mountedRef],
  );

  // Dedupes concurrent generation requests for the same page
  const inFlightRuns = useRef<Map<number, Promise<string | undefined>>>(new Map());
  const runPageOnce = useCallback(
    (pageNumber: number): Promise<string | undefined> => {
      const existing = inFlightRuns.current.get(pageNumber);
      if (existing) return existing;
      const p = runPage(pageNumber).finally(() => {
        inFlightRuns.current.delete(pageNumber);
      });
      inFlightRuns.current.set(pageNumber, p);
      return p;
    },
    [runPage],
  );

  const cancelPage = useCallback((pageNumber: number) => {
    abortMap.current.get(pageNumber)?.abort();
  }, []);

  return { runningPages, streamBufs, runPageOnce, cancelPage, selectionOverridesRef };
}

