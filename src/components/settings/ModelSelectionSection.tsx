import { Brain, Cpu, Star, Loader2 } from "lucide-react";
import type { ORModel } from "@/lib/openrouter";

type FilterTab = "free" | "popular" | "all";
type KeyStatus = "unknown" | "missing" | "valid" | "invalid" | "checking";

interface ModelSelectionSectionProps {
  search: string;
  onSearchChange: (value: string) => void;
  keyStatus: KeyStatus;
  tab: FilterTab;
  onTabChange: (tab: FilterTab) => void;
  loadingModels: boolean;
  modelError: string;
  filtered: ORModel[];
  selected: string;
  onSelectModel: (id: string) => void;
}

export function ModelSelectionSection({
  search,
  onSearchChange,
  keyStatus,
  tab,
  onTabChange,
  loadingModels,
  modelError,
  filtered,
  selected,
  onSelectModel,
}: ModelSelectionSectionProps) {
  return (
    <section className="glass-panel flex flex-col gap-4 rounded-[18px] p-4 md:p-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <Brain className="h-5 w-5 text-yellow-500" />
          <h3 className="text-lg font-semibold text-foreground">Model Selection</h3>
        </div>
        <input
          value={search}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder="Filter models..."
          className="w-full rounded-full border border-border bg-background px-4 py-1.5 text-xs outline-none transition-colors focus:border-primary sm:w-48"
        />
      </div>

      {keyStatus === "missing" || keyStatus === "invalid" ? (
        <p className="text-sm text-muted-foreground">
          {keyStatus === "invalid"
            ? "Invalid OpenRouter API key. Please check your key in API Key Management."
            : "Configure OPENROUTER_API_KEY to load models."}
        </p>
      ) : keyStatus === "checking" && filtered.length === 0 ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground py-4">
          <Loader2 className="h-4 w-4 animate-spin text-primary" />
          <span>Verifying OpenRouter connection & loading models...</span>
        </div>
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-2">
            {(["free", "popular", "all"] as FilterTab[]).map((t) => (
              <button
                key={t}
                onClick={() => onTabChange(t)}
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

          {loadingModels && <div className="text-xs text-muted-foreground">Loading models…</div>}
          {modelError && <div className="text-xs text-destructive">{modelError}</div>}

          <div className="flex flex-col gap-2 md:max-h-[320px] md:overflow-y-auto md:pr-1">
            {filtered.map((m) => {
              const promptPrice = parseFloat(m.pricing?.prompt ?? "0") * 1_000_000;
              const ctx = m.context_length ?? m.top_provider?.context_length ?? 0;
              const active = selected === m.id;
              return (
                <button
                  key={m.id}
                  onClick={() => onSelectModel(m.id)}
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
              <div className="py-4 text-center text-xs text-muted-foreground">No models match</div>
            )}
          </div>
        </>
      )}
    </section>
  );
}
