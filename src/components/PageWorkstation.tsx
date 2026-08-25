import { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
import { toast } from "sonner";
import { ExplainSetupDialog } from "@/components/ExplainSetupDialog";
import {
  fetchModels,
  getEffectiveSelectedModel,
  hasCompletedAiPreferenceSetup,
  getKey,
  getKeyStatus,
  getSelectedModel,
  MODE_LABELS,
  onKeyChange,
  openApiKeyModal,
  readEffectiveGlobals,
  readGlobals,
  setMode as saveMode,
  setOutputLanguage,
  setStyle as saveStyle,
  type ExplanationStyle,
  type Globals,
  type KeyStatus,
  type ORModel,
} from "@/lib/openrouter";

import { getPageData, type PageAi, type PageAiSummaryEntry } from "@/lib/storage";

import { effective, hashFor, dispatchPageReady } from "@/lib/pageAi";
import { usePageTranslation } from "@/hooks/usePageTranslation";
import { PageCardLoader } from "@/components/PageCard";
import { dispatchDocEvent, listenDocEvent } from "@/lib/docEvents";

interface Props {
  docId: string;
  pageCount: number;
  aiSummary: Record<number, PageAiSummaryEntry>;
  onPageAiChange: (pageNumber: number, entry: PageAiSummaryEntry | null) => void;
  activePage: number;
  setActivePage: (p: number) => void;
}

type PendingExplainAction =
  | { type: "page"; pageNumber: number }
  | { type: "page-ensure"; pageNumber: number };

export function PageWorkstation({
  docId,
  pageCount,
  aiSummary,
  onPageAiChange,
  activePage,
  setActivePage,
}: Props) {
  const [globals, setGlobals] = useState<Globals>(readGlobals);
  const [models, setModels] = useState<ORModel[]>([]);

  const [explainSetupOpen, setExplainSetupOpen] = useState(false);
  const [pendingExplainAction, setPendingExplainAction] = useState<PendingExplainAction | null>(
    null,
  );
  const [modelResolved, setModelResolved] = useState(() => !!getSelectedModel());

  const mountedRef = useRef(true);

  const aiSummaryRef = useRef(aiSummary);
  aiSummaryRef.current = aiSummary;
  const globalsRef = useRef(globals);
  globalsRef.current = globals;
  const onPageAiChangeRef = useRef(onPageAiChange);
  onPageAiChangeRef.current = onPageAiChange;
  const explainSetupKey = `doclens.explain.setup.${docId}`;

  // Cleanup: mark unmounted so in-flight async work in this component and
  // usePageTranslation's callbacks stop touching state.
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    const onFocus = () => {
      void readEffectiveGlobals().then((next) => {
        if (!mountedRef.current) return;
        globalsRef.current = next;
        setGlobals(next);
        setModelResolved(true);
      });
    };
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, []);

  const shouldShowExplainSetup = useCallback(() => {
    if (typeof window === "undefined") return false;
    return (
      globalsRef.current.mode === "explain" &&
      localStorage.getItem(explainSetupKey) !== "1" &&
      !hasCompletedAiPreferenceSetup()
    );
  }, [explainSetupKey]);

  useEffect(() => {
    if (globalsRef.current.modelId) {
      setModelResolved(true);
      return;
    }
    void getEffectiveSelectedModel()
      .then((modelId) => {
        if (!mountedRef.current) return;
        setModelResolved(true);
        if (!modelId || getSelectedModel()) return;
        setGlobals((current) => {
          if (current.modelId) return current;
          const next = { ...current, modelId };
          globalsRef.current = next;
          return next;
        });
      })
      .catch(() => {
        if (mountedRef.current) setModelResolved(true);
      });
  }, []);

  useEffect(() => {
    const k = getKey();
    if (!k) return;
    fetchModels(k)
      .then(setModels)
      .catch(() => {});
  }, []);

  const [keyStatus, setKeyStatusState] = useState<KeyStatus>("unknown");
  useEffect(() => {
    setKeyStatusState(getKeyStatus());
    return onKeyChange(() => {
      setKeyStatusState(getKeyStatus());
      const k = getKey();
      if (k)
        fetchModels(k)
          .then(setModels)
          .catch(() => {});
    });
  }, []);

  const hasKey = !!getKey();
  const keyReady = keyStatus !== "invalid" && keyStatus !== "missing" && hasKey;

  /** Returns true if the key is usable; otherwise opens modal + shows toast and returns false. */
  const ensureKeyReady = useCallback((): boolean => {
    if (!getKey()) {
      toast.error("Configure OPENROUTER_API_KEY to run translations.");
      openApiKeyModal("Add a valid OPENROUTER_API_KEY to start translating.");
      return false;
    }
    if (getKeyStatus() === "invalid") {
      toast.error("The OpenRouter API key is invalid or expired.");
      openApiKeyModal("The OpenRouter API key is invalid or expired.");
      return false;
    }
    return true;
  }, []);

  /* ---------- Per-page execution ---------- */

  const { runningPages, streamBufs, runPageOnce, cancelPage, selectionOverridesRef } =
    usePageTranslation(docId, globalsRef, onPageAiChangeRef, mountedRef, ensureKeyReady);

  // Listen for PDF-viewer "translate selection" events
  const runPageOnceRef = useRef(runPageOnce);
  runPageOnceRef.current = runPageOnce;
  useEffect(() => {
    return listenDocEvent("doclens:translate-selection", (d) => {
      if (d.docId !== docId || !d.text) return;
      selectionOverridesRef.current.set(d.pageNumber, d.text);
      void runPageOnceRef.current(d.pageNumber);
    });
  }, [docId, selectionOverridesRef]);

  const runPageWithSetup = useCallback(
    (pageNumber: number) => {
      if (shouldShowExplainSetup()) {
        setPendingExplainAction({ type: "page", pageNumber });
        setExplainSetupOpen(true);
        return;
      }
      void runPageOnce(pageNumber);
    },
    [runPageOnce, shouldShowExplainSetup],
  );

  // Handle "ensure this page's AI content is ready" requests from RightPanel —
  // driven by page navigation, continuous-play look-ahead, and AI-tab
  // catch-up. Fast-paths to doclens:page-ready if already fresh; otherwise
  // generates it with direct client-side execution.
  useEffect(() => {
    return listenDocEvent("doclens:ensure-page-ready", (d) => {
      if (d.docId !== docId) return;
      const { pageNumber } = d;

      void (async () => {
        const pageRec = await getPageData(docId, pageNumber);
        const state: PageAi = pageRec?.pageAi ?? { pageNumber, status: "idle" };

        if (state.status === "done" && !!state.result) {
          if (state.isCustom) {
            dispatchPageReady(docId, pageNumber, state.result);
            return;
          }
          const eff = effective(globalsRef.current, state.overrides);
          if (state.settingsHash === hashFor(eff)) {
            dispatchPageReady(docId, pageNumber, state.result);
            return;
          }
        }

        const result = await runPageOnce(pageNumber);
        if (result) dispatchPageReady(docId, pageNumber, result);
      })();
    });
  }, [docId, runPageOnce]);

  // ─── Auto-translate currently visible active page when doc is loaded and analyzed ───
  const autoTranslatedInitialPageRef = useRef<Record<string, number>>({});
  useEffect(() => {
    if (!mountedRef.current) return;
    if (pageCount <= 0) return;
    if (!keyReady || !globals.modelId) return;
    if (shouldShowExplainSetup()) return;

    const targetPage = activePage > 0 ? activePage : 1;
    const pageState = aiSummary[targetPage];
    const isIdle =
      !pageState ||
      (pageState.status !== "done" &&
        pageState.status !== "running" &&
        pageState.status !== "error");
    const lastTranslated = autoTranslatedInitialPageRef.current[docId];

    if (isIdle && lastTranslated !== targetPage) {
      autoTranslatedInitialPageRef.current[docId] = targetPage;
      void runPageOnce(targetPage);
    }
  }, [docId, pageCount, keyReady, globals.modelId, aiSummary, shouldShowExplainSetup, runPageOnce, activePage]);

  const handleExplainSetupConfirm = async (settings: {
    language: string;
    style: ExplanationStyle;
  }) => {
    saveMode("explain");
    setOutputLanguage(settings.language);
    saveStyle(settings.style);
    localStorage.setItem(explainSetupKey, "1");

    const nextGlobals = {
      ...(await readEffectiveGlobals()),
      mode: "explain" as const,
      language: settings.language,
      style: settings.style,
    };
    globalsRef.current = nextGlobals;
    setGlobals(nextGlobals);
    setExplainSetupOpen(false);

    const action = pendingExplainAction;
    setPendingExplainAction(null);
    if (action?.type === "page") void runPageOnce(action.pageNumber);
    else if (action?.type === "page-ensure") {
      const result = await runPageOnce(action.pageNumber);
      if (result) dispatchPageReady(docId, action.pageNumber, result);
    }
  };

  /* ---------- Empty / setup states ---------- */

  if (keyReady && !modelResolved && !globals.modelId) {
    return (
      <div className="flex h-full items-center justify-center px-6 text-center">
        <div className="flex items-center gap-3 text-sm text-muted-foreground">
          <span className="inline-block h-4 w-4 rounded-full border-2 border-primary border-t-transparent spin-slow" />
          Loading model defaults...
        </div>
      </div>
    );
  }

  if (!keyReady || !globals.modelId) {
    const noKey = !hasKey;
    const invalid = keyStatus === "invalid";
    const missing = keyStatus === "missing";
    return (
      <div className="flex h-full items-center justify-center px-6 text-center">
        <div className="max-w-xs">
          <div
            className={`text-sm font-medium ${invalid ? "text-destructive" : "text-foreground"}`}
          >
            {invalid ? "API Key Invalid" : missing || noKey ? "API Key Required" : "Setup Required"}
          </div>
          <p className="mt-2 text-sm text-muted-foreground">
            {invalid
              ? "The server OpenRouter key is invalid or expired."
              : missing || noKey
                ? "Configure OPENROUTER_API_KEY to enable AI translations."
                : "Select a model in Settings to get started."}
          </p>
          <div className="mt-4 flex items-center justify-center gap-2">
            {keyReady ? null : (
              <button
                onClick={() => openApiKeyModal()}
                className="rounded-lg bg-primary px-4 py-2 text-xs font-semibold text-primary-foreground transition-opacity hover:opacity-90"
              >
                Check API Key
              </button>
            )}
            <Link
              to="/settings"
              className="rounded-lg border border-border px-4 py-2 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
            >
              Open Settings
            </Link>
          </div>
        </div>
      </div>
    );
  }

  if (pageCount === 0) {
    return (
      <div className="flex h-full items-center justify-center px-6 text-center text-sm text-muted-foreground">
        Analyze the document to get started with AI translations.
      </div>
    );
  }

  const doneCount = Object.values(aiSummary).filter((e) => e.status === "done").length;
  const modeLabel = MODE_LABELS[globals.mode] || globals.mode;

  return (
    <div className="flex h-full flex-col">
      <ExplainSetupDialog
        open={explainSetupOpen}
        language={globals.language}
        style={globals.style as ExplanationStyle}
        onOpenChange={(open) => {
          setExplainSetupOpen(open);
          if (!open) setPendingExplainAction(null);
        }}
        onConfirm={handleExplainSetupConfirm}
      />

      {/* ─── Compact toolbar ─── */}
      <div className="flex items-center justify-between border-b border-border px-4 py-2">
        <div className="flex items-center gap-3">
          <span className="text-xs text-muted-foreground">
            {doneCount > 0 ? (
              <>
                {doneCount} of {pageCount} pages translated
              </>
            ) : (
              <>{pageCount} pages ready</>
            )}
          </span>
        </div>
      </div>

      {/* ─── Single page card ─── */}
      <div
        className="relative flex-1 overflow-auto px-5 py-4 page-card-enter"
        key={activePage}
        onClick={(e) => {
          const target = e.target as HTMLElement;
          if (target.closest("button, select, textarea, input, [role='button']")) return;
          dispatchDocEvent("doclens:scroll-to-pdf", { pageNumber: activePage });
        }}
      >
        <PageCardLoader
          docId={docId}
          pageNumber={activePage}
          globals={globals}
          models={models}
          summary={aiSummary[activePage]}
          isRunning={runningPages.has(activePage)}
          streamBuf={streamBufs[activePage] ?? ""}
          onPageAiChange={onPageAiChange}
          onRun={() => runPageWithSetup(activePage)}
          onCancel={() => cancelPage(activePage)}
        />
      </div>
    </div>
  );
}
