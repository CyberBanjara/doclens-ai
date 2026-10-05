import { useState, useEffect } from "react";
import { Bot, RefreshCw, Cpu, Check, CheckCircle2, Globe, AlertCircle, ShieldCheck } from "lucide-react";
import {
  DEFAULT_OLLAMA_ENDPOINT,
  getOllamaEndpoint,
  setOllamaEndpoint,
  getOllamaSelectedModel,
  setOllamaSelectedModel,
} from "@/lib/ollama";
import { toast } from "sonner";
import type { ORModel } from "@/lib/openrouter";

interface OllamaStatusSectionProps {
  status: "connected" | "disconnected" | "checking";
  modelCount: number;
  error?: string;
  onRefresh: (endpoint?: string) => void;
  selectedModel: string;
  onSelectModel: (modelId: string) => void;
  models?: ORModel[];
  endpoint: string;
  onEndpointChange: (endpoint: string) => void;
}

export function OllamaStatusSection({
  status,
  modelCount,
  error,
  onRefresh,
  selectedModel,
  onSelectModel,
  models = [],
  endpoint,
  onEndpointChange,
}: OllamaStatusSectionProps) {
  const [inputEndpoint, setInputEndpoint] = useState(endpoint || DEFAULT_OLLAMA_ENDPOINT);
  const [inputModel, setInputModel] = useState(selectedModel || "");
  const [isSaved, setIsSaved] = useState(false);
  const [isEndpointSaved, setIsEndpointSaved] = useState(false);

  useEffect(() => {
    if (endpoint) {
      setInputEndpoint(endpoint);
    }
  }, [endpoint]);

  useEffect(() => {
    if (selectedModel) {
      setInputModel(selectedModel);
    } else if (models.length > 0 && !inputModel) {
      setInputModel(models[0].id);
    }
  }, [selectedModel, models, inputModel]);

  const handleSaveEndpoint = () => {
    const trimmed = inputEndpoint.trim() || DEFAULT_OLLAMA_ENDPOINT;
    setOllamaEndpoint(trimmed);
    onEndpointChange(trimmed);
    setIsEndpointSaved(true);
    toast.success(`Ollama endpoint saved to "${trimmed}". Testing connection...`);
    onRefresh(trimmed);
    setTimeout(() => setIsEndpointSaved(false), 2000);
  };

  const handleSaveModel = () => {
    const trimmed = inputModel.trim();
    if (!trimmed) {
      toast.error("Please enter or select a model name.");
      return;
    }
    onSelectModel(trimmed);
    setOllamaSelectedModel(trimmed);
    setIsSaved(true);
    toast.success(`Ollama model updated to "${trimmed}".`);
    setTimeout(() => setIsSaved(false), 2000);
  };

  return (
    <section className="glass-panel flex flex-col gap-4 rounded-[18px] p-4 md:p-6 border border-border/80 bg-surface/50 backdrop-blur-md">
      {/* Header */}
      <div className="flex items-center gap-2.5">
        <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/10 text-primary">
          <Bot className="h-5 w-5" />
        </div>
        <div>
          <h3 className="text-base font-semibold text-foreground">Ollama (Local AI)</h3>
          <p className="text-xs text-muted-foreground">
            Direct browser connection to your local Ollama server or LAN IP
          </p>
        </div>
      </div>

      {/* Editable Endpoint */}
      <div className="flex flex-col gap-1.5 rounded-xl border border-border/60 bg-background/50 p-3.5">
        <div className="flex items-center justify-between">
          <label className="text-xs font-semibold text-foreground flex items-center gap-1.5">
            <Globe className="h-3.5 w-3.5 text-primary" />
            <span>Local IP / Ollama Endpoint</span>
          </label>
          {inputEndpoint !== DEFAULT_OLLAMA_ENDPOINT && (
            <button
              type="button"
              onClick={() => {
                setInputEndpoint(DEFAULT_OLLAMA_ENDPOINT);
                setOllamaEndpoint(DEFAULT_OLLAMA_ENDPOINT);
                onEndpointChange(DEFAULT_OLLAMA_ENDPOINT);
                onRefresh(DEFAULT_OLLAMA_ENDPOINT);
                toast.info("Reset endpoint to default");
              }}
              className="text-[10px] text-muted-foreground hover:text-primary transition-colors cursor-pointer"
            >
              Reset to default
            </button>
          )}
        </div>

        <div className="flex items-center gap-2">
          <input
            type="text"
            value={inputEndpoint}
            onChange={(e) => setInputEndpoint(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleSaveEndpoint();
            }}
            placeholder="http://localhost:11434 or http://192.168.x.x:11434"
            className="w-full rounded-lg border border-border bg-background px-3 py-2 text-xs font-mono text-foreground placeholder:text-muted-foreground/60 outline-none transition-colors focus:border-primary focus:ring-1 focus:ring-primary"
          />
          <button
            type="button"
            onClick={handleSaveEndpoint}
            className="shrink-0 inline-flex items-center gap-1.5 rounded-lg bg-primary/10 border border-primary/20 px-3 py-2 text-xs font-semibold text-primary shadow-xs transition-all hover:bg-primary/20 active:scale-95 cursor-pointer"
          >
            {isEndpointSaved ? <Check className="h-3.5 w-3.5" /> : null}
            <span>{isEndpointSaved ? "Saved!" : "Set & Test"}</span>
          </button>
        </div>
        <p className="text-[10px] text-muted-foreground">
          Default: <span className="font-mono text-foreground/80">{DEFAULT_OLLAMA_ENDPOINT}</span>. Enter your local IP (e.g. <span className="font-mono">http://localhost:11434</span> or <span className="font-mono">http://192.168.1.50:11434</span>) and click <strong>Set &amp; Test</strong>.
        </p>
      </div>

      {/* Browser Permission Tip */}
      <div className="flex items-start gap-2.5 rounded-xl border border-primary/20 bg-primary/5 p-3 text-xs text-foreground/90 leading-relaxed">
        <ShieldCheck className="h-4 w-4 text-primary shrink-0 mt-0.5" />
        <div className="space-y-1">
          <p className="font-medium text-foreground">
            Browser Permission Notice
          </p>
          <p className="text-[11px] text-muted-foreground">
            When saving your local IP or testing the connection, your browser may prompt: <em>&ldquo;www.anuwad.com is asking you to Access other apps and services on this device&rdquo;</em>. Click <strong>Allow</strong> to let Anuwad communicate directly with your local Ollama instance.
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
                ? "Connecting to Ollama..."
                : status === "connected"
                  ? "Ollama Connected"
                  : "Ollama Offline / Unreachable"}
            </span>
          </div>

          <button
            type="button"
            onClick={() => onRefresh(inputEndpoint)}
            disabled={status === "checking"}
            className="inline-flex items-center gap-1.5 text-xs font-medium text-primary hover:underline disabled:opacity-50 cursor-pointer"
          >
            <RefreshCw className={`h-3 w-3 ${status === "checking" ? "animate-spin" : ""}`} />
            <span>Test Connection</span>
          </button>
        </div>

        <p className="text-xs text-muted-foreground leading-relaxed">
          {status === "connected"
            ? `${modelCount} Ollama model${modelCount === 1 ? "" : "s"} found and ready.`
            : error || "Make sure Ollama is running and click 'Allow' if your browser prompts for local network access."}
        </p>
      </div>

      {/* Model Selection Dropdown */}
      <div className="flex flex-col gap-2.5 rounded-xl border border-border/60 bg-background/50 p-3.5">
        <label className="text-xs font-semibold text-foreground flex items-center gap-1.5">
          <Cpu className="h-3.5 w-3.5 text-primary" />
          <span>Active Ollama Model</span>
        </label>

        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          {models.length > 0 ? (
            <select
              value={inputModel}
              onChange={(e) => {
                const val = e.target.value;
                setInputModel(val);
                onSelectModel(val);
                setOllamaSelectedModel(val);
                toast.success(`Selected "${val}"`);
              }}
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-xs font-medium text-foreground outline-none transition-colors focus:border-primary focus:ring-1 focus:ring-primary cursor-pointer"
            >
              {models.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name || m.id} {m.description ? `(${m.description})` : ""}
                </option>
              ))}
            </select>
          ) : (
            <div className="relative w-full">
              <input
                type="text"
                value={inputModel}
                onChange={(e) => setInputModel(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleSaveModel();
                }}
                placeholder="e.g. llama3.2, mistral, qwen2.5..."
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-xs font-mono text-foreground placeholder:text-muted-foreground/60 outline-none transition-colors focus:border-primary focus:ring-1 focus:ring-primary"
              />
            </div>
          )}

          <button
            type="button"
            onClick={handleSaveModel}
            className="shrink-0 inline-flex items-center justify-center gap-1.5 rounded-lg bg-primary px-3 py-2 text-xs font-semibold text-primary-foreground shadow-xs transition-all hover:bg-primary/90 active:scale-95 cursor-pointer"
          >
            {isSaved ? <Check className="h-3.5 w-3.5" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
            <span>{isSaved ? "Saved!" : "Save Model"}</span>
          </button>
        </div>

        {models.length === 0 && status === "connected" && (
          <div className="flex items-center gap-1.5 text-[11px] text-amber-500">
            <AlertCircle className="h-3.5 w-3.5 shrink-0" />
            <span>No models found on Ollama yet. Pull one via terminal (e.g. `ollama pull llama3.2`).</span>
          </div>
        )}
      </div>
    </section>
  );
}
