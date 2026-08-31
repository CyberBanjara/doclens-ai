import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { SidebarLayout } from "@/components/SidebarLayout";
import {
  fetchModels,
  getKeyStatus,
  readEffectiveGlobals,
  readGlobals,
  setMode as saveMode,
  setOutputLanguage,
  setSelectedModel,
  setStyle as saveStyle,
  setTemperature,
  validateKey,
  EXPLANATION_STYLES,
  TRANSLATION_STYLES,
  getCustomKey,
  setCustomKey,
  getAiProvider,
  setAiProvider,
  isOmniRouterConfigured,
  fetchOmniRouterModels,
  validateOmniRouterConnection,
  getOmniSelectedModel,
  setOmniSelectedModel,
  getOmniDefaultModelSync,
  type ExplanationStyle,
  type TranslationStyle,
  type ProcessingStyle,
  type GlobalMode,
  type ORModel,
  type AiProvider,
} from "@/lib/openrouter";
import { createDoc, StorageError } from "@/lib/storage";
import { toast } from "sonner";
import { clearAllVoiceCache, isOpfsSupported } from "@/lib/voiceCache";
import { filterVoicesByLanguage } from "@/lib/voiceLanguageMap";
import { markTtsVoiceSetupComplete, useTts } from "@/context/TtsContext";
import { getFriendlyErrorMessage } from "@/lib/network";
import { AiPipelineDefaultsSection } from "@/components/settings/AiPipelineDefaultsSection";
import { OutputLanguageSection } from "@/components/settings/OutputLanguageSection";
import { VoiceCacheManagerSection } from "@/components/settings/VoiceCacheManagerSection";
import { ApiKeySection } from "@/components/settings/ApiKeySection";
import { OmniRouterStatusSection } from "@/components/settings/OmniRouterStatusSection";
import { ModelSelectionSection } from "@/components/settings/ModelSelectionSection";
import { StorageManagerSection } from "@/components/settings/StorageManagerSection";

export const Route = createFileRoute("/settings")({
  component: SettingsPage,
  head: () => ({
    meta: [
      { title: "Anuwad — General Settings" },
      {
        name: "description",
        content:
          "Configure Anuwad's AI translation model, output language, explanation style, and API key — all stored locally in your browser.",
      },
      { property: "og:title", content: "Anuwad — General Settings" },
      {
        property: "og:description",
        content: "Configure Anuwad's AI translation model, output language, and API key.",
      },
      { property: "og:url", content: "https://www.anuwad.com/settings" },
      { property: "og:type", content: "website" },
    ],
    links: [{ rel: "canonical", href: "https://www.anuwad.com/settings" }],
  }),
});

type FilterTab = "free" | "popular" | "all";

const POPULAR_RX =
  /gpt-4o|gpt-4\.1|gpt-5|o1|o3|claude-3|claude-3\.5|claude-sonnet|claude-opus|claude-haiku|gemini-1\.5|gemini-2|llama-3|llama-4|deepseek|mistral-large|grok|qwen/i;

/** Filter to text-input → text-output models only. */
function isTextToText(m: ORModel): boolean {
  const arch = (m as any).architecture;
  if (arch && Array.isArray(arch.input_modalities) && Array.isArray(arch.output_modalities)) {
    const inputs: string[] = arch.input_modalities;
    const outputs: string[] = arch.output_modalities;
    const inOk = inputs.includes("text") && !inputs.some((m) => m !== "text" && m !== "file");
    const outOk = outputs.length === 1 && outputs[0] === "text";
    return inOk && outOk;
  }
  // Fallback: exclude obvious non-text models by id pattern
  const id = (m.id ?? "").toLowerCase();
  if (/(image|vision|tts|audio|whisper|dall-e|sora|video|embed|moderation|rerank)/.test(id))
    return false;
  return true;
}

