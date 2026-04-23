import { useEffect, useState } from "react";
import { settingsKeys, getSetting, setSetting } from "@/lib/storage";
import { fetchModels, isFreeModel, modelContext, type ORModel } from "@/lib/openrouter";

interface Props {
  open: boolean;
  onClose: () => void;
  selectedModel: string;
  onSelectModel: (id: string) => void;
}

type Filter = "all" | "free" | "popular";

const POPULAR = [
  "openai/",
  "anthropic/",
  "google/gemini",
  "meta-llama/",
  "mistralai/",
  "deepseek/",
  "x-ai/grok",
  "qwen/",
];

export function SettingsPanel({ open, onClose, selectedModel, onSelectModel }: Props) {
  const [apiKey, setApiKey] = useState("");
  const [savedKey, setSavedKey] = useState("");
  const [models, setModels] = useState<ORModel[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<Filter>("all");

  useEffect(() => {
    if (!open) return;
    (async () => {
      const k = (await getSetting<string>(settingsKeys.openrouterApiKey)) ?? "";
      setApiKey(k);
      setSavedKey(k);
    })();
  }, [open]);

  useEffect(() => {
    if (!open || models) return;
    setLoading(true);
    fetchModels()
      .then(setModels)
      .catch((e) => setError(e instanceof Error ? e.message : "failed"))
      .finally(() => setLoading(false));
  }, [open, models]);

  const saveKey = async () => {
    await setSetting(settingsKeys.openrouterApiKey, apiKey.trim());
    setSavedKey(apiKey.trim());
  };

  if (!open) return null;

  const filtered = (models ?? [])
    .filter((m) => {
      if (filter === "free") return isFreeModel(m);
      if (filter === "popular") return POPULAR.some((p) => m.id.startsWith(p));
      return true;
    })
    .filter((m) => {
      if (!search) return true;
      const s = search.toLowerCase();
      return m.id.toLowerCase().includes(s) || m.name?.toLowerCase().includes(s);
    })
    .slice(0, 200);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="flex h-[80vh] w-full max-w-3xl flex-col overflow-hidden rounded-lg border border-border bg-surface shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex items-center justify-between border-b border-border bg-surface-2 px-5 py-3">
          <div className="flex items-baseline gap-3">
            <h2 className="text-base font-semibold tracking-tight">Settings</h2>
            <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
              openrouter · model registry
            </span>
          </div>
          <button
            onClick={onClose}
            className="rounded-md border border-border bg-background px-2.5 py-1 font-mono text-[11px] uppercase tracking-widest text-muted-foreground hover:text-foreground"
          >
            close
          </button>
        </header>

        <div className="border-b border-border bg-background/40 px-5 py-4">
          <label className="block font-mono text-[11px] uppercase tracking-widest text-muted-foreground">
            openrouter api key
          </label>
          <div className="mt-2 flex gap-2">
            <input
              type="password"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder="sk-or-v1-…"
              className="flex-1 rounded-md border border-border bg-background px-3 py-2 font-mono text-[12.5px] text-foreground outline-none focus:border-primary"
            />
            <button
              onClick={saveKey}
              disabled={apiKey === savedKey}
              className="rounded-md bg-primary px-3 py-2 font-mono text-[11px] uppercase tracking-widest text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-40"
            >
              {apiKey === savedKey && savedKey ? "saved" : "save"}
            </button>
          </div>
          <p className="mt-2 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
            stored locally in this browser · sent only to openrouter.ai
          </p>
        </div>

        <div className="flex items-center gap-2 border-b border-border bg-surface-2 px-5 py-2.5">
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="search models…"
            className="flex-1 rounded-md border border-border bg-background px-3 py-1.5 font-mono text-[12px] text-foreground outline-none focus:border-primary"
          />
          {(["all", "free", "popular"] as Filter[]).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`rounded-md border px-2.5 py-1.5 font-mono text-[10px] uppercase tracking-widest transition-colors ${
                filter === f
                  ? "border-primary bg-primary/10 text-primary"
                  : "border-border bg-background text-muted-foreground hover:text-foreground"
              }`}
            >
              {f}
            </button>
          ))}
        </div>

        <div className="flex-1 overflow-auto">
          {loading && (
            <div className="p-6 text-center font-mono text-[11px] uppercase tracking-widest text-muted-foreground">
              loading models…
            </div>
          )}
          {error && (
            <div className="p-6 text-center font-mono text-[11px] uppercase tracking-widest text-destructive">
              {error}
            </div>
          )}
          {!loading && !error && (
            <ul className="divide-y divide-border">
              {filtered.map((m) => {
                const active = m.id === selectedModel;
                return (
                  <li key={m.id}>
                    <button
                      onClick={() => onSelectModel(m.id)}
                      className={`flex w-full items-start justify-between gap-4 px-5 py-3 text-left transition-colors ${
                        active ? "bg-primary/10" : "hover:bg-surface-2"
                      }`}
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="truncate font-mono text-[12.5px] text-foreground">
                            {m.id}
                          </span>
                          {isFreeModel(m) && (
                            <span className="rounded bg-primary/15 px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-widest text-primary">
                              free
                            </span>
                          )}
                          {active && (
                            <span className="rounded border border-primary px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-widest text-primary">
                              selected
                            </span>
                          )}
                        </div>
                        {m.name && m.name !== m.id && (
                          <div className="mt-0.5 truncate text-[12px] text-foreground/80">{m.name}</div>
                        )}
                      </div>
                      <div className="shrink-0 text-right font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                        <div>ctx {modelContext(m).toLocaleString()}</div>
                        {m.pricing?.prompt !== undefined && (
                          <div>${parseFloat(m.pricing.prompt).toFixed(4)}/1k in</div>
                        )}
                      </div>
                    </button>
                  </li>
                );
              })}
              {filtered.length === 0 && (
                <li className="p-6 text-center font-mono text-[11px] uppercase tracking-widest text-muted-foreground">
                  no models match
                </li>
              )}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
