import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { AppHeader } from "@/components/AppHeader";
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
  type GlobalMode,
  type ORModel,
} from "@/lib/openrouter";

export const Route = createFileRoute("/settings")({
  component: SettingsPage,
  head: () => ({
    meta: [{ title: "DocLens — Settings" }],
  }),
});

const LANGS = ["English", "Arabic", "French", "Hindi", "Spanish", "Japanese"];
const STYLES = ["Neutral", "Formal", "Casual", "Academic", "Concise", "Detailed", "Friendly"];

type FilterTab = "all" | "free" | "fast" | "popular";

function SettingsPage() {
  const [keyInput, setKeyInput] = useState("");
  const [keyStatus, setKeyStatus] = useState<"unknown" | "valid" | "invalid" | "checking">("unknown");
  const [models, setModels] = useState<ORModel[]>([]);
  const [loadingModels, setLoadingModels] = useState(false);
  const [modelError, setModelError] = useState("");
  const [selected, setSelected] = useState("");
  const [language, setLanguage] = useState("English");
  const [customLang, setCustomLang] = useState("");
  const [search, setSearch] = useState("");
  const [tab, setTab] = useState<FilterTab>("all");
  const [mode, setModeState] = useState<GlobalMode>("summarize");
  const [style, setStyleState] = useState("Neutral");
  const [temperature, setTemp] = useState(0.3);
  const [memory, setMemoryState] = useState(true);
  const [sequential, setSequentialState] = useState(true);

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
    let list = models;
    if (q) list = list.filter((m) => m.id.toLowerCase().includes(q) || m.name?.toLowerCase().includes(q));
    if (tab === "free") {
      list = list.filter(
        (m) => parseFloat(m.pricing?.prompt ?? "0") === 0 && parseFloat(m.pricing?.completion ?? "0") === 0,
      );
    } else if (tab === "fast") {
      list = list.filter((m) => /flash|mini|nano|haiku|small|turbo|fast|8b|7b/i.test(m.id + " " + (m.name ?? "")));
    } else if (tab === "popular") {
      list = list.filter((m) =>
        /gpt-4o|gpt-5|claude-3|claude-3\.5|claude-sonnet|gemini-1\.5|gemini-2|llama-3|deepseek|mistral-large/i.test(
          m.id,
        ),
      );
    }
    return list.slice(0, 200);
  }, [models, search, tab]);

  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground">
      <AppHeader />
      <main className="mx-auto w-full max-w-5xl flex-1 px-5 py-8">
        <div className="mb-6 flex items-baseline justify-between">
          <div>
            <h2 className="font-mono text-[11px] uppercase tracking-[0.25em] text-muted-foreground">
              configuration
            </h2>
            <p className="mt-1 text-2xl font-semibold tracking-tight">Settings</p>
          </div>
          <Link
            to="/"
            className="rounded-md border border-border bg-background px-3 py-1.5 font-mono text-[11px] uppercase tracking-widest text-muted-foreground hover:text-foreground"
          >
            back
          </Link>
        </div>

        {/* Output Language */}
        <section className="mb-8 rounded-lg border border-border bg-surface p-5">
          <h3 className="font-mono text-[11px] uppercase tracking-[0.2em] text-muted-foreground">
            output language
          </h3>
          <p className="mt-1 text-sm text-foreground/80">
            Injected into every AI request — the assistant will always respond in this language.
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            {LANGS.map((l) => (
              <button
                key={l}
                onClick={() => handleLangSelect(l)}
                className={`rounded-md border px-3 py-1.5 font-mono text-[11px] uppercase tracking-widest transition-colors ${
                  language === l
                    ? "border-primary bg-primary/15 text-primary"
                    : "border-border bg-background text-muted-foreground hover:text-foreground"
                }`}
              >
                {l}
              </button>
            ))}
          </div>
          <div className="mt-3 flex items-center gap-2">
            <input
              value={customLang}
              onChange={(e) => setCustomLang(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleCustomLang()}
              placeholder="Or type any language…"
              className="flex-1 rounded-md border border-border bg-background px-3 py-1.5 font-mono text-[12px] outline-none focus:border-primary"
            />
            <button
              onClick={handleCustomLang}
              className="rounded-md border border-border bg-background px-3 py-1.5 font-mono text-[11px] uppercase tracking-widest text-muted-foreground hover:text-foreground"
            >
              set
            </button>
          </div>
          <div className="mt-3 font-mono text-[11px] text-muted-foreground">
            current: <span className="text-primary">{language}</span>
          </div>
        </section>

        {/* Pipeline defaults */}
        <section className="mb-8 rounded-lg border border-border bg-surface p-5">
          <h3 className="font-mono text-[11px] uppercase tracking-[0.2em] text-muted-foreground">
            pipeline defaults
          </h3>
          <p className="mt-1 text-sm text-foreground/80">
            Applied to every page unless overridden inline. Per-page overrides always win.
          </p>

          <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
            <label className="block">
              <span className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">mode</span>
              <select
                value={mode}
                onChange={(e) => {
                  const v = e.target.value as GlobalMode;
                  setModeState(v);
                  saveMode(v);
                }}
                className="mt-1 w-full rounded-md border border-border bg-background px-3 py-1.5 font-mono text-[12px] outline-none focus:border-primary"
              >
                {Object.entries(MODE_INSTRUCTIONS).map(([k, v]) => (
                  <option key={k} value={k}>{v.label}</option>
                ))}
              </select>
            </label>

            <label className="block">
              <span className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">style / tone</span>
              <select
                value={STYLES.includes(style) ? style : "__custom"}
                onChange={(e) => {
                  const v = e.target.value;
                  if (v === "__custom") return;
                  setStyleState(v);
                  saveStyle(v);
                }}
                className="mt-1 w-full rounded-md border border-border bg-background px-3 py-1.5 font-mono text-[12px] outline-none focus:border-primary"
              >
                {STYLES.map((s) => <option key={s} value={s}>{s}</option>)}
                {!STYLES.includes(style) && <option value="__custom">{style}</option>}
              </select>
            </label>

            <label className="block sm:col-span-2">
              <span className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                temperature · <span className="text-primary">{temperature.toFixed(2)}</span>
              </span>
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
                className="mt-2 w-full accent-primary"
              />
              <div className="mt-1 flex justify-between font-mono text-[10px] text-muted-foreground">
                <span>0 · deterministic</span><span>0.7</span><span>1.5 · creative</span>
              </div>
            </label>

            <label className="flex items-center justify-between rounded-md border border-border bg-background px-3 py-2.5">
              <span>
                <span className="block font-mono text-[10px] uppercase tracking-widest text-muted-foreground">memory</span>
                <span className="text-sm text-foreground/80">Pass trailing excerpt of previous page into next request</span>
              </span>
              <input
                type="checkbox"
                checked={memory}
                onChange={(e) => { setMemoryState(e.target.checked); setMemory(e.target.checked); }}
                className="h-4 w-4 accent-primary"
              />
            </label>

            <label className="flex items-center justify-between rounded-md border border-border bg-background px-3 py-2.5">
              <span>
                <span className="block font-mono text-[10px] uppercase tracking-widest text-muted-foreground">sequential execution</span>
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

        {/* OpenRouter API key */}
        <section className="mb-8 rounded-lg border border-border bg-surface p-5">
          <h3 className="font-mono text-[11px] uppercase tracking-[0.2em] text-muted-foreground">
            openrouter api key
          </h3>
          <p className="mt-1 text-sm text-foreground/80">
            Stored locally in your browser. Required for AI execution.{" "}
            <a
              href="https://openrouter.ai/keys"
              target="_blank"
              rel="noreferrer"
              className="text-primary underline-offset-4 hover:underline"
            >
              Get a key →
            </a>
          </p>
          <div className="mt-4 flex items-center gap-2">
            <input
              value={keyInput}
              onChange={(e) => {
                setKeyInput(e.target.value);
                setKeyStatus("unknown");
              }}
              type="password"
              placeholder="sk-or-…"
              className="flex-1 rounded-md border border-border bg-background px-3 py-1.5 font-mono text-[12px] outline-none focus:border-primary"
            />
            <button
              onClick={handleValidate}
              disabled={!keyInput.trim() || keyStatus === "checking"}
              className="rounded-md bg-primary px-3 py-1.5 font-mono text-[11px] uppercase tracking-widest text-primary-foreground disabled:opacity-40"
            >
              {keyStatus === "checking" ? "validating…" : "validate & save"}
            </button>
          </div>
          <div className="mt-3 font-mono text-[11px]">
            {keyStatus === "valid" && <span className="text-primary">✓ key validated and saved</span>}
            {keyStatus === "invalid" && <span className="text-destructive">✗ invalid key</span>}
            {keyStatus === "unknown" && <span className="text-muted-foreground">not validated</span>}
          </div>
        </section>

        {/* Model picker */}
        <section className="rounded-lg border border-border bg-surface p-5">
          <div className="flex items-center justify-between">
            <h3 className="font-mono text-[11px] uppercase tracking-[0.2em] text-muted-foreground">
              model selection
            </h3>
            <span className="font-mono text-[11px] text-muted-foreground">
              {models.length ? `${models.length} models available` : "—"}
            </span>
          </div>
          {!getKey() ? (
            <p className="mt-3 text-sm text-muted-foreground">Validate an API key to load models.</p>
          ) : (
            <>
              <div className="mt-4 flex flex-wrap items-center gap-2">
                {(["all", "free", "fast", "popular"] as FilterTab[]).map((t) => (
                  <button
                    key={t}
                    onClick={() => setTab(t)}
                    className={`rounded-md border px-3 py-1 font-mono text-[11px] uppercase tracking-widest ${
                      tab === t
                        ? "border-primary bg-primary/15 text-primary"
                        : "border-border bg-background text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    {t}
                  </button>
                ))}
                <input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="search models…"
                  className="ml-auto w-64 rounded-md border border-border bg-background px-3 py-1 font-mono text-[12px] outline-none focus:border-primary"
                />
              </div>

              {loadingModels && (
                <div className="mt-4 font-mono text-[11px] text-muted-foreground">loading models…</div>
              )}
              {modelError && <div className="mt-4 font-mono text-[11px] text-destructive">{modelError}</div>}

              <ul className="mt-4 grid max-h-[480px] grid-cols-1 gap-2 overflow-auto pr-1 sm:grid-cols-2">
                {filtered.map((m) => {
                  const promptPrice = parseFloat(m.pricing?.prompt ?? "0") * 1_000_000;
                  const compPrice = parseFloat(m.pricing?.completion ?? "0") * 1_000_000;
                  const ctx = m.context_length ?? m.top_provider?.context_length ?? 0;
                  const active = selected === m.id;
                  return (
                    <li key={m.id}>
                      <button
                        onClick={() => handleSelectModel(m.id)}
                        className={`flex w-full flex-col items-start gap-1 rounded-md border px-3 py-2.5 text-left transition-colors ${
                          active
                            ? "border-primary bg-primary/10"
                            : "border-border bg-background hover:border-border-strong"
                        }`}
                      >
                        <div className="flex w-full items-center justify-between">
                          <span className="truncate text-sm font-medium text-foreground">{m.name || m.id}</span>
                          {active && (
                            <span className="ml-2 rounded bg-primary/20 px-1.5 py-0.5 font-mono text-[10px] uppercase text-primary">
                              selected
                            </span>
                          )}
                        </div>
                        <span className="truncate font-mono text-[10px] text-muted-foreground">{m.id}</span>
                        <div className="mt-1 flex w-full items-center justify-between font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                          <span>
                            ctx <span className="text-foreground">{ctx ? ctx.toLocaleString() : "—"}</span>
                          </span>
                          <span>
                            ${promptPrice.toFixed(2)}/${compPrice.toFixed(2)} per M
                          </span>
                        </div>
                      </button>
                    </li>
                  );
                })}
              </ul>
              {!loadingModels && filtered.length === 0 && (
                <div className="mt-4 font-mono text-[11px] text-muted-foreground">no models match</div>
              )}
            </>
          )}
        </section>
      </main>
    </div>
  );
}
