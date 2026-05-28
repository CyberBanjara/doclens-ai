import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { SidebarLayout } from "@/components/SidebarLayout";
import {
  fetchModels,
  getKey,
  getMemory,
  getMode,
  getOutputLanguage,
  getSelectedModel,
  getSequential,
  getStyle,
  getTemperature,
  MODE_INSTRUCTIONS,
  setKey as saveKey,
  setMemory,
  setMode as saveMode,
  setOutputLanguage,
  setSelectedModel,
  setSequential,
  setStyle as saveStyle,
  setTemperature,
  validateKey,
  EXPLANATION_STYLES,
  type ExplanationStyle,
  type GlobalMode,
  type ORModel,
} from "@/lib/openrouter";
import { estimateStorage, clearAllAiResults, createDoc, StorageError } from "@/lib/storage";
import { toast } from "sonner";

export const Route = createFileRoute("/settings")({
  component: SettingsPage,
  head: () => ({
    meta: [{ title: "DocLens — General Settings" }],
  }),
});

const LANGS = ["हिंदी", "বাংলা", "తెలుగు", "മലയാളം", "English", "Spanish", "Mandarin", "French", "German"];
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
  if (/(image|vision|tts|audio|whisper|dall-e|sora|video|embed|moderation|rerank)/.test(id)) return false;
  return true;
}

