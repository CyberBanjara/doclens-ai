import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import {
  Brain,
  CircleCheck,
  Cpu,
  FolderOpen,
  KeyRound,
  Languages,
  Loader2,
  Search,
  Sparkles,
  Star,
  Trash2,
  VolumeX,
  Zap,
} from "lucide-react";
import { SidebarLayout } from "@/components/SidebarLayout";
import {
  fetchModels,
  getEffectiveSelectedModel,
  getKeyStatus,
  getMode,
  getOutputLanguage,
  getSelectedModel,
  getStyle,
  getTemperature,
  MODE_INSTRUCTIONS,
  setMode as saveMode,
  setOutputLanguage,
  setSelectedModel,
  setStyle as saveStyle,
  setTemperature,
  validateKey,
  EXPLANATION_STYLES,
  getCustomKey,
  setCustomKey,
  type ExplanationStyle,
  type GlobalMode,
  type ORModel,
} from "@/lib/openrouter";
import { estimateStorage, clearAllAiResults, createDoc, StorageError } from "@/lib/storage";
import { toast } from "sonner";
import { clearAllVoiceCache, isOpfsSupported } from "@/lib/voiceCache";
import { filterVoicesByLanguage, getLanguageEnglishName, LANGUAGES } from "@/lib/voiceLanguageMap";
import { markTtsVoiceSetupComplete, useTts } from "@/context/TtsContext";
import { getFriendlyErrorMessage } from "@/lib/network";

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

