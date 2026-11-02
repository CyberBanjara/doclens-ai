import { useState, useEffect } from "react";
import { Server, Globe, CheckCircle2, AlertCircle, Loader2, Trash2, Check, FileText, Download, Sparkles } from "lucide-react";
import {
  getOmniRouterBaseUrl,
  setOmniRouterBaseUrl,
} from "@/lib/omnirouter";
import { toast } from "sonner";

interface OmniRouterStatusSectionProps {
  status: "connected" | "disconnected" | "checking";
  modelCount?: number;
  error?: string;
  onRefresh: (baseUrl?: string, apiKey?: string) => Promise<void> | void;
  isActive: boolean;
  onToggle: () => void;
  selectedModel?: string;
  onSelectModel?: (modelId: string) => void;
  models?: any[];
  endpoint?: string;
  onEndpointChange?: (url: string) => void;
  onOpenModelSelector?: () => void;
}

export function OmniRouterStatusSection({
  status,
  error,
  onRefresh,
  isActive,
  onToggle,
  endpoint,
  onEndpointChange,
  selectedModel,
  onOpenModelSelector,
}: OmniRouterStatusSectionProps) {
  const [inputUrl, setInputUrl] = useState(() => endpoint || getOmniRouterBaseUrl() || "");
  const [isSaved, setIsSaved] = useState(false);
  const [isRemoving, setIsRemoving] = useState(false);

  const isConfigured = Boolean(inputUrl.trim());

  useEffect(() => {
    if (endpoint !== undefined) {
      setInputUrl(endpoint);
    }
  }, [endpoint]);

  const handleSave = async () => {
    const trimmed = inputUrl.trim();
    if (!trimmed) {
      toast.error("Please enter an OmniRouter endpoint URL.");
      return;
    }

    setOmniRouterBaseUrl(trimmed);
    onEndpointChange?.(trimmed);

    setIsSaved(true);
    toast.success("OmniRouter endpoint saved. Verifying connection...");
    await onRefresh(trimmed);
    setTimeout(() => setIsSaved(false), 2000);
  };

  const handleRemove = () => {
    setOmniRouterBaseUrl("");
    setInputUrl("");
    onEndpointChange?.("");
    if (isActive) {
      onToggle();
    }
    setIsRemoving(true);
    toast.info("OmniRouter endpoint removed. Switched to Managed AI (Default).");
    setTimeout(() => setIsRemoving(false), 1500);
  };

  return (
    <section
      className={`glass-panel flex flex-col justify-between gap-5 rounded-[18px] p-5 md:p-6 border transition-all duration-200 ${
        isActive
          ? "border-emerald-500/50 bg-emerald-500/[0.04] shadow-sm ring-1 ring-emerald-500/20"
          : "border-border/80 bg-surface/50 shadow-xs"
      }`}
    >
      {/* Header */}
      <div>
        <div className="flex items-center justify-between gap-3 mb-2">
          <div className="flex items-center gap-2.5">
            <div
              className={`flex h-9 w-9 items-center justify-center rounded-xl shrink-0 transition-colors ${
                isActive ? "bg-emerald-500/20 text-emerald-600 dark:text-emerald-400" : "bg-primary/10 text-primary"
              }`}
            >
              <Server className="h-5 w-5" />
            </div>
            <div>
              <h3 className="text-base font-semibold text-foreground">OmniRouter</h3>
              <p className="text-xs text-muted-foreground">Self-Hosted / Custom Gateway</p>
            </div>
          </div>

          {/* Toggle Switch */}
          <div className="flex items-center gap-2">
            <span
              className={`text-[11px] font-bold uppercase tracking-wider transition-colors ${
                isActive ? "text-emerald-600 dark:text-emerald-400" : "text-muted-foreground"
              }`}
            >
              {isActive ? "ON" : "OFF"}
            </span>
            <button
              type="button"
              role="switch"
              aria-checked={isActive}
              id="toggle-omnirouter-switch"
              onClick={onToggle}
              disabled={!isConfigured || status !== "connected"}
              title={
                !isConfigured || status !== "connected"
                  ? "Connect to a working endpoint first"
                  : isActive
                    ? "Turn OFF to revert to Managed AI"
                    : "Turn ON to use OmniRouter"
              }
              className={`relative inline-flex h-6.5 w-12 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus-visible:ring-2 focus-visible:ring-primary ${
                isActive
                  ? "bg-emerald-500 shadow-[0_0_10px_rgba(16,185,129,0.4)]"
                  : "bg-surface-3 border-border hover:bg-surface-4"
              } ${!isConfigured || status !== "connected" ? "opacity-40 cursor-not-allowed" : ""}`}
            >
              <span className="sr-only">Toggle OmniRouter ON/OFF</span>
              <span
                className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-md ring-0 transition duration-200 ease-in-out ${
                  isActive ? "translate-x-5.5" : "translate-x-0"
                }`}
              />
            </button>
          </div>
        </div>

        <p className="text-xs text-muted-foreground leading-relaxed">
          Route requests through your private or local OmniRouter instance. Direct connection without consuming Anuvaad quota.
        </p>

        {/* How to set up hyperlink */}
        <div className="mt-2.5 flex items-center">
          <a
            href="/omnirouter-setup-guide.pdf"
            download="omnirouter-setup-guide.pdf"
            id="omnirouter-setup-guide-link"
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-primary hover:text-primary/80 transition-colors group cursor-pointer"
          >
            <FileText className="h-3.5 w-3.5 text-primary group-hover:scale-110 transition-transform" />
            <span>How to set up?</span>
            <Download className="h-3 w-3 text-muted-foreground group-hover:text-primary transition-colors" />
          </a>
        </div>
      </div>

      {/* Input Field */}
      <div className="space-y-2">
        <label htmlFor="omnirouter-endpoint-url-input" className="text-xs font-semibold text-foreground">
          Endpoint URL
        </label>

        <div className="relative flex items-center">
          <div className="absolute left-3.5 text-muted-foreground pointer-events-none">
            <Globe className="h-4 w-4" />
          </div>
          <input
            id="omnirouter-endpoint-url-input"
            type="url"
            autoComplete="off"
            spellCheck={false}
            placeholder="http://localhost:20128/v1"
            value={inputUrl}
            onChange={(e) => setInputUrl(e.target.value)}
            className="w-full rounded-xl border border-border bg-background/80 pl-10 pr-3.5 py-2.5 text-xs font-mono text-foreground placeholder:text-muted-foreground/50 outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-colors shadow-2xs"
          />
        </div>

        {/* Dynamic Helper Note */}
        <div className="min-h-5 text-[11px]">
          {status === "connected" ? (
            <span className="flex items-center gap-1.5 text-emerald-600 dark:text-emerald-400 font-medium">
              <CheckCircle2 className="h-3 w-3 shrink-0" />
              <span>Endpoint online &amp; responding. {isActive ? "Provider active." : "Toggle ON to use."}</span>
            </span>
          ) : error && isConfigured ? (
            <span className="flex items-center gap-1.5 text-rose-500 font-medium">
              <AlertCircle className="h-3 w-3 shrink-0" />
              <span className="truncate">{error}</span>
            </span>
          ) : (
            <span className="text-muted-foreground">
              Default: http://localhost:20128/v1. Leave empty to use Managed AI.
            </span>
          )}
        </div>
      </div>

      {/* Selected Model Indicator */}
      {isConfigured && selectedModel && (
        <div className="flex items-center justify-between rounded-xl border border-border/60 bg-surface-2/40 px-3 py-2 text-xs">
          <span className="text-[11px] text-muted-foreground font-medium">Model:</span>
          <button
            type="button"
            onClick={onOpenModelSelector}
            title="Click to change model"
            className="font-mono text-xs font-semibold text-primary hover:underline flex items-center gap-1 cursor-pointer truncate max-w-[220px]"
          >
            <span className="truncate">{selectedModel}</span>
          </button>
        </div>
      )}

      {/* Action Buttons */}
      <div className="flex items-center gap-2 pt-1">
        {/* Toggle ON/OFF Button */}
        <button
          type="button"
          id="toggle-omnirouter-btn"
          onClick={onToggle}
          disabled={!isConfigured || status !== "connected"}
          title={
            !isConfigured || status !== "connected"
              ? "Connect to a working endpoint first"
              : isActive
                ? "Click to turn OFF (use Managed AI)"
                : "Click to turn ON"
          }
          className={`rounded-xl px-4 py-2.5 text-xs font-bold transition-all shadow-xs flex items-center justify-center gap-2 cursor-pointer active:scale-98 shrink-0 ${
            isActive
              ? "bg-emerald-600 hover:bg-emerald-500 text-white shadow-emerald-600/20"
              : "bg-surface-2 hover:bg-surface-3 text-muted-foreground border border-border"
          } ${!isConfigured || status !== "connected" ? "opacity-40 cursor-not-allowed" : ""}`}
        >
          <span className={`h-2 w-2 rounded-full ${isActive ? "bg-white animate-pulse" : "bg-muted-foreground/40"}`} />
          <span>{isActive ? "Turn OFF" : "Turn ON"}</span>
        </button>

        {/* Change Model Button */}
        {isConfigured && status === "connected" && onOpenModelSelector && (
          <button
            type="button"
            id="change-omnirouter-model-btn"
            onClick={onOpenModelSelector}
            title="Browse and select OmniRouter models"
            className="rounded-xl bg-surface-2 hover:bg-surface-3 border border-border text-foreground px-3 py-2.5 text-xs font-semibold transition-all shadow-xs flex items-center justify-center gap-1.5 cursor-pointer shrink-0"
          >
            <Sparkles className="h-3.5 w-3.5 text-primary" />
            <span className="hidden sm:inline">Change Model</span>
          </button>
        )}

        {/* Save Button */}
        <button
          type="button"
          id="save-omnirouter-endpoint-btn"
          onClick={handleSave}
          disabled={status === "checking" || !inputUrl.trim()}
          className="flex-1 rounded-xl bg-surface-2 hover:bg-surface-3 border border-border text-foreground py-2.5 px-3 text-xs font-semibold transition-all active:scale-98 disabled:opacity-50 disabled:cursor-not-allowed shadow-xs flex items-center justify-center gap-2 cursor-pointer"
        >
          {status === "checking" ? (
            <>
              <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" />
              <span>Testing...</span>
            </>
          ) : isSaved ? (
            <>
              <Check className="h-3.5 w-3.5 text-emerald-500" />
              <span>Saved!</span>
            </>
          ) : (
            <span>Save Endpoint</span>
          )}
        </button>

        {/* Remove Button */}
        {Boolean(inputUrl.trim()) && (
          <button
            type="button"
            id="remove-omnirouter-endpoint-btn"
            onClick={handleRemove}
            disabled={isRemoving}
            title="Remove OmniRouter endpoint and revert to Managed AI"
            className="rounded-xl border border-border bg-surface-2 hover:bg-destructive/10 hover:border-destructive/30 hover:text-destructive py-2.5 px-3 text-xs font-semibold text-muted-foreground transition-colors cursor-pointer flex items-center justify-center gap-1.5"
          >
            <Trash2 className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Remove</span>
          </button>
        )}
      </div>
    </section>
  );
}