function SettingsPage() {
  const navigate = useNavigate();

  const [keyInput, setKeyInput] = useState("");
  const [keyStatus, setKeyStatus] = useState<"unknown" | "valid" | "invalid" | "checking">("unknown");
  const [showKey, setShowKey] = useState(false);
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
  const [memory, setMemoryState] = useState(true);
  const [sequential, setSequentialState] = useState(true);
  const [storageStats, setStorageStats] = useState<{ usage: string; quota: string; percent: string; pctNum: number } | null>(null);
  const [clearing, setClearing] = useState(false);

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
    if (!confirm("Are you sure you want to clear all AI translation/explanation cached results? Extracted document text will be preserved.")) return;
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
    setKeyInput(getKey());
    setSelected(getSelectedModel());
    setLanguage(getOutputLanguage());
    setModeState(getMode());
    setStyleState(getStyle());
    setTemp(getTemperature());
    setMemoryState(getMemory());
    setSequentialState(getSequential());
    if (getKey()) {
      setKeyStatus("valid");
      void loadModels(getKey());
    }
    void updateStorageStats();
  }, []);

  const loadModels = async (k: string) => {
    setLoadingModels(true);
    setModelError("");
    try {
      const m = await fetchModels(k);
      setModels(m);
    } catch (e) {
      setModelError(e instanceof Error ? e.message : "Failed to load models");
    } finally {
      setLoadingModels(false);
    }
  };

  const handleValidate = async () => {
    setKeyStatus("checking");
    const ok = await validateKey(keyInput.trim());
    if (ok) {
      saveKey(keyInput.trim());
      setKeyStatus("valid");
      void loadModels(keyInput.trim());
    } else {
      setKeyStatus("invalid");
    }
  };

  const handleSelectModel = (id: string) => {
    setSelected(id);
    setSelectedModel(id);
  };

  const handleLangSelect = (l: string) => {
    setLanguage(l);
    setOutputLanguage(l);
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
    if (q) list = list.filter((m) => m.id.toLowerCase().includes(q) || m.name?.toLowerCase().includes(q));
    if (tab === "free") {
      list = list.filter(
        (m) => parseFloat(m.pricing?.prompt ?? "0") === 0 && parseFloat(m.pricing?.completion ?? "0") === 0,
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
      <div className="mx-auto max-w-7xl space-y-8 p-8 pb-28">
        {/* Page Header */}
        <header>
          <h3 className="text-4xl font-bold tracking-tight text-foreground">
            General Settings
          </h3>
          <p className="mt-2 text-base text-muted-foreground">
            Configure your AI intelligence core and global defaults.
          </p>
        </header>

        {/* Row 1: Output Language + Storage & Database */}
        <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
          {/* Output Language */}
          <section className="glass-panel flex flex-col gap-4 rounded-xl p-6">
            <div className="flex items-center gap-3">
              <span className="text-xl text-primary">🌐</span>
              <h3 className="text-lg font-semibold text-foreground">Output Language</h3>
            </div>
            <p className="text-sm text-muted-foreground">
              Default language for AI-generated summaries and responses.
            </p>
            <div className="relative">
              <input
                value={customLang}
                onChange={(e) => setCustomLang(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleCustomLang()}
                placeholder="Search languages..."
                className="w-full rounded-lg border border-border bg-background py-2 pl-10 pr-4 text-sm outline-none transition-colors focus:border-primary"
              />
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">🔍</span>
            </div>
            <div className="flex flex-wrap gap-2">
              {LANGS.map((l) => (
                <button
                  key={l}
                  onClick={() => handleLangSelect(l)}
                  className={`rounded-full px-4 py-1.5 text-xs font-bold transition-all ${
                    language === l
                      ? "bg-primary text-primary-foreground"
                      : "bg-surface-2 text-muted-foreground hover:bg-border hover:text-foreground"
                  }`}
                >
                  {l}
                </button>
              ))}
            </div>
          </section>

          {/* Storage & Database */}
          <section className="glass-panel flex flex-col justify-between rounded-xl p-6">
            <div>
              <div className="flex items-center gap-3 mb-4">
                <span className="text-xl text-yellow-500">💾</span>
                <h3 className="text-lg font-semibold text-foreground">Storage & Database</h3>
              </div>
              {storageStats && (
                <div className="mt-2">
                  <div className="mb-2 flex justify-between text-xs font-bold text-muted-foreground">
                    <span>Workspace Usage</span>
                    <span className="text-foreground">{storageStats.usage} / {storageStats.quota}</span>
                  </div>
                  <div className="h-2 w-full overflow-hidden rounded-full bg-background">
                    <div
                      className="h-full rounded-full bg-yellow-500 transition-all"
                      style={{ width: `${Math.min(storageStats.pctNum, 100)}%` }}
                    />
                  </div>
                </div>
              )}
            </div>
            <div className="mt-6 flex justify-end">
              <button
                onClick={handleClearCache}
                disabled={clearing}
                className="flex items-center gap-2 rounded-lg px-4 py-2 text-xs font-bold text-destructive transition-all hover:bg-destructive/10 disabled:opacity-50"
              >
                🗑️ {clearing ? "Clearing…" : "Clear Cache"}
              </button>
            </div>
          </section>
        </div>

        {/* Row 2: AI Pipeline Defaults (full width) */}
        <section className="glass-panel rounded-xl p-6">
          <div className="mb-6 flex items-center gap-3">
            <span className="text-xl text-accent">⚡</span>
            <h3 className="text-lg font-semibold text-foreground">AI Pipeline Defaults</h3>
          </div>
          <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
            {/* Default Mode */}
            <div className="flex flex-col gap-2">
              <label className="text-xs font-bold uppercase tracking-wide text-muted-foreground">Default Mode</label>
              <select
                value={mode}
                onChange={(e) => {
                  const v = e.target.value as GlobalMode;
                  setModeState(v);
                  saveMode(v);
                }}
                className="w-full cursor-pointer rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none transition-colors focus:border-primary"
              >
                {Object.entries(MODE_INSTRUCTIONS).map(([k, v]) => (
                  <option key={k} value={k}>{v.label}</option>
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
                className="w-full cursor-pointer rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none transition-colors focus:border-primary disabled:opacity-50"
              >
                {EXPLANATION_STYLES.map((s) => (
                  <option key={s.id} value={s.id}>{s.label}</option>
                ))}
              </select>
            </div>

            {/* Temperature */}
            <div className="flex flex-col gap-2">
              <div className="flex items-center justify-between">
                <label className="text-xs font-bold uppercase tracking-wide text-muted-foreground">Temperature</label>
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

          {/* Memory & Sequential toggles */}
          <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2">
            <label className="flex items-center justify-between rounded-lg border border-border bg-background px-4 py-3">
              <span>
                <span className="block text-xs font-bold uppercase tracking-wide text-muted-foreground">Memory</span>
                <span className="text-sm text-foreground/80">Pass trailing excerpt of previous page into next request</span>
              </span>
              <input
                type="checkbox"
                checked={memory}
                onChange={(e) => { setMemoryState(e.target.checked); setMemory(e.target.checked); }}
                className="h-4 w-4 accent-primary"
              />
            </label>

            <label className="flex items-center justify-between rounded-lg border border-border bg-background px-4 py-3">
              <span>
                <span className="block text-xs font-bold uppercase tracking-wide text-muted-foreground">Sequential Execution</span>
                <span className="text-sm text-foreground/80">Run All Pages processes one at a time, in order</span>
              </span>
              <input
                type="checkbox"
                checked={sequential}
                onChange={(e) => { setSequentialState(e.target.checked); setSequential(e.target.checked); }}
                className="h-4 w-4 accent-primary"
              />
            </label>
          </div>
        </section>

        {/* Row 3: API Management + Model Selection */}
        <div className="grid grid-cols-1 gap-6 md:grid-cols-12">
          {/* API Management */}
          <section className="glass-panel flex flex-col gap-4 rounded-xl p-6 md:col-span-5">
            <div className="flex items-center gap-3">
              <span className="text-xl text-primary">🔑</span>
              <h3 className="text-lg font-semibold text-foreground">API Management</h3>
            </div>
            <p className="text-sm text-muted-foreground">
              Your OpenRouter credentials for high-performance inference.
            </p>
            <div className="flex flex-col gap-3">
              <label className="text-xs font-bold text-muted-foreground">OpenRouter Key</label>
              <div className="relative">
                <input
                  value={keyInput}
                  onChange={(e) => {
                    setKeyInput(e.target.value);
                    setKeyStatus("unknown");
                  }}
                  type={showKey ? "text" : "password"}
                  placeholder="sk-or-…"
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 pr-10 font-mono text-sm tracking-widest outline-none transition-colors focus:border-primary"
                />
                <button
                  onClick={() => setShowKey(!showKey)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  type="button"
                >
                  {showKey ? "🙈" : "👁"}
                </button>
              </div>
            </div>
            <button
              onClick={handleValidate}
              disabled={!keyInput.trim() || keyStatus === "checking"}
              className="w-full rounded-lg bg-accent py-2 font-bold text-accent-foreground transition-all hover:opacity-90 disabled:opacity-40"
            >
              {keyStatus === "checking" ? "Validating…" : "Verify Connection"}
            </button>
            <div className="text-xs font-semibold">
              {keyStatus === "valid" && <span className="text-primary">✓ Key validated and saved</span>}
              {keyStatus === "invalid" && <span className="text-destructive">✗ Invalid key</span>}
              {keyStatus === "unknown" && <span className="text-muted-foreground">Not validated</span>}
            </div>
          </section>

          {/* Model Selection */}
          <section className="glass-panel flex flex-col gap-4 rounded-xl p-6 md:col-span-7">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <span className="text-xl text-yellow-500">🧠</span>
                <h3 className="text-lg font-semibold text-foreground">Model Selection</h3>
              </div>
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Filter models..."
                className="w-48 rounded-full border border-border bg-background px-4 py-1.5 text-xs outline-none transition-colors focus:border-primary"
              />
            </div>

            {!getKey() ? (
              <p className="text-sm text-muted-foreground">Validate an API key to load models.</p>
            ) : (
              <>
                <div className="flex flex-wrap items-center gap-2">
                  {(["free", "popular", "all"] as FilterTab[]).map((t) => (
                    <button
                      key={t}
                      onClick={() => setTab(t)}
                      className={`rounded-md border px-3 py-1 text-xs font-bold uppercase tracking-wide transition-colors ${
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

                <div className="flex max-h-[320px] flex-col gap-2 overflow-y-auto pr-1">
                  {filtered.map((m) => {
                    const promptPrice = parseFloat(m.pricing?.prompt ?? "0") * 1_000_000;
                    const compPrice = parseFloat(m.pricing?.completion ?? "0") * 1_000_000;
                    const ctx = m.context_length ?? m.top_provider?.context_length ?? 0;
                    const active = selected === m.id;
                    return (
                      <button
                        key={m.id}
                        onClick={() => handleSelectModel(m.id)}
                        className={`flex w-full items-center justify-between rounded-xl border p-3 text-left transition-all ${
                          active
                            ? "border-primary/30 bg-primary/5 ring-1 ring-primary/50"
                            : "border-border bg-background hover:bg-surface-2"
                        }`}
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <div className={`flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg border ${
                            active ? "border-primary bg-primary/20" : "border-border bg-surface-2"
                          }`}>
                            <span className={`text-sm ${active ? "text-primary" : "text-muted-foreground"}`}>
                              {active ? "⭐" : "🔮"}
                            </span>
                          </div>
                          <div className="min-w-0">
                            <div className="truncate text-sm font-bold text-foreground">{m.name || m.id}</div>
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
                    <div className="py-4 text-center text-xs text-muted-foreground">No models match</div>
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