const STYLES: ExplanationStyle[] = EXPLANATION_STYLES.map((s) => s.id);

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

  const [keyStatus, setKeyStatus] = useState<
    "unknown" | "missing" | "valid" | "invalid" | "checking"
  >("unknown");
  const [customKey, setCustomKeyInput] = useState("");
  const [models, setModels] = useState<ORModel[]>([]);
  const [loadingModels, setLoadingModels] = useState(false);
  const [modelError, setModelError] = useState("");
  const [selected, setSelected] = useState("");
  const [language, setLanguage] = useState("हिंदी");
  const [customLang, setCustomLang] = useState("");
  const [search, setSearch] = useState("");
  const [tab, setTab] = useState<FilterTab>("free");
  const [mode, setModeState] = useState<GlobalMode>("explain");
  const [style, setStyleState] = useState<ExplanationStyle>("Standard");
  const [temperature, setTemp] = useState(0.3);
  const [storageStats, setStorageStats] = useState<{
    usage: string;
    quota: string;
    percent: string;
    pctNum: number;
  } | null>(null);
  const [clearing, setClearing] = useState(false);
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

  const updateStorageStats = async () => {
    const est = await estimateStorage();
    if (est) {
      const mbUsage = (est.usage / (1024 * 1024)).toFixed(1);
      const mbQuota = (est.quota / (1024 * 1024)).toFixed(0);
      const pctNum = est.quota > 0 ? (est.usage / est.quota) * 100 : 0;
      const pct = pctNum.toFixed(2);
      setStorageStats({
        usage: `${mbUsage} MB`,
        quota: `${mbQuota} MB`,
        percent: `${pct}%`,
        pctNum,
      });
    }
  };

  const handleClearCache = async () => {
    if (
      !confirm(
        "Are you sure you want to clear all AI translation/explanation cached results? Extracted document text will be preserved.",
      )
    )
      return;
    setClearing(true);
    try {
      await clearAllAiResults();
      toast.success("AI translation and explanation cache cleared successfully!");
      void updateStorageStats();
    } catch (e) {
      toast.error(`Clear failed: ${e instanceof Error ? e.message : "unknown"}`);
    } finally {
      setClearing(false);
    }
  };

  useEffect(() => {
    setSelected(getSelectedModel());
    void getEffectiveSelectedModel().then((modelId) => {
      if (!getSelectedModel()) setSelected(modelId);
    });
    setLanguage(getOutputLanguage());
    setModeState(getMode());
    setStyleState(getStyle());
    setTemp(getTemperature());
    const savedKey = getCustomKey();
    setCustomKeyInput(savedKey);
    void handleValidate(savedKey);
    void updateStorageStats();
    void refreshTtsVoices();
  }, [refreshTtsVoices]);

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
    setSelected(id);
    setSelectedModel(id);
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

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    // 1) text→text only across all tabs
    let list = models.filter(isTextToText);
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
  }, [models, search, tab]);

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
      topBarRight={
        <span className="rounded-full border border-primary/20 bg-primary/10 px-4 py-1 text-xs font-bold text-primary">
          System Online
        </span>
      }
    >
      <div className="mx-auto max-w-7xl space-y-6 p-4 pb-28 md:space-y-8 md:p-8">
        {/* Page Header — hidden on mobile, the top bar already shows "General Settings" */}
        <header className="hidden md:block">
          <h3 className="text-4xl font-bold tracking-tight text-foreground">General Settings</h3>
          <p className="mt-2 text-base text-muted-foreground">
            Configure your AI intelligence core and global defaults.
          </p>
        </header>

        {/* Row 1: AI Pipeline Defaults (full width) at the top */}
        <section className="glass-panel rounded-[18px] p-4 md:p-6">
          <div className="mb-6 flex items-center gap-3">
            <Zap className="h-5 w-5 text-accent" />
            <h3 className="text-lg font-semibold text-foreground">AI Pipeline Defaults</h3>
          </div>
          <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
            {/* Default Mode */}
            <div className="flex flex-col gap-2">
              <label className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
                Default Mode
              </label>
              <select
                value={mode}
                onChange={(e) => {
                  const v = e.target.value as GlobalMode;
                  setModeState(v);
                  saveMode(v);
                }}
                className="w-full cursor-pointer rounded-[10px] border border-border bg-background px-3 py-2 text-sm outline-none transition-colors focus:border-primary"
              >
                {Object.entries(MODE_INSTRUCTIONS).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v.label}
                  </option>
                ))}
              </select>
            </div>

            {/* Tone Style */}
            <div className="flex flex-col gap-2">
              <label className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
                Tone Style {mode === "translate" ? "(ignored in translate)" : ""}
              </label>
              <select
                value={style}
                disabled={mode === "translate"}
                onChange={(e) => {
                  const v = e.target.value as ExplanationStyle;
                  setStyleState(v);
                  saveStyle(v);
                }}
                className="w-full cursor-pointer rounded-[10px] border border-border bg-background px-3 py-2 text-sm outline-none transition-colors focus:border-primary disabled:opacity-50"
              >
                {EXPLANATION_STYLES.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.label}
                  </option>
                ))}
              </select>
            </div>

            {/* Temperature */}
            <div className="flex flex-col gap-2">
              <div className="flex items-center justify-between">
                <label className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
                  Temperature
                </label>
                <span className="text-sm font-semibold text-accent">{temperature.toFixed(1)}</span>
              </div>
              <input
                type="range"
                min={0}
                max={1.5}
                step={0.05}
                value={temperature}
                onChange={(e) => {
                  const v = parseFloat(e.target.value);
                  setTemp(v);
                  setTemperature(v);
                }}
                className="mt-2 w-full"
              />
              <div className="flex justify-between text-[10px] uppercase text-muted-foreground">
                <span>Precise</span>
                <span>Creative</span>
              </div>
            </div>
          </div>
        </section>

        {/* Row 2: Two-column layout (Output Language on left, Natural Voice Cache Manager on right) */}
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          {/* Output Language */}
          <section className="glass-panel flex flex-col gap-4 rounded-[18px] p-4 md:p-6">
            <div className="flex items-center gap-3">
              <Languages className="h-5 w-5 text-primary" />
              <h3 className="text-lg font-semibold text-foreground">Output Language</h3>
            </div>
            <p className="text-sm text-muted-foreground">
              Default language for AI-generated summaries, translations, and text-to-speech.
            </p>
            <div className="relative">
              <input
                value={customLang}
                onChange={(e) => setCustomLang(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleCustomLang()}
                placeholder="Search or type a custom language..."
                className="w-full rounded-[10px] border border-border bg-background py-2 pl-10 pr-4 text-sm outline-none transition-colors focus:border-primary"
              />
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            </div>
            {/* Language Cards Grid */}
            <div
              className="grid gap-3 md:max-h-[480px] md:overflow-y-auto md:pr-1"
              style={{ gridTemplateColumns: "repeat(auto-fill, minmax(130px, 1fr))" }}
            >
              {LANGUAGES.filter((l) => {
                if (!customLang.trim()) return true;
                const q = customLang.trim().toLowerCase();
                return (
                  l.native.toLowerCase().includes(q) ||
                  l.english.toLowerCase().includes(q) ||
                  l.id.toLowerCase().includes(q)
                );
              }).map((l) => {
                const isSelected = language === l.id;
                return (
                  <button
                    key={l.id}
                    onClick={() => handleLangSelect(l.id)}
                    className={`group relative flex flex-col items-center justify-center gap-1 rounded-[16px] border px-3 py-4 text-center transition-all duration-300 active:scale-[0.97] hover:shadow-lg ${
                      isSelected
                        ? "border-primary/50 bg-primary/10 ring-1 ring-primary/30 shadow-[0_0_20px_-4px] shadow-primary/25"
                        : "border-border bg-surface/30 hover:border-border-strong hover:bg-surface/60"
                    }`}
                  >
                    <span
                      className={`text-lg font-bold leading-tight transition-transform duration-300 group-hover:scale-105 ${
                        isSelected ? "text-primary" : "text-foreground"
                      }`}
                    >
                      {l.native}
                    </span>
                    <span
                      className={`text-[10px] font-semibold uppercase tracking-wider transition-colors duration-300 ${
                        isSelected
                          ? "text-primary/80"
                          : "text-muted-foreground group-hover:text-foreground/75"
                      }`}
                    >
                      {l.english}
                    </span>
                    {isSelected && (
                      <span className="absolute -top-1 -right-1 flex h-4.5 w-4.5 items-center justify-center rounded-full bg-primary text-[10px] text-primary-foreground shadow-md font-bold">
                        ✓
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </section>

          {/* Natural Voice Cache Manager — Language-Aware */}
          <section className="glass-panel flex flex-col rounded-[18px] p-4 md:p-6">
            <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <Sparkles className="h-5 w-5 flex-shrink-0 text-primary" />
                <div>
                  <h3 className="text-lg font-semibold text-foreground">
                    Natural Voice Cache Manager
                  </h3>
                  <p className="text-xs text-muted-foreground">
                    Showing voices for{" "}
                    <span className="font-semibold text-primary">
                      {getLanguageEnglishName(language)}
                    </span>
                    . Pre-download and manage neural speech models for instant offline playback.
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-4">
                <span
                  className={`flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-bold ${isOpfs ? "bg-primary/10 text-primary" : "bg-yellow-500/10 text-yellow-500"}`}
                >
                  <FolderOpen className="h-3.5 w-3.5" />
                  {isOpfs ? "OPFS (Primary)" : "IndexedDB (Fallback)"}
                </span>
                <button
                  onClick={handleClearVoiceCache}
                  className="flex items-center gap-1.5 rounded-full px-4 py-2 text-xs font-bold text-destructive transition-all hover:bg-destructive/10 active:scale-95"
                >
                  <Trash2 className="h-3.5 w-3.5" /> Clear All Voices
                </button>
              </div>
            </div>

            {languageFilteredNeuralVoices.length === 0 ? (
              <div className="my-auto flex flex-col items-center justify-center rounded-xl border border-dashed border-border bg-surface/30 px-6 py-10 text-center">
                <VolumeX className="mb-3 h-7 w-7 text-muted-foreground" />
                <p className="text-sm font-medium text-muted-foreground">
                  No neural voices available for{" "}
                  <span className="text-foreground font-semibold">
                    {getLanguageEnglishName(language)}
                  </span>
                  .
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Neural TTS voices are available for languages like Hindi, English, French, German,
                  Spanish, and many more.
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:max-h-[480px] md:overflow-y-auto md:pr-1">
                {languageFilteredNeuralVoices.map((voice) => {
                  const voiceId = voice.voiceURI;
                  const isCached = voice.isDownloaded;
                  const progress = downloadProgress[voiceId];
                  const isDownloading = progress !== undefined;

                  return (
                    <div
                      key={voiceId}
                      className={`flex flex-col justify-between rounded-xl border p-4 transition-all ${
                        isCached ? "border-primary/20 bg-primary/5" : "border-border bg-background"
                      }`}
                    >
                      <div>
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-sm font-bold text-foreground">
                            {voice.name.replace(/^✨ Neural /, "")}
                          </span>
                          <span className="rounded-full bg-surface-2 px-2 py-0.5 text-[10px] font-bold text-muted-foreground uppercase">
                            {voice.lang}
                          </span>
                        </div>
                        <span className="block font-mono text-[10px] text-muted-foreground truncate mb-3">
                          {voiceId}
                        </span>
                      </div>

                      <div className="flex items-center justify-between gap-4 mt-auto">
                        <span className="text-xs font-semibold">
                          {isDownloading ? (
                            <span className="flex items-center gap-1 font-bold text-primary">
                              <Loader2 className="h-3 w-3 animate-spin" /> Downloading {progress}%
                            </span>
                          ) : isCached ? (
                            <span className="flex items-center gap-1 text-primary">
                              <CircleCheck className="h-3 w-3" /> Cached
                            </span>
                          ) : (
                            <span className="text-muted-foreground">Not cached</span>
                          )}
                        </span>

                        {isCached ? (
                          <button
                            onClick={() => handleDeleteVoice(voiceId)}
                            className="rounded-full bg-destructive/10 px-3 py-1.5 text-xs font-bold text-destructive hover:bg-destructive/20 active:scale-95 transition-all"
                          >
                            Delete
                          </button>
                        ) : (
                          <button
                            onClick={() => handleDownloadVoice(voiceId)}
                            disabled={isDownloading}
                            className="rounded-full bg-primary px-3 py-1.5 text-xs font-bold text-primary-foreground hover:bg-primary/95 active:scale-95 transition-all disabled:opacity-50"
                          >
                            {isDownloading ? "Downloading…" : "Download"}
                          </button>
                        )}
                      </div>

                      {isDownloading && (
                        <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-background">
                          <div
                            className="h-full rounded-full bg-primary transition-all duration-300"
                            style={{ width: `${progress}%` }}
                          />
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </section>
        </div>

        {/* Row 3: API Key Management + Model Selection */}
        <div className="grid grid-cols-1 gap-6 md:grid-cols-12">
          {/* API Key Management */}
          <section className="glass-panel flex flex-col gap-4 rounded-[18px] p-4 md:col-span-5 md:p-6">
            <div className="flex items-center gap-3">
              <KeyRound className="h-5 w-5 text-primary" />
              <h3 className="text-lg font-semibold text-foreground">API Key Management</h3>
            </div>
            <p className="text-sm text-muted-foreground">
              Anuwad uses the server-managed key by default, but you can enter your own key here to
              override it.
            </p>

            <div className="flex flex-col gap-1.5">
              <div className="flex justify-between items-center">
                <label className="text-xs font-semibold text-foreground">
                  Custom API Key (Optional)
                </label>
                <a
                  href="https://openrouter.ai/keys"
                  target="_blank"
                  rel="noreferrer"
                  className="text-[10px] text-primary hover:underline"
                >
                  Get a key →
                </a>
              </div>
              <input
                type="password"
                placeholder="sk-or-v1-..."
                value={customKey}
                onChange={(e) => setCustomKeyInput(e.target.value)}
                className="w-full rounded-[10px] border border-border bg-background px-3 py-2 text-sm font-mono outline-none focus:border-primary"
              />
              <p className="text-[10px] text-muted-foreground">
                Leave blank to fallback to the server environment key. Saved locally in your
                browser.
              </p>
            </div>

            <button
              onClick={() => handleValidate()}
              disabled={keyStatus === "checking"}
              className="w-full rounded-full bg-accent py-2 text-sm font-semibold text-accent-foreground transition-all hover:opacity-90 active:scale-95 disabled:opacity-40 shadow-sm"
            >
              {keyStatus === "checking" ? "Checking..." : "Save and Verify Connection"}
            </button>
            <div className="text-xs font-semibold">
              {keyStatus === "valid" && (
                <span className="text-primary">
                  {customKey.trim() ? "Custom key validated" : "Server key validated"}
                </span>
              )}
              {keyStatus === "missing" && (
                <span className="text-destructive">
                  No API key configured (neither server nor custom key)
                </span>
              )}
              {keyStatus === "invalid" && (
                <span className="text-destructive">
                  {customKey.trim() ? "Invalid custom key" : "Invalid server key"}
                </span>
              )}
              {keyStatus === "unknown" && (
                <span className="text-muted-foreground">Not checked</span>
              )}
            </div>
          </section>

          {/* Model Selection */}
          <section className="glass-panel flex flex-col gap-4 rounded-[18px] p-4 md:col-span-7 md:p-6">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-center gap-3">
                <Brain className="h-5 w-5 text-yellow-500" />
                <h3 className="text-lg font-semibold text-foreground">Model Selection</h3>
              </div>
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Filter models..."
                className="w-full rounded-full border border-border bg-background px-4 py-1.5 text-xs outline-none transition-colors focus:border-primary sm:w-48"
              />
            </div>

            {keyStatus !== "valid" ? (
              <p className="text-sm text-muted-foreground">
                Configure OPENROUTER_API_KEY to load models.
              </p>
            ) : (
              <>
                <div className="flex flex-wrap items-center gap-2">
                  {(["free", "popular", "all"] as FilterTab[]).map((t) => (
                    <button
                      key={t}
                      onClick={() => setTab(t)}
                      className={`rounded-full border px-3.5 py-1 text-xs font-semibold uppercase tracking-wide transition-all active:scale-95 ${
                        tab === t
                          ? "border-primary bg-primary/15 text-primary"
                          : "border-border bg-background text-muted-foreground hover:text-foreground"
                      }`}
                    >
                      {t}
                    </button>
                  ))}
                </div>

                {loadingModels && (
                  <div className="text-xs text-muted-foreground">Loading models…</div>
                )}
                {modelError && <div className="text-xs text-destructive">{modelError}</div>}

                <div className="flex flex-col gap-2 md:max-h-[320px] md:overflow-y-auto md:pr-1">
                  {filtered.map((m) => {
                    const promptPrice = parseFloat(m.pricing?.prompt ?? "0") * 1_000_000;
                    const compPrice = parseFloat(m.pricing?.completion ?? "0") * 1_000_000;
                    const ctx = m.context_length ?? m.top_provider?.context_length ?? 0;
                    const active = selected === m.id;
                    return (
                      <button
                        key={m.id}
                        onClick={() => handleSelectModel(m.id)}
                        className={`flex w-full items-center justify-between rounded-[14px] border p-3 text-left transition-all active:scale-[0.99] ${
                          active
                            ? "border-primary/30 bg-primary/5 ring-1 ring-primary/50"
                            : "border-border bg-background hover:bg-surface-2"
                        }`}
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <div
                            className={`flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-[10px] border ${
                              active ? "border-primary bg-primary/20" : "border-border bg-surface-2"
                            }`}
                          >
                            {active ? (
                              <Star className="h-4 w-4 fill-current text-primary" />
                            ) : (
                              <Cpu className="h-4 w-4 text-muted-foreground" />
                            )}
                          </div>
                          <div className="min-w-0">
                            <div className="truncate text-sm font-bold text-foreground">
                              {m.name || m.id}
                            </div>
                            <div className="truncate text-[11px] text-muted-foreground">{m.id}</div>
                          </div>
                        </div>
                        <div className="flex-shrink-0 text-right">
                          <div className="text-xs font-bold text-primary">
                            {ctx ? `${(ctx / 1000).toFixed(0)}K CTX` : "—"}
                          </div>
                          <div className="font-mono text-[10px] text-muted-foreground">
                            ${promptPrice.toFixed(2)} / 1M
                          </div>
                        </div>
                      </button>
                    );
                  })}
                  {!loadingModels && filtered.length === 0 && (
                    <div className="py-4 text-center text-xs text-muted-foreground">
                      No models match
                    </div>
                  )}
                </div>
              </>
            )}
          </section>
        </div>
      </div>
    </SidebarLayout>
  );
}

/* ---------- Runtime Memory Diagnostics ---------- */

interface MemorySnapshot {
  jsHeapUsed: number;
  jsHeapTotal: number;
  jsHeapLimit: number;
  canvasCount: number;
  canvasActiveCount: number;
  canvasMemory: number;
  domNodes: number;
  textLayerSpans: number;
  dataUrlImgCount: number;
  dataUrlImgBytes: number;
  blobUrlCount: number;
  localStorageBytes: number;
  styleSheets: number;
  cssRules: number;
}

function collectMemorySnapshot(): MemorySnapshot {
  const mem = (performance as any).memory;
  const snap: MemorySnapshot = {
    jsHeapUsed: mem?.usedJSHeapSize ?? 0,
    jsHeapTotal: mem?.totalJSHeapSize ?? 0,
    jsHeapLimit: mem?.jsHeapSizeLimit ?? 0,
    canvasCount: 0,
    canvasActiveCount: 0,
    canvasMemory: 0,
    domNodes: document.querySelectorAll("*").length,
    textLayerSpans: document.querySelectorAll(".textLayer span").length,
    dataUrlImgCount: 0,
    dataUrlImgBytes: 0,
    blobUrlCount: 0,
    localStorageBytes: 0,
    styleSheets: document.styleSheets.length,
    cssRules: 0,
  };

  // Canvas memory
  const canvases = document.querySelectorAll("canvas");
  snap.canvasCount = canvases.length;
  canvases.forEach((c) => {
    if (c.width > 0 && c.height > 0) {
      snap.canvasActiveCount++;
      snap.canvasMemory += c.width * c.height * 4; // RGBA
    }
  });

  // Data URL images
  document.querySelectorAll("img").forEach((img) => {
    if (img.src?.startsWith("data:")) {
      snap.dataUrlImgCount++;
      snap.dataUrlImgBytes += img.src.length;
    }
  });

  // Blob URLs
  document.querySelectorAll("*").forEach((el) => {
    for (const attr of ["src", "href"]) {
      const val = el.getAttribute(attr);
      if (val?.startsWith("blob:")) snap.blobUrlCount++;
    }
  });

  // LocalStorage
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key) snap.localStorageBytes += key.length + (localStorage.getItem(key) || "").length;
  }

  // CSS rules
  for (let i = 0; i < document.styleSheets.length; i++) {
    try {
      snap.cssRules += document.styleSheets[i].cssRules.length;
    } catch {
      /* cross-origin */
    }
  }

  return snap;
}

function fmtMB(bytes: number): string {
  if (bytes >= 1048576) return `${(bytes / 1048576).toFixed(1)} MB`;
  if (bytes >= 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${bytes} B`;
}

const DIAG_COLORS: Record<string, string> = {
  "JS Heap": "#4edea3",
  "Canvas Buffers": "#f59e0b",
  "Data URL Images": "#818cf8",
  "DOM Overhead": "#38bdf8",
  LocalStorage: "#a78bfa",
};

function MemoryDiagnostics() {
  const [snap, setSnap] = useState<MemorySnapshot | null>(null);
  const [paused, setPaused] = useState(false);

  useEffect(() => {
    setSnap(collectMemorySnapshot());
    if (paused) return;
    const id = setInterval(() => setSnap(collectMemorySnapshot()), 3000);
    return () => clearInterval(id);
  }, [paused]);

  if (!snap) return null;

  // Build breakdown rows: each contributes to the stacked bar
  const rows = [
    {
      label: "JS Heap",
      bytes: snap.jsHeapUsed,
      detail: `${fmtMB(snap.jsHeapUsed)} / ${fmtMB(snap.jsHeapTotal)} (limit ${fmtMB(snap.jsHeapLimit)})`,
    },
    {
      label: "Canvas Buffers",
      bytes: snap.canvasMemory,
      detail: `${snap.canvasActiveCount} active / ${snap.canvasCount} total`,
    },
    {
      label: "Data URL Images",
      bytes: snap.dataUrlImgBytes,
      detail: `${snap.dataUrlImgCount} image${snap.dataUrlImgCount === 1 ? "" : "s"}`,
    },
    {
      label: "DOM Overhead",
      bytes: snap.domNodes * 256,
      detail: `${snap.domNodes.toLocaleString()} nodes · ${snap.textLayerSpans} text spans`,
    },
    {
      label: "LocalStorage",
      bytes: snap.localStorageBytes * 2,
      detail: `${localStorage.length} keys`,
    },
  ];

  const totalTracked = rows.reduce((s, r) => s + r.bytes, 0);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
            Runtime Memory
          </span>
          <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-bold text-primary">
            LIVE
          </span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs font-bold text-foreground">{fmtMB(totalTracked)} tracked</span>
          <button
            onClick={() => setPaused(!paused)}
            className="rounded border border-border bg-background px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-muted-foreground transition-colors hover:text-foreground"
          >
            {paused ? "▶ Resume" : "⏸ Pause"}
          </button>
          <button
            onClick={() => setSnap(collectMemorySnapshot())}
            className="rounded border border-border bg-background px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-muted-foreground transition-colors hover:text-foreground"
          >
            ↻ Refresh
          </button>
        </div>
      </div>

      {/* Stacked bar */}
      <div className="h-4 w-full overflow-hidden rounded-full bg-background flex">
        {rows.map((row) => {
          const pct = totalTracked > 0 ? (row.bytes / totalTracked) * 100 : 0;
          if (pct < 0.5) return null;
          return (
            <div
              key={row.label}
              title={`${row.label}: ${fmtMB(row.bytes)}`}
              className="h-full transition-all duration-500"
              style={{
                width: `${pct}%`,
                backgroundColor: DIAG_COLORS[row.label] ?? "#6b7280",
                minWidth: pct > 0.5 ? "3px" : 0,
              }}
            />
          );
        })}
      </div>

      {/* Legend + breakdown rows */}
      <div className="grid grid-cols-1 gap-1.5">
        {rows.map((row) => (
          <div
            key={row.label}
            className="flex items-center justify-between rounded-lg border border-border/50 bg-background/40 px-3 py-1.5"
          >
            <div className="flex items-center gap-2.5">
              <span
                className="inline-block h-2.5 w-2.5 rounded-sm"
                style={{ backgroundColor: DIAG_COLORS[row.label] ?? "#6b7280" }}
              />
              <span className="text-xs font-bold text-foreground">{row.label}</span>
            </div>
            <div className="flex items-center gap-3">
              <span className="text-[11px] text-muted-foreground">{row.detail}</span>
              <span className="min-w-[5rem] text-right text-xs font-bold tabular-nums text-foreground">
                {fmtMB(row.bytes)}
              </span>
            </div>
          </div>
        ))}
      </div>

      {/* Additional stats */}
      <div className="flex flex-wrap gap-3 text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
        <span>Blob URLs: {snap.blobUrlCount}</span>
        <span>·</span>
        <span>Stylesheets: {snap.styleSheets}</span>
        <span>·</span>
        <span>CSS Rules: {snap.cssRules.toLocaleString()}</span>
      </div>
    </div>
  );
}
