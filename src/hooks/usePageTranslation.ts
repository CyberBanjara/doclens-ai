import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import {
  buildPagePayload,
  getKey,
  syncGlobalKey,
  OpenRouterError,
  openApiKeyModal,
  streamCompletion,
  type Globals,
} from "@/lib/openrouter";
import { getPageData, upsertPageAi, type PageAi, type PageAiSummaryEntry } from "@/lib/storage";
import { syncToSupabase } from "@/lib/sync";
import { effective, hashFor, summarize } from "@/lib/pageAi";

/** Throttle setState to at most once per `ms` while leading-edge fires immediately. */
const STREAM_FLUSH_MS = 150;

/**
 * The per-page AI translation/explain engine: runs the streaming request for
 * a page, persists progress to IndexedDB, and de-dupes concurrent requests
 * for the same page (manual "Run", background pre-translate, and auto-read
 * "ensure ready" can all target the same page number).
 */
export function usePageTranslation(
  docId: string,
  globalsRef: React.RefObject<Globals>,
  onPageAiChangeRef: React.RefObject<(pageNumber: number, entry: PageAiSummaryEntry | null) => void>,
  mountedRef: React.RefObject<boolean>,
  ensureKeyReady: () => boolean,
) {
  const [runningPages, setRunningPages] = useState<Set<number>>(new Set());
  /** Live streaming buffers (debounced via setInterval flusher). */
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
      let key = getKey();
      if (!key) {
        key = await syncGlobalKey();
      }
      const currentGlobals = globalsRef.current;
      if (!key) {
        ensureKeyReady();
        return;
      }

      // Read fresh page text + state from IDB
      const pageRec = await getPageData(docId, pageNumber);
      if (!pageRec) return;
      const state: PageAi = pageRec.pageAi ?? { pageNumber, status: "idle" };
      const eff = effective(currentGlobals, state.overrides);
      if (!eff.modelId) return;

      // One-shot selection override (from PDF text selection → "Translate")
      const selOverride = selectionOverridesRef.current.get(pageNumber);
      if (selOverride) selectionOverridesRef.current.delete(pageNumber);
      const effectiveText = selOverride ?? pageRec.text;

      let payload: Record<string, unknown>;
      if (state.isCustom && state.customRequest) {
        payload = { ...state.customRequest, stream: true };
      } else {
        payload = buildPagePayload({
          modelId: eff.modelId,
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

      // ---- Debounced UI flush ----
      const bufferRef = { current: "" };
      const lastUiRef = { current: "" };
      const flushUi = () => {
        if (!mountedRef.current) return;
        if (bufferRef.current === lastUiRef.current) return;
        lastUiRef.current = bufferRef.current;
        const snapshot = bufferRef.current;
        setStreamBufs((b) => ({ ...b, [pageNumber]: snapshot }));
      };
      const flushTimer = setInterval(flushUi, STREAM_FLUSH_MS);

      try {
        await streamCompletion({
          key,
          payload,
          signal: ctrl.signal,
          onDelta: (d) => {
            bufferRef.current += d;
          },
        });
        // Final flush before persisting to IDB
        flushUi();
        const result = bufferRef.current;
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
        if ((e as Error).name === "AbortError") {
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
          }
        }
      } finally {
        clearInterval(flushTimer);
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
    [docId],
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
