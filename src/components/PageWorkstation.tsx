import { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
import { toast } from "sonner";
import { Languages } from "lucide-react";
import { ExplainSetupDialog } from "@/components/ExplainSetupDialog";
import {
  fetchModels,
  fetchOmniRouterModels,
  fetchOllamaModels,
  isOmniRouterConfigured,
  getEffectiveSelectedModel,
  hasCompletedAiPreferenceSetup,
  getKey,
  getKeyStatus,
  getSelectedModel,
  getDefaultModelSync,
  getOmniSelectedModel,
  getOmniDefaultModelSync,
  getOllamaSelectedModel,
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
import { isPageTranslating } from "@/lib/pageTranslationRunner";
import { PageCardLoader } from "@/components/PageCard";
import { dispatchDocEvent, listenDocEvent } from "@/lib/docEvents";
import { useAuth } from "@/context/AuthContext";

interface Props {
  docId: string;
  pageCount: number;
  analyzing?: boolean;
  aiSummary: Record<number, PageAiSummaryEntry>;
  onPageAiChange: (pageNumber: number, entry: PageAiSummaryEntry | null) => void;
  activePage: number;
  setActivePage: (p: number) => void;
}

type PendingExplainAction =
  { type: "page"; pageNumber: number } | { type: "page-ensure"; pageNumber: number };

export function PageWorkstation({
  docId,
  pageCount,
  analyzing = false,
  aiSummary,
  onPageAiChange,
  activePage,
  setActivePage,
}: Props) {
  const { user, loading: authLoading, signInWithGoogle, updateProfile } = useAuth();
  const [globals, setGlobals] = useState<Globals>(readGlobals);
  const [models, setModels] = useState<ORModel[]>([]);
  const [omniModels, setOmniModels] = useState<ORModel[]>([]);
  const [ollamaModels, setOllamaModels] = useState<ORModel[]>([]);

  const isOmniConfigured = isOmniRouterConfigured();
  const [omniChecking, setOmniChecking] = useState(
    () => globals.provider === "omnirouter" && isOmniConfigured,
  );
  const [omniError, setOmniError] = useState<string | null>(null);

  const [explainSetupOpen, setExplainSetupOpen] = useState(false);
  const [pendingExplainAction, setPendingExplainAction] = useState<PendingExplainAction | null>(
    null,
  );
  const [modelResolved, setModelResolved] = useState(() => {
    const p = globals.provider;
    if (p === "omnirouter") return !!(globals.omniModelId || getOmniSelectedModel());
    if (p === "ollama") return !!(globals.ollamaModelId || getOllamaSelectedModel());
    return !!(globals.modelId || getSelectedModel());
  });

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
    window.addEventListener("storage", onFocus);
    window.addEventListener("doclens:globals-changed", onFocus);
    window.addEventListener("doclens:output-language-changed", onFocus);
    window.addEventListener("doclens:workspace-reconciled", onFocus);
    return () => {
      window.removeEventListener("focus", onFocus);
      window.removeEventListener("storage", onFocus);
      window.removeEventListener("doclens:globals-changed", onFocus);
      window.removeEventListener("doclens:output-language-changed", onFocus);
      window.removeEventListener("doclens:workspace-reconciled", onFocus);
    };
  }, []);

  const shouldShowExplainSetup = useCallback(() => {
    if (typeof window === "undefined") return false;
    return (
      globalsRef.current.mode === "explain" &&
      localStorage.getItem(explainSetupKey) !== "1" &&
      !hasCompletedAiPreferenceSetup()
    );
  }, [explainSetupKey]);

  // OmniRouter verification & model loading when Workspace opens
  useEffect(() => {
    if (globals.provider === "omnirouter" && isOmniConfigured) {
      setOmniChecking(true);
      setOmniError(null);
      fetchOmniRouterModels()
        .then((m) => {
          if (!mountedRef.current) return;
          setOmniModels(m);
          setOmniChecking(false);
          setOmniError(null);
          setModelResolved(true);
        })
        .catch((err) => {
          if (!mountedRef.current) return;
          console.warn("OmniRouter check returned error on workspace open:", err);
          setOmniChecking(false);
          setOmniError(err instanceof Error ? err.message : "OmniRouter connection failed");
          setModelResolved(true);
          // Load OpenRouter models as fallback
          const k = getKey();
          if (k) {
            fetchModels(k)
              .then(setModels)
              .catch(() => {});
          }
        });
    } else {
      setOmniChecking(false);
      setModelResolved(true);
    }
  }, [globals.provider, isOmniConfigured]);

  useEffect(() => {
    const k = getKey();
    if (k) {
      fetchModels(k)
        .then(setModels)
        .catch(() => {});
    }
    if (globals.provider === "ollama") {
      fetchOllamaModels()
        .then(setOllamaModels)
        .catch(() => {});
    }
  }, [globals.provider]);

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
      if (!user) {
        toast.info("Please sign in with Google to translate text.");
        void signInWithGoogle();
        return;
      }
      if (analyzing) {
        toast.info("Please wait for document text extraction & OCR to finish.");
        return;
      }
      selectionOverridesRef.current.set(d.pageNumber, d.text);
      void runPageOnceRef.current(d.pageNumber);
    });
  }, [docId, selectionOverridesRef, analyzing, user, signInWithGoogle]);

  const runPageWithSetup = useCallback(
    (pageNumber: number) => {
      if (!user) {
        toast.info("Please sign in with Google to translate pages.");
        void signInWithGoogle();
        return;
      }
      if (analyzing) {
        toast.info("Document is currently processing. Please wait.");
        return;
      }
      if (shouldShowExplainSetup()) {
        setPendingExplainAction({ type: "page", pageNumber });
        setExplainSetupOpen(true);
        return;
      }
      void runPageOnce(pageNumber);
    },
    [runPageOnce, shouldShowExplainSetup, analyzing, user, signInWithGoogle],
  );

  // Handle "ensure this page's AI content is ready" requests from RightPanel —
  // driven by page navigation and AI-tab catch-up. Dispatches doclens:page-ready
  // if already translated and ready in storage. Never automatically triggers unprompted translations.
  useEffect(() => {
    return listenDocEvent("doclens:ensure-page-ready", (d) => {
      if (d.docId !== docId) return;
      if (analyzing || pageCount <= 0) return;
      const { pageNumber } = d;

      void (async () => {
        const pageRec = await getPageData(docId, pageNumber);
        if (!pageRec || !pageRec.text?.trim()) return;

        const state: PageAi = pageRec?.pageAi ?? { pageNumber, status: "idle" };

        if (state.status === "done" && !!state.result) {
          dispatchPageReady(docId, pageNumber, state.result);
        }
      })();
    });
  }, [docId, analyzing, pageCount]);

  const handleExplainSetupConfirm = async (settings: {
    language: string;
    style: ExplanationStyle;
  }) => {
    saveMode("explain");
    setOutputLanguage(settings.language);
    saveStyle(settings.style);
    localStorage.setItem(explainSetupKey, "1");

    if (user) {
      void updateProfile({
        nativeLanguage: settings.language,
        style: settings.style,
      }).catch((err) => console.warn("Failed to sync explain preferences to Firebase/JWT:", err));
    }

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

  const isOllamaProvider = globals.provider === "ollama";
  const isOmniProvider = globals.provider === "omnirouter";
  const isLocalProvider = isOllamaProvider || isOmniProvider;
  const activeModelId = isOllamaProvider
    ? globals.ollamaModelId || getOllamaSelectedModel() || globals.modelId
    : isOmniProvider
      ? globals.omniModelId ||
        getOmniSelectedModel() ||
        getOmniDefaultModelSync() ||
        globals.modelId
      : globals.modelId || getSelectedModel() || getDefaultModelSync();
  const providerReady = isLocalProvider || keyReady;

  if (authLoading) {
    return (
      <div className="flex h-full items-center justify-center px-6 text-center">
        <div className="flex items-center gap-3 text-sm text-muted-foreground">
          <span className="inline-block h-4 w-4 rounded-full border-2 border-primary border-t-transparent spin-slow" />
          Checking authentication...
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="flex h-full items-center justify-center p-4 sm:p-6 text-center">
        <div className="w-full max-w-sm rounded-3xl border border-border/80 bg-card/95 p-6 sm:p-8 shadow-2xl backdrop-blur-xl text-center space-y-5 sm:space-y-6 animate-in zoom-in-95 duration-200">
          <div className="mx-auto flex h-14 w-14 sm:h-16 sm:w-16 items-center justify-center rounded-2xl bg-primary/10 text-primary border border-primary/20 shadow-inner">
            <Languages className="h-7 w-7 sm:h-8 sm:w-8 text-primary" />
          </div>

          <div className="space-y-1.5 sm:space-y-2">
            <h2 className="text-xl sm:text-2xl font-extrabold tracking-tight text-foreground">
              Sign in to Translate
            </h2>
            <p className="text-xs sm:text-sm text-muted-foreground leading-relaxed max-w-xs mx-auto">
              Sign in with your Google account to translate pages, sync your translation history, and access AI features.
            </p>
          </div>

          <div className="space-y-3">
            <button
              type="button"
              onClick={() => void signInWithGoogle()}
              className="flex w-full items-center justify-center gap-3 rounded-2xl bg-primary py-3 sm:py-3.5 px-4 text-xs sm:text-sm font-semibold text-primary-foreground shadow-lg shadow-primary/25 transition-all hover:opacity-95 active:scale-95 cursor-pointer"
            >
              <svg className="h-4 w-4 sm:h-5 sm:w-5" viewBox="0 0 24 24">
                <path
                  fill="#4285F4"
                  d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                />
                <path
                  fill="#34A853"
                  d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                />
                <path
                  fill="#FBBC05"
                  d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
                />
                <path
                  fill="#EA4335"
                  d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
                />
              </svg>
              <span>Sign in with Google</span>
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (omniChecking && isOmniProvider) {
    return (
      <div className="flex h-full items-center justify-center px-6 text-center">
        <div className="flex items-center gap-3 text-sm text-muted-foreground">
          <span className="inline-block h-4 w-4 rounded-full border-2 border-primary border-t-transparent spin-slow" />
          Checking OmniRouter connection...
        </div>
      </div>
    );
  }

  if (providerReady && !modelResolved && !activeModelId) {
    return (
      <div className="flex h-full items-center justify-center px-6 text-center">
        <div className="flex items-center gap-3 text-sm text-muted-foreground">
          <span className="inline-block h-4 w-4 rounded-full border-2 border-primary border-t-transparent spin-slow" />
          Loading model defaults...
        </div>
      </div>
    );
  }

  if (!providerReady || !activeModelId) {
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
            {providerReady ? null : (
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

  if (pageCount === 0 || analyzing) {
    if (analyzing) {
      return (
        <div className="flex h-full items-center justify-center px-6 text-center">
          <div className="max-w-xs space-y-3 rounded-2xl border border-primary/20 bg-surface/50 backdrop-blur-md p-6 shadow-sm">
            <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-full bg-primary/10 text-primary">
              <span className="inline-block h-5 w-5 rounded-full border-2 border-primary border-t-transparent spin-slow" />
            </div>
            <div className="space-y-1">
              <div className="text-sm font-semibold text-foreground">Processing Document</div>
              <p className="text-xs text-muted-foreground leading-relaxed">
                Extracting text, running OCR, and syncing translations before AI translation begins.
              </p>
            </div>
          </div>
        </div>
      );
    }
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
        className="relative flex-1 overflow-auto overscroll-contain px-5 py-4 page-card-enter"
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
          omniModels={omniModels}
          ollamaModels={ollamaModels}
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
