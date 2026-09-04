import {
  KeyRound,
  Eye,
  EyeOff,
  ExternalLink,
  CheckCircle2,
  AlertCircle,
  Loader2,
} from "lucide-react";
import { useState } from "react";

type KeyStatus = "unknown" | "missing" | "valid" | "invalid" | "checking";

interface ApiKeySectionProps {
  customKey: string;
  onCustomKeyChange: (value: string) => void;
  keyStatus: KeyStatus;
  onValidate: () => void;
}

export function ApiKeySection({
  customKey,
  onCustomKeyChange,
  keyStatus,
  onValidate,
}: ApiKeySectionProps) {
  const [showKey, setShowKey] = useState(false);

  return (
    <section className="glass-panel flex flex-col gap-4 rounded-[18px] p-4 md:p-6 border border-border/80 bg-surface/50 backdrop-blur-md">
      {/* Header */}
      <div className="flex items-center gap-2.5">
        <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/10 text-primary">
          <KeyRound className="h-5 w-5" />
        </div>
        <div>
          <h3 className="text-base font-semibold text-foreground">OpenRouter API Key</h3>
          <p className="text-xs text-muted-foreground">
            Use your own free key for extra daily reading pages
          </p>
        </div>
      </div>

      {/* Single Clean Link Banner */}
      <div className="flex items-center justify-between gap-3 rounded-xl border border-primary/20 bg-primary/5 p-3 text-xs">
        <span className="text-muted-foreground">
          Don't have a key? Get one free in 30s (no credit card required).
        </span>
        <a
          href="https://openrouter.ai/keys"
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1 font-semibold text-primary hover:underline shrink-0"
        >
          <span>Get Free Key</span>
          <ExternalLink className="h-3 w-3" />
        </a>
      </div>

      {/* Input */}
      <div className="flex flex-col gap-1.5">
        <label className="text-xs font-semibold text-foreground">Paste API Key</label>
        <div className="relative flex items-center">
          <input
            type="text"
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
            style={
              {
                WebkitTextSecurity: showKey ? "none" : "disc",
              } as React.CSSProperties
            }
            className="w-full rounded-lg border border-border bg-background pl-3 pr-9 py-2 text-xs font-mono outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-colors"
          />
          <button
            type="button"
            onClick={() => setShowKey(!showKey)}
            className="absolute right-2.5 text-muted-foreground hover:text-foreground p-1 transition-colors cursor-pointer"
            tabIndex={-1}
            aria-label={showKey ? "Hide key" : "Show key"}
          >
            {showKey ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
          </button>
        </div>
        <p className="text-[10px] text-muted-foreground">
          Saved locally in your browser. Leave blank to use the shared default key.
        </p>
      </div>

      {/* Save Button */}
      <button
        type="button"
        onClick={onValidate}
        disabled={keyStatus === "checking"}
        className="w-full rounded-xl bg-primary py-2.5 text-xs font-semibold text-primary-foreground transition-all hover:bg-primary/90 active:scale-95 disabled:opacity-50 shadow-xs flex items-center justify-center gap-2 cursor-pointer"
      >
        {keyStatus === "checking" ? (
          <>
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            <span>Verifying Key...</span>
          </>
        ) : (
          <span>Save &amp; Verify Key</span>
        )}
      </button>

      {/* Validation Status */}
      <div className="rounded-lg border border-border/60 bg-background/50 p-2.5 text-xs">
        {keyStatus === "valid" && (
          <div className="flex items-center gap-2 text-primary font-medium">
            <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
            <span>
              {customKey.trim()
                ? "Custom API key connected & ready."
                : "Default server key connected & ready."}
            </span>
          </div>
        )}
        {keyStatus === "missing" && (
          <div className="flex items-center gap-2 text-muted-foreground">
            <AlertCircle className="h-3.5 w-3.5 shrink-0" />
            <span>Using default shared server key.</span>
          </div>
        )}
        {keyStatus === "invalid" && (
          <div className="flex items-center gap-2 text-destructive font-medium">
            <AlertCircle className="h-3.5 w-3.5 shrink-0" />
            <span>Invalid API key. Please check your key on OpenRouter.</span>
          </div>
        )}
        {keyStatus === "unknown" && (
          <span className="text-muted-foreground">Connection status not verified yet.</span>
        )}
      </div>
    </section>
  );
}
