import {
  KeyRound,
  Eye,
  EyeOff,
  ExternalLink,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Trash2,
  Check,
  Sparkles,
} from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { getCustomKey, setCustomKey } from "@/lib/openrouter";

type KeyStatus = "unknown" | "missing" | "valid" | "invalid" | "checking";

interface ApiKeySectionProps {
  customKey: string;
  onCustomKeyChange: (value: string) => void;
  keyStatus: KeyStatus;
  onValidate: () => Promise<void> | void;
  isActive: boolean;
  onToggle: () => void;
  selectedModel?: string;
  onOpenModelSelector?: () => void;
}

export function ApiKeySection({
  customKey,
  onCustomKeyChange,
  keyStatus,
  onValidate,
  isActive,
  onToggle,
  selectedModel,
  onOpenModelSelector,
}: ApiKeySectionProps) {
  const [showKey, setShowKey] = useState(false);
  const [isSaved, setIsSaved] = useState(false);
  const [isRemoving, setIsRemoving] = useState(false);

  const savedKey = typeof window !== "undefined" ? getCustomKey() : "";
  const isConfigured = Boolean(savedKey && keyStatus === "valid");

  const handleSave = async () => {
    const trimmed = customKey.trim();
    if (!trimmed) {
      toast.error("Please enter a valid OpenRouter API key.");
      return;
    }
    setCustomKey(trimmed);
    setIsSaved(true);
    await onValidate();
    toast.success("OpenRouter API key saved. You can now toggle it ON.");
    setTimeout(() => setIsSaved(false), 2000);
  };

  const handleRemove = () => {
    setCustomKey("");
    onCustomKeyChange("");
    if (isActive) {
      onToggle();
    }
    setIsRemoving(true);
    toast.info("OpenRouter key removed. Reverted to Managed AI (Default).");
    void onValidate();
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
              <KeyRound className="h-5 w-5" />
            </div>
            <div>
              <h3 className="text-base font-semibold text-foreground">OpenRouter</h3>
              <p className="text-xs text-muted-foreground">Personal API Key</p>
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
              id="toggle-openrouter-switch"
              onClick={onToggle}
              disabled={!isConfigured}
              title={
                !isConfigured
                  ? "Enter and verify a valid key first"
                  : isActive
                    ? "Turn OFF to revert to Managed AI"
                    : "Turn ON to use Personal OpenRouter"
              }
              className={`relative inline-flex h-6.5 w-12 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus-visible:ring-2 focus-visible:ring-primary ${
                isActive
                  ? "bg-emerald-500 shadow-[0_0_10px_rgba(16,185,129,0.4)]"
                  : "bg-surface-3 border-border hover:bg-surface-4"
              } ${!isConfigured ? "opacity-40 cursor-not-allowed" : ""}`}
            >
              <span className="sr-only">Toggle OpenRouter ON/OFF</span>
              <span
                className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-md ring-0 transition duration-200 ease-in-out ${
                  isActive ? "translate-x-5.5" : "translate-x-0"
                }`}
              />
            </button>
          </div>
        </div>

        <p className="text-xs text-muted-foreground leading-relaxed">
          Supply your personal key to translate directly via OpenRouter. Requests bypass Anuvaad's managed quota.
        </p>
      </div>

      {/* Input Field */}
      <div className="space-y-2">
        <div className="flex items-center justify-between text-xs">
          <label htmlFor="openrouter-api-key-input" className="font-semibold text-foreground">
            API Key
          </label>
          <a
            href="https://openrouter.ai/keys"
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 text-[11px] font-medium text-primary hover:underline"
          >
            <span>Get a key</span>
            <ExternalLink className="h-2.5 w-2.5" />
          </a>
        </div>

        <div className="relative flex items-center">
          <input
            id="openrouter-api-key-input"
            type={showKey ? "text" : "password"}
            autoComplete="off"
            autoCorrect="off"
            autoCapitalize="off"
            spellCheck={false}
            data-1p-ignore="true"
            data-lpignore="true"
            data-form-type="other"
            name="openrouter_api_key_custom"
            placeholder="sk-or-v1-..."
            value={customKey}
            onChange={(e) => onCustomKeyChange(e.target.value)}
            className="w-full rounded-xl border border-border bg-background/80 pl-3.5 pr-10 py-2.5 text-xs font-mono text-foreground placeholder:text-muted-foreground/50 outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-colors shadow-2xs"
          />
          <button
            type="button"
            id="toggle-openrouter-key-visibility"
            onClick={() => setShowKey(!showKey)}
            className="absolute right-3 text-muted-foreground hover:text-foreground p-1 transition-colors cursor-pointer"
            tabIndex={-1}
            aria-label={showKey ? "Hide key" : "Show key"}
          >
            {showKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          </button>
        </div>

        {/* Dynamic Helper Note */}
        <div className="min-h-5 text-[11px]">
          {isConfigured ? (
            <span className="flex items-center gap-1.5 text-emerald-600 dark:text-emerald-400 font-medium">
              <CheckCircle2 className="h-3 w-3 shrink-0" />
              <span>Valid key configured. {isActive ? "Provider active." : "Toggle ON to use."}</span>
            </span>
          ) : keyStatus === "invalid" ? (
            <span className="flex items-center gap-1.5 text-rose-500 font-medium">
              <AlertCircle className="h-3 w-3 shrink-0" />
              <span>Key verification failed. Please check your credentials.</span>
            </span>
          ) : (
            <span className="text-muted-foreground">
              Stored securely in local storage. Leave empty to use Managed AI.
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
          id="toggle-openrouter-btn"
          onClick={onToggle}
          disabled={!isConfigured}
          title={
            !isConfigured
              ? "Save a valid key to enable"
              : isActive
                ? "Click to turn OFF (use Managed AI)"
                : "Click to turn ON"
          }
          className={`rounded-xl px-4 py-2.5 text-xs font-bold transition-all shadow-xs flex items-center justify-center gap-2 cursor-pointer active:scale-98 shrink-0 ${
            isActive
              ? "bg-emerald-600 hover:bg-emerald-500 text-white shadow-emerald-600/20"
              : "bg-surface-2 hover:bg-surface-3 text-muted-foreground border border-border"
          } ${!isConfigured ? "opacity-40 cursor-not-allowed" : ""}`}
        >
          <span className={`h-2 w-2 rounded-full ${isActive ? "bg-white animate-pulse" : "bg-muted-foreground/40"}`} />
          <span>{isActive ? "Turn OFF" : "Turn ON"}</span>
        </button>

        {/* Change Model Button */}
        {isConfigured && onOpenModelSelector && (
          <button
            type="button"
            id="change-openrouter-model-btn"
            onClick={onOpenModelSelector}
            title="Browse and select OpenRouter models"
            className="rounded-xl bg-surface-2 hover:bg-surface-3 border border-border text-foreground px-3 py-2.5 text-xs font-semibold transition-all shadow-xs flex items-center justify-center gap-1.5 cursor-pointer shrink-0"
          >
            <Sparkles className="h-3.5 w-3.5 text-primary" />
            <span className="hidden sm:inline">Change Model</span>
          </button>
        )}

        {/* Save Button */}
        <button
          type="button"
          id="save-openrouter-key-btn"
          onClick={handleSave}
          disabled={keyStatus === "checking" || !customKey.trim()}
          className="flex-1 rounded-xl bg-surface-2 hover:bg-surface-3 border border-border text-foreground py-2.5 px-3 text-xs font-semibold transition-all active:scale-98 disabled:opacity-50 disabled:cursor-not-allowed shadow-xs flex items-center justify-center gap-2 cursor-pointer"
        >
          {keyStatus === "checking" ? (
            <>
              <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" />
              <span>Verifying...</span>
            </>
          ) : isSaved ? (
            <>
              <Check className="h-3.5 w-3.5 text-emerald-500" />
              <span>Saved!</span>
            </>
          ) : (
            <span>Save Key</span>
          )}
        </button>

        {/* Remove Button */}
        {Boolean(savedKey || customKey) && (
          <button
            type="button"
            id="remove-openrouter-key-btn"
            onClick={handleRemove}
            disabled={isRemoving}
            title="Remove custom key and revert to Managed AI"
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
