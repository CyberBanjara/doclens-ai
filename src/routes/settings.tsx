import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { SidebarLayout } from "@/components/SidebarLayout";
import {
  getKeyStatus,
  readEffectiveGlobals,
  readGlobals,
  setMode as saveMode,
  setOutputLanguage,
  setSelectedModel,
  getSelectedModel,
  setStyle as saveStyle,
  setTemperature,
  validateKey,
  getCustomKey,
  setCustomKey,
  getAiProvider,
  setAiProvider,
  isOmniRouterConfigured,
  validateOmniRouterConnection,
  getOutputLanguage,
  getStyle,
  type ProcessingStyle,
  type GlobalMode,
  type AiProvider,
} from "@/lib/openrouter";
import {
  getOmniRouterBaseUrl,
  setOmniRouterBaseUrl,
  getOmniSelectedModel,
  setOmniSelectedModel,
  getOmniRouterApiKey,
} from "@/lib/omnirouter";
import { createDoc, StorageError } from "@/lib/storage";
import { toast } from "sonner";
import { clearAllVoiceCache, isOpfsSupported } from "@/lib/voiceCache";
import { filterVoicesByLanguage } from "@/lib/voiceLanguageMap";
import { markTtsVoiceSetupComplete, useTts } from "@/context/TtsContext";
import { getFriendlyErrorMessage } from "@/lib/network";
import { Palette } from "lucide-react";
import { AiPipelineDefaultsSection } from "@/components/settings/AiPipelineDefaultsSection";
import { OutputLanguageSection } from "@/components/settings/OutputLanguageSection";
import { VoiceCacheManagerSection } from "@/components/settings/VoiceCacheManagerSection";
import { ApiKeySection } from "@/components/settings/ApiKeySection";
import { OmniRouterStatusSection } from "@/components/settings/OmniRouterStatusSection";
import { ProviderModelSelectorModal } from "@/components/settings/ProviderModelSelectorModal";
import { StorageManagerSection } from "@/components/settings/StorageManagerSection";
import { ThemeSelectionModal } from "@/components/settings/ThemeSelectionModal";
import { getTheme, LIGHT_THEMES, DARK_THEMES } from "@/lib/theme";
import { useAuth } from "@/context/AuthContext";

export const Route = createFileRoute("/settings")({
  component: SettingsPage,
  head: () => ({
    meta: [
      { title: "Anuwad — General Settings" },
      {
        name: "description",
        content:
          "Configure Anuwad's AI translation preferences, output language, voice cache, and optional custom endpoints.",
      },
      { property: "og:title", content: "Anuwad — General Settings" },
      {
        property: "og:description",
        content: "Configure Anuwad's AI translation preferences, output language, and optional custom endpoints.",
      },
      { property: "og:url", content: "https://www.anuwad.com/settings" },
      { property: "og:type", content: "website" },
    ],
    links: [{ rel: "canonical", href: "https://www.anuwad.com/settings" }],
  }),
});

