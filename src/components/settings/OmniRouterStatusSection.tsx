import { useState, useEffect } from "react";
import {
  Server,
  RefreshCw,
  Cpu,
  Check,
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
      toast.error("Please enter a model name.");
      return;
    }
    onSelectModel(trimmed);
    setIsSaved(true);
    toast.success(`Model updated to "${trimmed}".`);
    setTimeout(() => setIsSaved(false), 2000);
  };

  // Common quick presets
  const presets = [
    { label: "Coding", id: "auto/best-coding" },
    { label: "Reasoning", id: "auto/best-reasoning" },
  ];

  return (
    <section className="glass-panel flex flex-col gap-4 rounded-[18px] p-4 md:p-6 border border-border/80 bg-surface/50 backdrop-blur-md">
      {/* Header */}
      <div className="flex items-center gap-2.5">
        <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/10 text-primary">
          <Server className="h-5 w-5" />
        </div>
        <div>
          <h3 className="text-base font-semibold text-foreground">Local AI Server</h3>
          <p className="text-xs text-muted-foreground">
            Connect and run local or custom AI models
          </p>
        </div>
      </div>

      {/* Connection Status Card */}
      <div className="rounded-xl border border-border/60 bg-background/50 p-3.5 space-y-2.5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span
              className={`h-2.5 w-2.5 rounded-full ${
                status === "connected"
                  ? "bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.8)]"
                  : status === "checking"
                    ? "bg-amber-500 animate-pulse"
                    : "bg-rose-500"
              }`}
            />
            <span className="text-xs font-semibold text-foreground">
              {status === "checking"
                ? "Checking server..."
                : status === "connected"
                  ? "Server Connected"
                  : "Server Offline"}
            </span>
          </div>

          <button
            type="button"
            onClick={onRefresh}
            disabled={status === "checking"}
            className="inline-flex items-center gap-1.5 text-xs font-medium text-primary hover:underline disabled:opacity-50 cursor-pointer"
          >
            <RefreshCw className={`h-3 w-3 ${status === "checking" ? "animate-spin" : ""}`} />
            <span>Check Status</span>
          </button>
        </div>

        <p className="text-xs text-muted-foreground leading-relaxed">
          {status === "connected"
            ? `${modelCount} AI models ready to use.`
            : error || "Make sure your local AI server is switched on and running."}
        </p>
      </div>

      {/* Model Selection */}
      <div className="flex flex-col gap-2.5 rounded-xl border border-border/60 bg-background/50 p-3.5">
        <label className="text-xs font-semibold text-foreground flex items-center gap-1.5">
          <Cpu className="h-3.5 w-3.5 text-primary" />
          <span>Active AI Model</span>
        </label>

        <div className="relative">
          <input
            type="text"
            list="omnirouter-model-datalist"
            value={inputModel}
            onChange={(e) => setInputModel(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleSave();
            }}
            placeholder="Type or select a model name..."
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

        {/* Quick Presets & Save Button */}
        <div className="flex items-center justify-between gap-2 pt-1">
          <div className="flex items-center gap-1.5">
            <span className="text-[10px] text-muted-foreground">Presets:</span>
            {presets.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => {
                  setInputModel(p.id);
                  onSelectModel(p.id);
                  toast.success(`Selected "${p.label}"`);
                }}
                className={`rounded-md px-2 py-0.5 text-[10px] font-medium transition-colors cursor-pointer ${
                  inputModel === p.id
                    ? "bg-primary/20 text-primary border border-primary/30 font-semibold"
                    : "bg-surface-2 text-muted-foreground hover:text-foreground border border-border/40"
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>

          <button
            type="button"
            onClick={handleSave}
            className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground shadow-xs transition-all hover:bg-primary/90 active:scale-95 cursor-pointer"
          >
            {isSaved ? <Check className="h-3.5 w-3.5" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
            <span>{isSaved ? "Saved!" : "Save Model"}</span>
          </button>
        </div>
      </div>
    </section>
  );
}