function SettingsPage() {
  const navigate = useNavigate();

  const isOmniConfigured = useMemo(() => isOmniRouterConfigured(), []);
  const [provider, setProvider] = useState<AiProvider>("openrouter");
  const [keyStatus, setKeyStatus] = useState<
    "unknown" | "missing" | "valid" | "invalid" | "checking"
  >("unknown");
  const [customKey, setCustomKeyInput] = useState("");
  const [models, setModels] = useState<ORModel[]>([]);
  const [loadingModels, setLoadingModels] = useState(false);
  const [modelError, setModelError] = useState("");
  const [selected, setSelected] = useState("");

  // OmniRouter state
  const [omniModels, setOmniModels] = useState<ORModel[]>([]);
  const [loadingOmni, setLoadingOmni] = useState(false);
  const [omniStatus, setOmniStatus] = useState<"connected" | "disconnected" | "checking">("checking");
  const [omniError, setOmniError] = useState("");
  const [omniSelected, setOmniSelected] = useState("");

  const [language, setLanguage] = useState("हिंदी");
  const [customLang, setCustomLang] = useState("");
  const [search, setSearch] = useState("");
  const [tab, setTab] = useState<FilterTab>("free");
  const [mode, setModeState] = useState<GlobalMode>("explain");
  const [style, setStyleState] = useState<ProcessingStyle>("Standard");
  const [temperature, setTemp] = useState(0.3);
  const [downloadProgress, setDownloadProgress] = useState<Record<string, number>>({});
  const isOpfs = useMemo(() => isOpfsSupported(), []);
  const {
    allNeuralVoices,
    setOutputLanguage: setTtsLanguage,
    downloadVoice: downloadTtsVoice,
    deleteVoice: deleteTtsVoice,
    refreshVoices: refreshTtsVoices,
    availableVoices,
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

  const loadOmniModels = async () => {
    if (!isOmniRouterConfigured()) return;
    setLoadingOmni(true);
    setOmniError("");
    setOmniStatus("checking");
    try {
      const res = await validateOmniRouterConnection();
      if (res.ok) {
        setOmniStatus("connected");
        const m = await fetchOmniRouterModels();
        setOmniModels(m);
        const stored = getOmniSelectedModel();
        if (stored && m.some((x) => x.id === stored)) {
          setOmniSelected(stored);
        } else if (m.length > 0) {
          const def = getOmniDefaultModelSync();
          const chosen = def && m.some((x) => x.id === def) ? def : m[0].id;
          setOmniSelected(chosen);
          setOmniSelectedModel(chosen);
        }
      } else {
        setOmniStatus("disconnected");
        setOmniError(res.error || "Could not connect to OmniRouter.");
      }
    } catch (e) {
      setOmniStatus("disconnected");
      setOmniError(getFriendlyErrorMessage(e, "Connection test failed"));
    } finally {
      setLoadingOmni(false);
    }
  };

  useEffect(() => {
    const globals = readGlobals();
    setProvider(globals.provider ?? "openrouter");
    setSelected(globals.modelId);
    setOmniSelected(globals.omniModelId || getOmniSelectedModel() || getOmniDefaultModelSync());
    void readEffectiveGlobals().then((eff) => {
      if (!globals.modelId) setSelected(eff.modelId);
    });
    setLanguage(globals.language);
    setModeState(globals.mode);
    setStyleState(globals.style as ProcessingStyle);
    setTemp(globals.temperature);
    const savedKey = getCustomKey();
    setCustomKeyInput(savedKey);
    void loadModels();
    void handleValidate(savedKey);
    if (isOmniConfigured) {
      void loadOmniModels();
    }
    void refreshTtsVoices(true);
  }, [refreshTtsVoices, isOmniConfigured]);

  const loadModels = async () => {
    setLoadingModels(true);
    setModelError("");
    try {
      const m = await fetchModels();
      setModels(m);
    } catch (e) {
      setModelError(getFriendlyErrorMessage(e, "Failed to load models"));
    } finally {
      setLoadingModels(false);
    }
  };

  const handleValidate = async (keyToValidate?: string) => {
    setKeyStatus("checking");
    const targetKey = keyToValidate !== undefined ? keyToValidate : customKey;
    setCustomKey(targetKey);
    const ok = await validateKey(targetKey);
    if (ok) {
      setKeyStatus("valid");
      void loadModels();
    } else {
      const nextStatus = getKeyStatus();
      setKeyStatus(nextStatus === "invalid" ? "invalid" : "missing");
    }
  };

  const handleSelectModel = (id: string) => {
    if (provider === "omnirouter") {
      setOmniSelected(id);
      setOmniSelectedModel(id);
    } else {
      setSelected(id);
      setSelectedModel(id);
    }
  };

  const handleLangSelect = (l: string) => {
    setLanguage(l);
    setOutputLanguage(l);
    setTtsLanguage(l);
    markTtsVoiceSetupComplete();
  };

  const handleCustomLang = () => {
    const v = customLang.trim();
    if (!v) return;
    setLanguage(v);
    setOutputLanguage(v);
    setCustomLang("");
  };

  const activeModelList = provider === "omnirouter" ? omniModels : models;

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    // 1) text→text only across all tabs
    let list = activeModelList.filter(isTextToText);
    if (q)
      list = list.filter(
        (m) => m.id.toLowerCase().includes(q) || m.name?.toLowerCase().includes(q),
      );
    if (tab === "free") {
      list = list.filter(
        (m) =>
          parseFloat(m.pricing?.prompt ?? "0") === 0 &&
          parseFloat(m.pricing?.completion ?? "0") === 0,
      );
    } else if (tab === "popular") {
      list = list.filter((m) => POPULAR_RX.test(m.id));
    }
    return list.slice(0, 200);
  }, [activeModelList, search, tab]);

  return (
    <SidebarLayout
      pageTitle="General Settings"
      onNewDocument={async (f) => {
        try {
          const buf = await f.arrayBuffer();
          const rec = await createDoc(f, buf);
          toast.success(`"${f.name}" added to library.`);
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
        {/* Page Header — hidden on mobile, the top bar already shows "General Settings" */}
        <header className="hidden md:block">
          <h3 className="text-3xl font-bold tracking-tight text-foreground">General Settings</h3>
          <p className="mt-1 text-sm text-muted-foreground">
            Manage your preferences, translation models, and cache.
          </p>
        </header>

        {/* Row 1: AI Pipeline Defaults (full width) at the top */}
        <AiPipelineDefaultsSection
          provider={provider}
          onProviderChange={(p) => {
            setProvider(p);
            setAiProvider(p);
          }}
          mode={mode}
          onModeChange={(v) => {
            setModeState(v);
            saveMode(v);
          }}
          style={style}
          onStyleChange={(v) => {
            setStyleState(v);
            saveStyle(v);
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

        {/* Row 3: Provider Gateway/API Key Management + Model Selection */}
        <div className="grid grid-cols-1 gap-6 md:grid-cols-12">
          {provider === "omnirouter" ? (
            <OmniRouterStatusSection
              status={omniStatus}
              modelCount={omniModels.length}
              error={omniError}
              onRefresh={loadOmniModels}
              selectedModel={omniSelected}
              onSelectModel={handleSelectModel}
              models={omniModels}
            />
          ) : (
            <ApiKeySection
              customKey={customKey}
              onCustomKeyChange={setCustomKeyInput}
              keyStatus={keyStatus}
              onValidate={() => handleValidate()}
            />
          )}

          <ModelSelectionSection
            search={search}
            onSearchChange={setSearch}
            keyStatus={
              provider === "omnirouter"
                ? omniStatus === "connected"
                  ? "valid"
                  : omniStatus === "checking"
                    ? "checking"
                    : "invalid"
                : keyStatus
            }
            tab={tab}
            onTabChange={setTab}
            loadingModels={provider === "omnirouter" ? loadingOmni : loadingModels}
            modelError={provider === "omnirouter" ? omniError : modelError}
            filtered={filtered}
            selected={provider === "omnirouter" ? omniSelected : selected}
            onSelectModel={handleSelectModel}
          />
        </div>

        {/* Row 4: Storage Management & Reset */}
        <StorageManagerSection />
      </div>
    </SidebarLayout>
  );
}