function SettingsPage() {
  const navigate = useNavigate();

  // Provider & key states
  const [provider, setProvider] = useState<AiProvider>(() => getAiProvider());
  const [keyStatus, setKeyStatus] = useState<
    "unknown" | "missing" | "valid" | "invalid" | "checking"
  >("unknown");
  const [customKey, setCustomKeyInput] = useState("");

  // OmniRouter state
  const [omniEndpoint, setOmniEndpoint] = useState(() => getOmniRouterBaseUrl() || "");
  const [loadingOmni, setLoadingOmni] = useState(false);
  const [omniStatus, setOmniStatus] = useState<"connected" | "disconnected" | "checking">(
    "checking",
  );
  const [omniError, setOmniError] = useState("");

  // Model selection states
  const [selectedOpenRouterModel, setSelectedOpenRouterModel] = useState(() => getSelectedModel() || "");
  const [selectedOmniModel, setSelectedOmniModel] = useState(() => getOmniSelectedModel() || "");
  const [isModelSelectorOpen, setIsModelSelectorOpen] = useState(false);
  const [activeSelectorProvider, setActiveSelectorProvider] = useState<"openrouter" | "omnirouter">("openrouter");

  // General defaults
  const [language, setLanguage] = useState(() => getOutputLanguage() || "");
  const [customLang, setCustomLang] = useState("");
  const [mode, setModeState] = useState<GlobalMode>("explain");
  const [style, setStyleState] = useState<ProcessingStyle>(
    () => (getStyle() as ProcessingStyle) || ("" as any),
  );
  const [temperature, setTemp] = useState(0.3);
  const [downloadProgress, setDownloadProgress] = useState<Record<string, number>>({});
  const isOpfs = useMemo(() => isOpfsSupported(), []);
  const [themeModalOpen, setThemeModalOpen] = useState(false);
  const [currentTheme, setCurrentTheme] = useState(() => getTheme());

  const currentThemeLabel = useMemo(() => {
    if (currentTheme === "system") return "System";
    const found = [...LIGHT_THEMES, ...DARK_THEMES].find((t) => t.id === currentTheme);
    return found ? found.label : currentTheme.charAt(0).toUpperCase() + currentTheme.slice(1);
  }, [currentTheme]);

  const {
    allNeuralVoices,
    setOutputLanguage: setTtsLanguage,
    downloadVoice: downloadTtsVoice,
    deleteVoice: deleteTtsVoice,
    refreshVoices: refreshTtsVoices,
  } = useTts();

  // Neural voices filtered by selected language for the Voice Manager
  const languageFilteredNeuralVoices = useMemo(() => {
    return filterVoicesByLanguage(allNeuralVoices, language);
  }, [allNeuralVoices, language]);

  const handleDownloadVoice = async (voiceId: string) => {
    setDownloadProgress((prev) => ({ ...prev, [voiceId]: 0 }));
    try {
      await downloadTtsVoice(voiceId, (progress) => {
        setDownloadProgress((prev) => ({ ...prev, [voiceId]: progress }));
      });
      toast.success(`Voice "${voiceId}" downloaded and cached successfully!`);
    } catch (err) {
      toast.error(getFriendlyErrorMessage(err, "Download failed. Please try again."));
    } finally {
      setDownloadProgress((prev) => {
        const next = { ...prev };
        delete next[voiceId];
        return next;
      });
    }
  };

  const handleDeleteVoice = async (voiceId: string) => {
    if (!confirm(`Are you sure you want to delete voice "${voiceId}" from cache?`)) return;
    try {
      await deleteTtsVoice(voiceId);
      toast.success(`Voice "${voiceId}" deleted from cache.`);
    } catch (err) {
      toast.error(`Delete failed: ${err instanceof Error ? err.message : "unknown"}`);
    }
  };

  const handleClearVoiceCache = async () => {
    if (
      !confirm(
        "Are you sure you want to delete all cached neural voice packs? This will require re-downloading them next time they are used.",
      )
    )
      return;
    try {
      await clearAllVoiceCache();
      toast.success("Voice cache cleared successfully!");
      void refreshTtsVoices();
    } catch (err) {
      toast.error(`Clear failed: ${err instanceof Error ? err.message : "unknown"}`);
    }
  };

  const loadOmniModels = async (targetBaseUrl?: string) => {
    const ep = targetBaseUrl !== undefined ? targetBaseUrl : (omniEndpoint || getOmniRouterBaseUrl());
    if (!ep) {
      setOmniStatus("disconnected");
      setOmniError("");
      return;
    }
    setLoadingOmni(true);
    setOmniError("");
    setOmniStatus("checking");
    try {
      const res = await validateOmniRouterConnection(ep, getOmniRouterApiKey() || undefined, AbortSignal.timeout(5000));
      if (res.ok) {
        setOmniStatus("connected");
      } else {
        setOmniStatus("disconnected");
        setOmniError("");
        toast.error("Not a valid API key");
        if (provider === "omnirouter") {
          setProvider("managed");
          setAiProvider("managed");
        }
      }
    } catch {
      setOmniStatus("disconnected");
      setOmniError("");
      toast.error("Not a valid API key");
      if (provider === "omnirouter") {
        setProvider("managed");
        setAiProvider("managed");
      }
    } finally {
      setLoadingOmni(false);
    }
  };

  const handleValidate = async (keyToValidate?: string) => {
    const targetKey = keyToValidate !== undefined ? keyToValidate : customKey;
    if (!targetKey.trim()) {
      setKeyStatus("missing");
      return;
    }
    setKeyStatus("checking");
    setCustomKey(targetKey);
    const ok = await validateKey(targetKey, 5000);
    if (ok) {
      setKeyStatus("valid");
    } else {
      setKeyStatus("unknown");
      toast.error("Not a valid API key");
      if (provider === "openrouter") {
        setProvider("managed");
        setAiProvider("managed");
      }
    }
  };

  useEffect(() => {
    const globals = readGlobals();
    const currentProvider = globals.provider ?? getAiProvider();
    setProvider(currentProvider);
    setLanguage(globals.language);
    setModeState(globals.mode);
    setStyleState(globals.style as ProcessingStyle);
    setTemp(globals.temperature);
    setSelectedOpenRouterModel(globals.modelId || getSelectedModel() || "");
    setSelectedOmniModel(globals.omniModelId || getOmniSelectedModel() || "");

    const savedKey = getCustomKey();
    setCustomKeyInput(savedKey);

    const savedOmni = getOmniRouterBaseUrl();
    setOmniEndpoint(savedOmni || "");

    // 1. Application startup: If both providers are OFF, do not perform any API key validation,
    // endpoint checks, or provider-related requests. Use Managed AI through environment variables by default.
    if (currentProvider === "managed") {
      setKeyStatus("unknown");
      setOmniStatus("disconnected");
      setOmniError("");
    } else if (currentProvider === "openrouter" && savedKey) {
      // 3. Startup with a previously enabled provider: Validate its key once.
      // If invalid, automatically turn it OFF after the existing 5-second validation period
      // and permanently stop retrying until the user explicitly enables it again.
      setKeyStatus("checking");
      void validateKey(savedKey, 5000).then((ok) => {
        if (ok) {
          setKeyStatus("valid");
        } else {
          setKeyStatus("unknown");
          setProvider("managed");
          setAiProvider("managed");
          toast.error("Not a valid API key");
        }
      });
    } else if (currentProvider === "omnirouter") {
      setOmniStatus("checking");
      setLoadingOmni(true);
      void validateOmniRouterConnection(savedOmni || undefined, getOmniRouterApiKey() || undefined).then((res) => {
        setLoadingOmni(false);
        if (res.ok) {
          setOmniStatus("connected");
        } else {
          setOmniStatus("disconnected");
          setOmniError(res.error || "");
          setProvider("managed");
          setAiProvider("managed");
          toast.error(res.error || "Could not connect to OmniRouter");
        }
      });
    }

    void refreshTtsVoices(true);

    const handleGlobalsChange = (e: Event) => {
      const customEvt = e as CustomEvent<{ provider?: AiProvider }>;
      if (customEvt.detail?.provider) {
        setProvider(customEvt.detail.provider);
      } else {
        setProvider(getAiProvider());
      }
    };
    window.addEventListener("doclens:globals-changed", handleGlobalsChange);
    return () => {
      window.removeEventListener("doclens:globals-changed", handleGlobalsChange);
    };
  }, [refreshTtsVoices]);

  const handleToggleOpenRouter = async () => {
    if (provider === "openrouter") {
      setProvider("managed");
      setAiProvider("managed");
      setKeyStatus("unknown");
      toast.info("OpenRouter turned OFF. Reverted to Managed AI (Default).");
      return;
    }

    const keyToValidate = customKey.trim() || getCustomKey().trim();
    if (!keyToValidate) {
      toast.error("Please enter an OpenRouter API key first.");
      return;
    }

    setKeyStatus("checking");
    setCustomKey(keyToValidate);
    try {
      const ok = await validateKey(keyToValidate, 5000);
      if (ok) {
        setKeyStatus("valid");
        setProvider("openrouter");
        setAiProvider("openrouter");
        toast.success("Personal OpenRouter turned ON.");
      } else {
        setKeyStatus("unknown");
        setProvider("managed");
        setAiProvider("managed");
        toast.error("Not a valid API key");
      }
    } catch {
      setKeyStatus("unknown");
      setProvider("managed");
      setAiProvider("managed");
      toast.error("Not a valid API key");
    }
  };

  const handleToggleOmniRouter = async () => {
    if (provider === "omnirouter") {
      setProvider("managed");
      setAiProvider("managed");
      setOmniStatus("disconnected");
      setOmniError("");
      toast.info("OmniRouter turned OFF. Reverted to Managed AI (Default).");
      return;
    }

    const epToValidate = omniEndpoint.trim() || getOmniRouterBaseUrl().trim();
    if (!epToValidate) {
      toast.error("Please enter an OmniRouter endpoint URL first.");
      return;
    }

    setLoadingOmni(true);
    setOmniStatus("checking");
    setOmniRouterBaseUrl(epToValidate);
    try {
      const res = await validateOmniRouterConnection(epToValidate, getOmniRouterApiKey().trim() || undefined);
      if (res.ok) {
        setOmniStatus("connected");
        setOmniError("");
        setProvider("omnirouter");
        setAiProvider("omnirouter");
        toast.success("OmniRouter turned ON.");
      } else {
        setOmniStatus("disconnected");
        setOmniError(res.error || "");
        setProvider("managed");
        setAiProvider("managed");
        toast.error(res.error || "Could not connect to OmniRouter");
      }
    } catch (err: any) {
      setOmniStatus("disconnected");
      const msg = err?.message || "Failed to connect to OmniRouter";
      setOmniError(msg);
      setProvider("managed");
      setAiProvider("managed");
      toast.error(msg);
    } finally {
      setLoadingOmni(false);
    }
  };

  const { user, updateProfile } = useAuth();

  useEffect(() => {
    if (user?.nativeLanguage) {
      setLanguage(user.nativeLanguage);
    }
  }, [user]);

  const handleLangSelect = (l: string) => {
    setLanguage(l);
    setOutputLanguage(l);
    setTtsLanguage(l);
    markTtsVoiceSetupComplete();
    if (user) {
      void updateProfile({ nativeLanguage: l }).catch((err) =>
        console.warn("Failed to update profile language in Firebase/JWT:", err),
      );
    }
  };

  const handleCustomLang = () => {
    const v = customLang.trim();
    if (!v) return;
    setLanguage(v);
    setOutputLanguage(v);
    setCustomLang("");
    if (user) {
      void updateProfile({ nativeLanguage: v }).catch((err) =>
        console.warn("Failed to update profile language in Firebase/JWT:", err),
      );
    }
  };

  return (
    <SidebarLayout
      pageTitle="Anuwad"
      onNewDocument={async (f) => {
        try {
          const rec = await createDoc(f);
          navigate({ to: "/doc/$id", params: { id: rec.id } });
        } catch (e) {
          if (e instanceof StorageError && e.code === "QUOTA_EXCEEDED") {
            toast.error(e.message);
          } else {
            toast.error("Failed to save document. Please try again.");
            console.error(e);
          }
        }
      }}
    >
      <div className="mx-auto max-w-7xl space-y-6 p-4 pb-28 md:space-y-8 md:p-8">
        {/* Page Header with Themes Trigger */}
        <header className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h3 className="text-2xl sm:text-3xl font-bold tracking-tight text-foreground">
              General Settings
            </h3>
            <p className="mt-1 text-xs sm:text-sm text-muted-foreground">
              Manage your translation preferences, languages, voice cache, and optional custom endpoints.
            </p>
          </div>
          <button
            type="button"
            id="open-theme-selection-modal"
            onClick={() => setThemeModalOpen(true)}
            className="flex items-center gap-2.5 self-start sm:self-auto rounded-xl border border-border bg-surface-2/70 px-4 py-2.5 text-sm font-semibold text-foreground transition-all duration-200 hover:bg-surface-2 hover:border-border-strong hover:shadow-md active:scale-95 cursor-pointer shadow-xs"
          >
            <Palette className="h-4 w-4 text-primary" />
            <span>Themes</span>
            <span className="ml-0.5 rounded-md bg-primary/10 px-2 py-0.5 text-xs font-semibold text-primary">
              {currentThemeLabel}
            </span>
          </button>
        </header>

        {/* Row 1: AI Pipeline Defaults (full width) at the top */}
        <AiPipelineDefaultsSection
          mode={mode}
          onModeChange={(v) => {
            setModeState(v);
            saveMode(v);
          }}
          style={style}
          onStyleChange={(v) => {
            setStyleState(v);
            saveStyle(v);
            if (user) {
              void updateProfile({ style: v }).catch((err) =>
                console.warn("Failed to update profile style in Firebase/JWT:", err),
              );
            }
          }}
          temperature={temperature}
          onTemperatureChange={(v) => {
            setTemp(v);
            setTemperature(v);
          }}
        />

        {/* Row 2: Two-column layout (Output Language on left, Natural Voice Cache Manager on right) */}
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <OutputLanguageSection
            language={language}
            customLang={customLang}
            onCustomLangChange={setCustomLang}
            onCustomLangSubmit={handleCustomLang}
            onLangSelect={handleLangSelect}
          />

          <VoiceCacheManagerSection
            language={language}
            isOpfs={isOpfs}
            languageFilteredNeuralVoices={languageFilteredNeuralVoices}
            downloadProgress={downloadProgress}
            onDownloadVoice={handleDownloadVoice}
            onDeleteVoice={handleDeleteVoice}
            onClearVoiceCache={handleClearVoiceCache}
          />
        </div>

        {/* Row 3: Optional Custom AI Providers (Side by Side) */}
        <div className="space-y-3.5">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
            <div>
              <h3 className="text-base font-bold tracking-tight text-foreground">
                Optional AI Providers
              </h3>
              <p className="text-xs text-muted-foreground mt-0.5">
                Managed AI is active by default. You can optionally connect your own personal OpenRouter key or OmniRouter endpoint below.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground">Active Engine:</span>
              <span
                id="active-ai-provider-badge"
                className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                  provider === "openrouter"
                    ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20"
                    : provider === "omnirouter"
                      ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20"
                      : "bg-primary/10 text-primary border border-primary/20"
                }`}
              >
                <span className="h-1.5 w-1.5 rounded-full bg-current" />
                {provider === "openrouter"
                  ? "OpenRouter (Personal)"
                  : provider === "omnirouter"
                    ? "OmniRouter (Custom)"
                    : "Managed AI (Default)"}
              </span>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
            <ApiKeySection
              customKey={customKey}
              onCustomKeyChange={setCustomKeyInput}
              keyStatus={keyStatus}
              onValidate={() => handleValidate()}
              isActive={provider === "openrouter"}
              onToggle={handleToggleOpenRouter}
              selectedModel={selectedOpenRouterModel}
              onOpenModelSelector={() => {
                setActiveSelectorProvider("openrouter");
                setIsModelSelectorOpen(true);
              }}
            />

            <OmniRouterStatusSection
              status={omniStatus}
              error={omniError}
              onRefresh={(baseUrl) => loadOmniModels(baseUrl)}
              endpoint={omniEndpoint}
              onEndpointChange={(ep) => setOmniEndpoint(ep)}
              isActive={provider === "omnirouter"}
              onToggle={handleToggleOmniRouter}
              selectedModel={selectedOmniModel}
              onOpenModelSelector={() => {
                setActiveSelectorProvider("omnirouter");
                setIsModelSelectorOpen(true);
              }}
            />
          </div>
        </div>

        {/* Row 4: Storage Management & Reset */}
        <StorageManagerSection />

        {/* Provider Model Selector Modal */}
        <ProviderModelSelectorModal
          open={isModelSelectorOpen}
          onOpenChange={setIsModelSelectorOpen}
          provider={activeSelectorProvider}
          selectedModelId={activeSelectorProvider === "omnirouter" ? selectedOmniModel : selectedOpenRouterModel}
          endpoint={omniEndpoint}
          apiKey={activeSelectorProvider === "openrouter" ? customKey : undefined}
          onSelectModel={(modelId) => {
            if (activeSelectorProvider === "omnirouter") {
              setSelectedOmniModel(modelId);
              setOmniSelectedModel(modelId);
            } else {
              setSelectedOpenRouterModel(modelId);
              setSelectedModel(modelId);
            }
          }}
        />

        {/* Themes Selection Pop-up Modal */}
        <ThemeSelectionModal
          open={themeModalOpen}
          onOpenChange={setThemeModalOpen}
          onThemeChange={setCurrentTheme}
        />
      </div>
    </SidebarLayout>
  );
}
