import { useState, useEffect } from "react";
import {
  Server,
  RefreshCw,
  Cpu,
  RotateCcw,
  Check,
  Sparkles,
  ShieldCheck,
  CheckCircle2,
} from "lucide-react";
import { getOmniRouterBaseUrl, getOmniDefaultModelSync } from "@/lib/omnirouter";
import { toast } from "sonner";
import type { ORModel } from "@/lib/openrouter";

interface OmniRouterStatusSectionProps {
  status: "connected" | "disconnected" | "checking";
  modelCount: number;
  error?: string;
  onRefresh: () => void;
  selectedModel: string;
  onSelectModel: (modelId: string) => void;
  models?: ORModel[];
}

export function OmniRouterStatusSection({
  status,
  modelCount,
  error,
  onRefresh,
  selectedModel,
  onSelectModel,
  models = [],
}: OmniRouterStatusSectionProps) {
  const baseUrl = getOmniRouterBaseUrl();
  const envDefaultModel = getOmniDefaultModelSync() || "auto/best-coding";

  const [inputModel, setInputModel] = useState(selectedModel || envDefaultModel);
  const [isSaved, setIsSaved] = useState(false);

  useEffect(() => {
    if (selectedModel) {
      setInputModel(selectedModel);
    }
  }, [selectedModel]);

  const handleSave = () => {
    const trimmed = inputModel.trim();
    if (!trimmed) {
      toast.error("Please enter a valid model ID.");
      return;
    }
    onSelectModel(trimmed);
    setIsSaved(true);
    toast.success(`OmniRouter default model set to "${trimmed}".`);
    setTimeout(() => setIsSaved(false), 2000);
  };

  const handleResetToEnv = () => {
    setInputModel(envDefaultModel);
    onSelectModel(envDefaultModel);
    toast.info(`Reset to .env default model: "${envDefaultModel}"`);
  };

  // Quick preset suggestions
  const presets = ["auto/best-coding", "auto/best-reasoning"];

  return (
    <section className="glass-panel flex flex-col gap-4 rounded-[18px] p-4 md:col-span-5 md:p-6 border border-border/80 bg-surface/50 backdrop-blur-md">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <Server className="h-5 w-5" />
          </div>
          <div>
            <h3 className="text-lg font-semibold text-foreground">OmniRouter Gateway</h3>
            <p className="text-xs text-muted-foreground">
              Local AI provider &amp; model configuration
            </p>
          </div>
        </div>
      </div>

      {/* Connection Status Card */}
      <div className="relative overflow-hidden rounded-xl border border-primary/20 bg-gradient-to-br from-primary/10 via-primary/5 to-transparent p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 space-y-1.5">
            <div className="flex items-center gap-2">
              <span
                className={`flex h-2.5 w-2.5 rounded-full ${
                  status === "connected"
                    ? "bg-emerald-500 animate-pulse"
                    : status === "checking"
                      ? "bg-amber-500 animate-pulse"
                      : "bg-destructive"
                }`}
              />
              <span className="font-semibold text-xs text-foreground">
                {status === "checking"
                  ? "Checking Connection..."
                  : status === "connected"
                    ? "Gateway Connected & Active"
                    : "Connection Offline"}
              </span>
            </div>
            <p className="text-xs leading-relaxed text-muted-foreground">
              {status === "connected"
                ? `Loaded ${modelCount} models from your OmniRouter gateway (${baseUrl || "http://localhost:20128/v1"}). AI requests and streams connect directly to this gateway.`
                : error ||
                  `Make sure your local OmniRouter server is running at ${baseUrl || "http://localhost:20128/v1"}.`}
            </p>
          </div>
        </div>

        <div className="mt-3 flex items-center justify-between border-t border-border/40 pt-3 text-[11px]">
          <span className="font-mono text-muted-foreground truncate max-w-[240px]">
            {baseUrl || "http://localhost:20128/v1"}
          </span>
          <button
            onClick={onRefresh}
            disabled={status === "checking"}
            className="inline-flex items-center gap-1 font-medium text-primary hover:underline disabled:opacity-50 cursor-pointer"
          >
            <RefreshCw className={`h-3 w-3 ${status === "checking" ? "animate-spin" : ""}`} />
            <span>Test Connection</span>
          </button>
        </div>
      </div>

      {/* ─── Default Model Setting ─── */}
      <div className="flex flex-col gap-2 rounded-xl border border-border/60 bg-background/50 p-3.5">
        <div className="flex items-center justify-between">
          <label className="text-xs font-semibold text-foreground flex items-center gap-1.5">
            <Cpu className="h-3.5 w-3.5 text-primary" />
            <span>Default OmniRouter Model</span>
          </label>
          {envDefaultModel && (
            <span className="text-[10px] text-muted-foreground font-mono">
              Env default: {envDefaultModel}
            </span>
          )}
        </div>

        <div className="relative">
          <input
            type="text"
            list="omnirouter-model-datalist"
            value={inputModel}
            onChange={(e) => setInputModel(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleSave();
            }}
            placeholder="e.g. auto/best-coding or any model ID"
            className="w-full rounded-lg border border-border bg-background px-3 py-2 text-xs font-mono text-foreground placeholder:text-muted-foreground/60 outline-none transition-colors focus:border-primary focus:ring-1 focus:ring-primary"
          />
          {models.length > 0 && (
            <datalist id="omnirouter-model-datalist">
              {models.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name && m.name !== m.id ? `${m.name} (${m.id})` : m.id}
                </option>
              ))}
            </datalist>
          )}
        </div>

        {/* Quick Presets */}
        <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
          <span className="text-[10px] text-muted-foreground">Quick presets:</span>
          {presets.map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => {
                setInputModel(p);
                onSelectModel(p);
                toast.success(`Selected "${p}"`);
              }}
              className={`rounded-md px-2 py-0.5 text-[10px] font-mono transition-colors cursor-pointer ${
                inputModel === p
                  ? "bg-primary/20 text-primary border border-primary/30 font-semibold"
                  : "bg-surface-elevated/70 text-muted-foreground hover:text-foreground border border-border/40"
              }`}
            >
              {p}
            </button>
          ))}
        </div>

        {/* Action Buttons */}
        <div className="mt-1 flex items-center justify-between gap-2 border-t border-border/40 pt-2.5">
          <button
            type="button"
            onClick={handleResetToEnv}
            className="inline-flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
            title="Reset model to OMNIROUTER_DEFAULT_MODEL from .env"
          >
            <RotateCcw className="h-3 w-3" />
            <span>Reset to .env Default</span>
          </button>

          <button
            type="button"
            onClick={handleSave}
            className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground shadow-sm transition-all hover:bg-primary/90 hover:shadow active:scale-95 cursor-pointer"
          >
            {isSaved ? <Check className="h-3.5 w-3.5" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
            <span>{isSaved ? "Saved!" : "Set as Default"}</span>
          </button>
        </div>
      </div>

      {/* Environment Config Info */}
      <div className="rounded-xl border border-border/60 bg-background/50 p-3 space-y-2 text-[11px] text-muted-foreground">
        <div className="font-semibold text-foreground text-xs flex items-center gap-1.5">
          <ShieldCheck className="h-3.5 w-3.5 text-primary" />
          <span>Security & Gateway Info</span>
        </div>
        <ul className="space-y-1 pl-0.5 leading-relaxed list-disc list-inside">
          <li>
            100% Secret Backend Proxy: upstream ngrok URL and API keys are stored only in server
            environment variables (
            <code className="font-mono text-foreground">OMNIROUTER_BASE_URL</code> &amp;{" "}
            <code className="font-mono text-foreground">OMNIROUTER_API_KEY</code>).
          </li>
          <li>
            Default model fallback:{" "}
            <code className="font-mono text-foreground">OMNIROUTER_DEFAULT_MODEL</code> (
            <span className="font-mono text-primary">{envDefaultModel}</span>).
          </li>
          <li>
            Choosing a model here or in the catalog updates your active default model for all
            OmniRouter requests.
          </li>
        </ul>
      </div>
    </section>
  );
}
