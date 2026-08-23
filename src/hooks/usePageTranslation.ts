import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import {
  buildPagePayload,
  getDefaultModelSync,
  getKey,
  OpenRouterError,
  openApiKeyModal,
  readGlobals,
  streamCompletion,
  type Globals,
} from "@/lib/openrouter";
import { getPageData, upsertPageAi, type PageAi, type PageAiSummaryEntry } from "@/lib/storage";
import { syncToSupabase } from "@/lib/sync";
import { cleanAiText, effective, hashFor, summarize } from "@/lib/pageAi";

/**
 * Throttle stream state updates to maintain 60fps rendering without choking React.
 * Leading edge fires immediately.
 */
const STREAM_FLUSH_MS = 60;

/**
 * The per-page AI translation/explain engine: runs direct client streaming requests to
 * OpenRouter, updates live text buffers in real-time, persists progress to IndexedDB,
 * and de-dupes concurrent requests for the same page.
 */
export function usePageTranslation(
  docId: string,
  globalsRef: React.RefObject<Globals>,
  onPageAiChangeRef: React.RefObject<(pageNumber: number, entry: PageAiSummaryEntry | null) => void>,
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
      const key = getKey();
      if (!key) {
        ensureKeyReady();
        await upsertPageAi(docId, pageNumber, {
          status: "error",
          error: "No OpenRouter API key configured.",
        });
        onPageAiChangeRef.current(pageNumber, {
          status: "error",
          hasResult: false,
          isCustom: false,
        });
        return undefined;
      }

      // Read fresh page text + state from IDB
      const pageRec = await getPageData(docId, pageNumber);
      if (!pageRec || !pageRec.text?.trim()) {
        const msg = "No text content found on this page to process.";
        toast.error(msg);
        await upsertPageAi(docId, pageNumber, { status: "error", error: msg });
        onPageAiChangeRef.current(pageNumber, {
          status: "error",
          hasResult: false,
          isCustom: false,
        });
        return undefined;
      }

      const currentGlobals = globalsRef.current || readGlobals();
      const state: PageAi = pageRec.pageAi ?? { pageNumber, status: "idle" };
      const eff = effective(currentGlobals, state.overrides);
      const modelId = eff.modelId || getDefaultModelSync();

      // One-shot selection override (from PDF text selection → "Translate")
      const selOverride = selectionOverridesRef.current.get(pageNumber);
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

      const hash = hashFor(eff);

      const ctrl = new AbortController();
      abortMap.current.set(pageNumber, ctrl);
      if (mountedRef.current) {
        setRunningPages((s) => new Set(s).add(pageNumber));
        setStreamBufs((b) => ({ ...b, [pageNumber]: "" }));
      }

      // Persist running status
      await upsertPageAi(docId, pageNumber, { status: "running", error: undefined });
      onPageAiChangeRef.current(pageNumber, {
        status: "running",
        hasResult: !!state.result,
        isCustom: state.isCustom,
        settingsHash: state.settingsHash,
      });

      // ---- High-throughput live UI flusher ----
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
        await streamCompletion({
          key,
          payload,
          signal: ctrl.signal,
          onDelta: (d) => {
            bufferRef.current += d;
            // Immediate update on first chunk for zero perceived latency
            if (!lastUiRef.current) {
              flushUi();
            } else {
              scheduleFlush();
            }
          },
        });

        // Final synchronous flush before writing to IDB
        flushUi();
        const rawResult = bufferRef.current;
        const result = cleanAiText(rawResult);

        await upsertPageAi(docId, pageNumber, {
          status: "done",
          result,
          error: undefined,
          settingsHash: hash,
        });
        onPageAiChangeRef.current(
          pageNumber,
          summarize({
            ...state,
            status: "done",
            result,
            settingsHash: hash,
          }),
        );
        void syncToSupabase(docId);
        return result;
      } catch (e) {
        if ((e as Error).name === "AbortError" || ctrl.signal.aborted) {
          const status = state.result ? "done" : "idle";
          await upsertPageAi(docId, pageNumber, { status });
          onPageAiChangeRef.current(pageNumber, { ...summarize(state), status });
        } else {
          const err = e instanceof Error ? e.message : "Unknown error";
          await upsertPageAi(docId, pageNumber, { status: "error", error: err });
          onPageAiChangeRef.current(pageNumber, { ...summarize(state), status: "error" });
          if (e instanceof OpenRouterError && (e.kind === "auth" || e.kind === "quota")) {
            toast.error(err);
            openApiKeyModal(err);
          } else if (e instanceof OpenRouterError) {
            toast.error(err);
          } else {
            toast.error(err);
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
    [docId, ensureKeyReady, globalsRef, mountedRef, onPageAiChangeRef],
  );

  // Dedupes concurrent generation requests for the same page — the manual
  // Run button and the ensure-ready / continuous-play-prefetch triggers can
  // both target the same page number; this makes them share one in-flight
  // run instead of racing.
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
