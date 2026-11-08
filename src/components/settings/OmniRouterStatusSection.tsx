import { useState, useEffect } from "react";
import {
  Server,
  Globe,
  KeyRound,
  Eye,
  EyeOff,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Trash2,
  Check,
  FileText,
  Download,
  Sparkles,
} from "lucide-react";
import {
  getOmniRouterBaseUrl,
  setOmniRouterBaseUrl,
  getOmniRouterApiKey,
  setOmniRouterApiKey,
  isOmniRouterConfigured,
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
  apiKey?: string;
  onApiKeyChange?: (key: string) => void;
  onOpenModelSelector?: () => void;
}

function isValidHttpUrl(value: string): boolean {
  try {
    const u = new URL(value);
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
}

export function OmniRouterStatusSection({
  status,
  error,
  onRefresh,
  isActive,
  onToggle,
  endpoint,
  onEndpointChange,
  apiKey,
  onApiKeyChange,
  selectedModel,
  onOpenModelSelector,
}: OmniRouterStatusSectionProps) {
  const [inputUrl, setInputUrl] = useState(() => endpoint || getOmniRouterBaseUrl() || "");
  const [inputKey, setInputKey] = useState(() => apiKey ?? getOmniRouterApiKey() ?? "");
  const [showKey, setShowKey] = useState(false);
  const [isSaved, setIsSaved] = useState(false);
  const [isRemoving, setIsRemoving] = useState(false);

  const trimmedUrl = inputUrl.trim();
  const trimmedKey = inputKey.trim();
  const urlInvalid = Boolean(trimmedUrl) && !isValidHttpUrl(trimmedUrl);
  const hasBothInputs = Boolean(trimmedUrl && trimmedKey) && !urlInvalid;
  const isConfigured = hasBothInputs || isOmniRouterConfigured();
  const hasAnyInput = Boolean(trimmedUrl || trimmedKey);

  useEffect(() => {
    if (endpoint !== undefined) {
      setInputUrl(endpoint);
    }
  }, [endpoint]);

  useEffect(() => {
    if (apiKey !== undefined) {
      setInputKey(apiKey);
    }
  }, [apiKey]);

  const handleSave = async () => {
    if (!trimmedUrl) {
      toast.error("Please enter your OmniRouter endpoint URL.");
      return;
    }
    if (urlInvalid) {
      toast.error("Endpoint URL must start with http:// or https://");
      return;
    }
    if (!trimmedKey) {
      toast.error("Please enter your OmniRouter API key.");
      return;
    }

    setOmniRouterBaseUrl(trimmedUrl);
    setOmniRouterApiKey(trimmedKey);
    onEndpointChange?.(trimmedUrl);
    onApiKeyChange?.(trimmedKey);

    setIsSaved(true);
    if (isActive) {
      toast.success("OmniRouter settings saved. Verifying connection...");
      await onRefresh(trimmedUrl, trimmedKey);
    } else {
      toast.success("OmniRouter settings saved. Toggle ON to verify and activate.");
    }
    setTimeout(() => setIsSaved(false), 2000);
  };

  const handleRemove = () => {
    setOmniRouterBaseUrl("");
    setOmniRouterApiKey("");
    setInputUrl("");
    setInputKey("");
    onEndpointChange?.("");
    onApiKeyChange?.("");
    if (isActive) {
      onToggle();
    }
    setIsRemoving(true);
    toast.info("OmniRouter settings removed. Switched to Managed AI (Default).");
    setTimeout(() => setIsRemoving(false), 1500);
  };

  // Turning ON persists whatever is typed so the parent validates the current inputs.
  const handleToggle = () => {
    if (!isActive && hasBothInputs) {
      setOmniRouterBaseUrl(trimmedUrl);
      setOmniRouterApiKey(trimmedKey);
      onEndpointChange?.(trimmedUrl);
      onApiKeyChange?.(trimmedKey);
    }
    onToggle();
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
                isActive
                  ? "bg-emerald-500/20 text-emerald-600 dark:text-emerald-400"
                  : "bg-primary/10 text-primary"
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
              onClick={handleToggle}
              disabled={!isActive && !isConfigured}
              title={
                !isActive && !isConfigured
                  ? "Enter an endpoint URL and API key first"
                  : isActive
                    ? "Turn OFF to revert to Managed AI"
                    : "Turn ON to use OmniRouter"
              }
              className={`relative inline-flex h-6.5 w-12 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus-visible:ring-2 focus-visible:ring-primary ${
                isActive
                  ? "bg-emerald-500 shadow-[0_0_10px_rgba(16,185,129,0.4)]"
                  : "bg-surface-3 border-border hover:bg-surface-4"
              } ${!isActive && !isConfigured ? "opacity-40 cursor-not-allowed" : ""}`}
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
          Route requests through your private or local OmniRouter instance. Direct connection
          without consuming Anuvaad quota.
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

      {/* Input Fields */}
      <div className="space-y-2">
        <label
          htmlFor="omnirouter-endpoint-url-input"
          className="text-xs font-semibold text-foreground"
        >
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
            aria-invalid={urlInvalid}
            className={`w-full rounded-xl border bg-background/80 pl-10 pr-3.5 py-2.5 text-xs font-mono text-foreground placeholder:text-muted-foreground/50 outline-none focus:ring-1 transition-colors shadow-2xs ${
              urlInvalid
                ? "border-rose-500/70 focus:border-rose-500 focus:ring-rose-500"
                : "border-border focus:border-primary focus:ring-primary"
            }`}
          />
        </div>

        <label
          htmlFor="omnirouter-api-key-input"
          className="block pt-1 text-xs font-semibold text-foreground"
        >
          API Key
        </label>

        <div className="relative flex items-center">
          <div className="absolute left-3.5 text-muted-foreground pointer-events-none">
            <KeyRound className="h-4 w-4" />
          </div>
          <input
            id="omnirouter-api-key-input"
            type={showKey ? "text" : "password"}
            autoComplete="off"
            spellCheck={false}
            placeholder="Your OmniRouter API key"
            value={inputKey}
            onChange={(e) => setInputKey(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && hasBothInputs) void handleSave();
            }}
            className="w-full rounded-xl border border-border bg-background/80 pl-10 pr-10 py-2.5 text-xs font-mono text-foreground placeholder:text-muted-foreground/50 outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-colors shadow-2xs"
          />
          <button
            type="button"
            onClick={() => setShowKey((v) => !v)}
            aria-label={showKey ? "Hide API key" : "Show API key"}
            title={showKey ? "Hide API key" : "Show API key"}
            className="absolute right-2.5 rounded-md p-1 text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
          >
            {showKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          </button>
        </div>

        {/* Dynamic Helper Note */}
        <div className="min-h-5 text-[11px]">
          {isActive && status === "connected" ? (
            <span className="flex items-center gap-1.5 text-emerald-600 dark:text-emerald-400 font-medium">
              <CheckCircle2 className="h-3 w-3 shrink-0" />
              <span>Endpoint online &amp; responding. Provider active.</span>
            </span>
          ) : isActive && error ? (
            <span className="flex items-center gap-1.5 text-rose-500 font-medium">
              <AlertCircle className="h-3 w-3 shrink-0" />
              <span className="truncate">{error}</span>
            </span>
          ) : urlInvalid ? (
            <span className="flex items-center gap-1.5 text-rose-500 font-medium">
              <AlertCircle className="h-3 w-3 shrink-0" />
              <span>Endpoint URL must start with http:// or https://</span>
            </span>
          ) : trimmedUrl && !trimmedKey ? (
            <span className="text-amber-600 dark:text-amber-400 font-medium">
              An API key is required to connect to your endpoint.
            </span>
          ) : (
            <span className="text-muted-foreground">
              Both values are required. Use a public URL (e.g. ngrok) when not running locally.
              Leave empty to use Managed AI.
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
          onClick={handleToggle}
          disabled={!isActive && !isConfigured}
          title={
            !isActive && !isConfigured
              ? "Enter an endpoint URL and API key to enable"
              : isActive
                ? "Click to turn OFF (use Managed AI)"
                : "Click to turn ON"
          }
          className={`rounded-xl px-4 py-2.5 text-xs font-bold transition-all shadow-xs flex items-center justify-center gap-2 cursor-pointer active:scale-98 shrink-0 ${
            isActive
              ? "bg-emerald-600 hover:bg-emerald-500 text-white shadow-emerald-600/20"
              : "bg-surface-2 hover:bg-surface-3 text-muted-foreground border border-border"
          } ${!isActive && !isConfigured ? "opacity-40 cursor-not-allowed" : ""}`}
        >
          <span
            className={`h-2 w-2 rounded-full ${isActive ? "bg-white animate-pulse" : "bg-muted-foreground/40"}`}
          />
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
          disabled={status === "checking" || !hasBothInputs}
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
            <span>Save</span>
          )}
        </button>

        {/* Remove Button */}
        {hasAnyInput && (
          <button
            type="button"
            id="remove-omnirouter-endpoint-btn"
            onClick={handleRemove}
            disabled={isRemoving}
            title="Remove OmniRouter endpoint & API key and revert to Managed AI"
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
