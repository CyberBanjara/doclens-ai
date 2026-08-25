import { KeyRound, Eye, EyeOff, ExternalLink, Sparkles, CheckCircle2, AlertCircle } from "lucide-react";
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
    <section className="glass-panel flex flex-col gap-4 rounded-[18px] p-4 md:col-span-5 md:p-6 border border-border/80 bg-surface/50 backdrop-blur-md">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <KeyRound className="h-5 w-5" />
          </div>
          <div>
            <h3 className="text-lg font-semibold text-foreground">API Key Management</h3>
            <p className="text-xs text-muted-foreground">
              Unlock 50 free pages daily with your own key
            </p>
          </div>
        </div>
      </div>

      {/* ─── 50 Free Pages Value Prop Banner & "Get Your Free Key" Button ─── */}
      <div className="relative overflow-hidden rounded-xl border border-primary/20 bg-gradient-to-br from-primary/10 via-primary/5 to-transparent p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 space-y-1">
            <div className="flex items-center gap-1.5 font-medium text-xs text-primary">
              <Sparkles className="h-3.5 w-3.5" />
              <span>50 Free Pages / Day</span>
            </div>
            <p className="text-xs leading-relaxed text-foreground/90">
              Used today's 50 free pages? Add your own free OpenRouter API key to continue reading
              another <strong>50 pages per day for free</strong> without server limits.
            </p>
          </div>
        </div>

        <div className="mt-3.5 flex flex-wrap items-center gap-2">
          <a
            href="https://openrouter.ai/keys"
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3.5 py-1.5 text-xs font-semibold text-primary-foreground shadow-sm transition-all hover:bg-primary/90 hover:shadow active:scale-95"
          >
            <span>Get Your Free Key</span>
            <ExternalLink className="h-3.5 w-3.5" />
          </a>
          <span className="text-[11px] text-muted-foreground">Takes 30s • 100% Free</span>
        </div>
      </div>

      {/* ─── 3-Step Quick Guide ─── */}
      <div className="rounded-xl border border-border/60 bg-background/50 p-3 space-y-2 text-[11px] text-muted-foreground">
        <div className="font-semibold text-foreground text-xs flex items-center gap-1.5">
          <span>How to continue reading for free:</span>
        </div>
        <ol className="list-decimal list-inside space-y-1 pl-0.5 leading-relaxed">
          <li>
            Click <strong className="text-foreground">"Get Your Free Key"</strong> above to visit
            OpenRouter.
          </li>
          <li>Create a free account and generate an API key (no credit card needed).</li>
          <li>Paste your key below and click verify to start reading immediately.</li>
        </ol>
      </div>

      {/* ─── API Key Input ─── */}
      <div className="flex flex-col gap-1.5">
        <div className="flex justify-between items-center">
          <label className="text-xs font-semibold text-foreground">Paste OpenRouter API Key</label>
          <a
            href="https://openrouter.ai/keys"
            target="_blank"
            rel="noreferrer"
            className="text-[11px] text-primary hover:underline inline-flex items-center gap-1"
          >
            openrouter.ai/keys
            <ExternalLink className="h-3 w-3" />
          </a>
        </div>
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
            style={{
              WebkitTextSecurity: showKey ? "none" : "disc",
            } as React.CSSProperties}
            className="w-full rounded-xl border border-border bg-background pl-3 pr-10 py-2.5 text-sm font-mono outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-colors"
          />
          <button
            type="button"
            onClick={() => setShowKey(!showKey)}
            className="absolute right-3 text-muted-foreground hover:text-foreground p-1 transition-colors"
            tabIndex={-1}
            aria-label={showKey ? "Hide key" : "Show key"}
          >
            {showKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          </button>
        </div>
        <p className="text-[10px] text-muted-foreground">
          Your key is saved locally in your browser. Leave blank to fallback to the shared server
          key.
        </p>
      </div>

      <button
        onClick={onValidate}
        disabled={keyStatus === "checking"}
        className="w-full rounded-xl bg-accent py-2.5 text-sm font-semibold text-accent-foreground transition-all hover:opacity-95 active:scale-95 disabled:opacity-50 shadow-sm flex items-center justify-center gap-2 cursor-pointer"
      >
        {keyStatus === "checking" ? (
          <>
            <span className="inline-block h-4 w-4 rounded-full border-2 border-accent-foreground border-t-transparent spin-slow" />
            <span>Verifying Key...</span>
          </>
        ) : (
          <span>Save and Verify Connection</span>
        )}
      </button>

      {/* ─── Validation Status ─── */}
      <div className="rounded-lg border border-border/60 bg-background/60 p-2.5 text-xs font-medium">
        {keyStatus === "valid" && (
          <div className="flex items-center gap-2 text-primary font-semibold">
            <CheckCircle2 className="h-4 w-4" />
            <span>
              {customKey.trim()
                ? "Custom API key connected & ready (50 free pages/day unlocked)!"
                : "Server environment key connected & ready."}
            </span>
          </div>
        )}
        {keyStatus === "missing" && (
          <div className="flex items-center gap-2 text-destructive">
            <AlertCircle className="h-4 w-4" />
            <span>No API key configured. Click \"Get Your Free Key\" above to get started.</span>
          </div>
        )}
        {keyStatus === "invalid" && (
          <div className="flex items-center gap-2 text-destructive">
            <AlertCircle className="h-4 w-4" />
            <span>
              {customKey.trim()
                ? "Invalid or expired custom key. Please check your key on OpenRouter."
                : "Invalid server key. Please paste your custom OpenRouter key above."}
            </span>
          </div>
        )}
        {keyStatus === "unknown" && (
          <span className="text-muted-foreground">Connection status not verified yet.</span>
        )}
      </div>
    </section>
  );
}
