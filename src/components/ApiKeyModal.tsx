import { Eye, EyeOff, ExternalLink, Sparkles, KeyRound, CheckCircle2, AlertCircle } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  getKeyStatus,
  OPEN_API_KEY_MODAL_EVT,
  onKeyChange,
  validateKey,
  getCustomKey,
  setCustomKey,
  type KeyStatus,
  type OpenApiKeyModalDetail,
} from "@/lib/openrouter";

type Status = KeyStatus | "checking";

/**
 * Globally-mounted (in __root.tsx) modal that other UI can request via the
 * `doclens:open-api-key-modal` window event. Handles paste → validate → save
 * in one place so every entry point shares the same UX.
 */
export function ApiKeyModal() {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState<string | null>(null);
  const [isDailyLimit, setIsDailyLimit] = useState(false);
  const [status, setStatus] = useState<Status>("unknown");
  const [customKey, setCustomKeyInput] = useState("");
  const [showKey, setShowKey] = useState(false);

  // Listen for global open requests.
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent<OpenApiKeyModalDetail>).detail;
      const r = detail?.reason ?? null;
      const daily =
        detail?.isDailyLimit ??
        (r
          ? /50 free pages|daily limit|daily free limit|rate limit|too many requests|free tier/i.test(
              r,
            )
          : false);
      setReason(r);
      setIsDailyLimit(daily);
      setStatus(getKeyStatus());
      setCustomKeyInput(getCustomKey());
      setOpen(true);
    };
    window.addEventListener(OPEN_API_KEY_MODAL_EVT, handler);
    return () => window.removeEventListener(OPEN_API_KEY_MODAL_EVT, handler);
  }, []);

  // Reflect external changes (e.g. saved from Settings).
  useEffect(() => {
    return onKeyChange(() => {
      setStatus(getKeyStatus());
      setCustomKeyInput(getCustomKey());
    });
  }, []);

  const handleValidate = async () => {
    setStatus("checking");
    // Save first, then run validate
    setCustomKey(customKey);
    const ok = await validateKey();
    if (ok) {
      setStatus("valid");
      toast.success(
        customKey.trim()
          ? "🎉 Custom OpenRouter key connected! Another 50 free pages unlocked."
          : "Server OpenRouter key is configured.",
      );
      setOpen(false);
    } else {
      const nextStatus = getKeyStatus();
      setStatus(nextStatus === "missing" ? "missing" : "invalid");
      toast.error(
        nextStatus === "missing"
          ? "No API key configured (neither server environment nor custom key)."
          : "OpenRouter rejected the API key. Please check your key on openrouter.ai/keys.",
      );
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="sm:max-w-[500px] border-border/80 bg-surface/95 backdrop-blur-xl">
        <DialogHeader className="space-y-2">
          {isDailyLimit ? (
            <>
              <div className="inline-flex items-center gap-1.5 self-start rounded-full bg-primary/10 px-3 py-1 text-xs font-semibold text-primary">
                <Sparkles className="h-3.5 w-3.5" />
                <span>50 Free Pages Milestone Reached</span>
              </div>
              <DialogTitle className="text-xl font-bold tracking-tight text-foreground">
                You've used your 50 free pages for today!
              </DialogTitle>
              <DialogDescription className="text-xs leading-relaxed text-muted-foreground">
                Want to keep reading without waiting until tomorrow? Connect your own{" "}
                <strong className="text-foreground">free OpenRouter API key</strong> to unlock
                another <strong className="text-foreground">50 free pages every day</strong>!
              </DialogDescription>
            </>
          ) : (
            <>
              <div className="flex items-center gap-2">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  <KeyRound className="h-4 w-4" />
                </div>
                <DialogTitle className="text-lg font-bold text-foreground">
                  OpenRouter API Key Setup
                </DialogTitle>
              </div>
              <DialogDescription className="text-xs text-muted-foreground">
                Connect your own free OpenRouter key to enjoy 50 free pages per day without shared
                server limits.
              </DialogDescription>
            </>
          )}
        </DialogHeader>

        {/* ─── "Get Your Free Key" Feature Card ─── */}
        <div className="rounded-xl border border-primary/25 bg-gradient-to-br from-primary/10 via-primary/5 to-transparent p-3.5 space-y-3">
          <div className="flex items-center justify-between gap-3">
            <div className="space-y-0.5">
              <span className="text-xs font-bold text-foreground flex items-center gap-1">
                <Sparkles className="h-3.5 w-3.5 text-primary" />
                Get 50 Free Pages / Day
              </span>
              <p className="text-[11px] text-muted-foreground">
                Free keys take ~30 seconds to generate with no credit card required.
              </p>
            </div>
            <a
              href="https://openrouter.ai/keys"
              target="_blank"
              rel="noreferrer"
              className="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground shadow-sm transition-all hover:bg-primary/90 hover:shadow active:scale-95 cursor-pointer"
            >
              <span>Get Your Free Key</span>
              <ExternalLink className="h-3.5 w-3.5" />
            </a>
          </div>

          {/* Quick Steps */}
          <div className="rounded-lg border border-border/50 bg-background/50 p-2.5 text-[11px] text-muted-foreground space-y-1">
            <div className="font-semibold text-foreground text-[11px]">3 quick steps:</div>
            <ol className="list-decimal list-inside space-y-0.5 pl-0.5 leading-relaxed text-[11px]">
              <li>
                Click <strong className="text-foreground">"Get Your Free Key"</strong> to open
                OpenRouter.
              </li>
              <li>Sign in & create a free API key (100% free).</li>
              <li>Paste your key below and click save to continue reading immediately.</li>
            </ol>
          </div>
        </div>

        {reason && !isDailyLimit && (
          <div className="rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 font-mono text-[11px] text-destructive">
            {reason}
          </div>
        )}

        {/* ─── Custom API Key Input ─── */}
        <div className="space-y-1.5">
          <label className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
            Paste Your OpenRouter API Key
          </label>
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
              onChange={(e) => setCustomKeyInput(e.target.value)}
              style={{
                WebkitTextSecurity: showKey ? "none" : "disc",
              } as React.CSSProperties}
              className="w-full rounded-xl border border-border bg-background pl-3 pr-10 py-2 text-sm font-mono outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-colors"
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
            Stored locally in your browser. Leave blank to fallback to the server key.
          </p>
        </div>

        {/* ─── Status Line ─── */}
        <div className="rounded-lg border border-border/60 bg-background/60 px-3 py-2 text-xs">
          <StatusLine status={status} isCustom={!!customKey.trim()} />
        </div>

        {/* ─── Actions ─── */}
        <div className="flex items-center justify-between gap-3 pt-2">
          <a
            href="https://openrouter.ai/keys"
            target="_blank"
            rel="noreferrer"
            className="font-mono text-[11px] uppercase tracking-widest text-primary underline-offset-4 hover:underline inline-flex items-center gap-1"
          >
            openrouter.ai/keys <ExternalLink className="h-3 w-3" />
          </a>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setOpen(false)}
              className="rounded-xl border border-border bg-background px-3.5 py-1.5 font-mono text-[11px] uppercase tracking-widest text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
            >
              cancel
            </button>
            <button
              onClick={handleValidate}
              disabled={status === "checking"}
              className="rounded-xl bg-primary px-4 py-1.5 font-mono text-[11px] uppercase tracking-widest text-primary-foreground disabled:opacity-40 shadow-sm transition-all hover:bg-primary/90 active:scale-95 cursor-pointer"
            >
              {status === "checking" ? "checking…" : isDailyLimit ? "save & continue" : "save & validate"}
            </button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function StatusLine({ status, isCustom }: { status: Status; isCustom: boolean }) {
  if (status === "checking")
    return (
      <div className="flex items-center gap-1.5 text-muted-foreground font-mono text-[11px]">
        <span className="inline-block h-3 w-3 rounded-full border border-muted-foreground border-t-transparent spin-slow" />
        <span>checking connection status…</span>
      </div>
    );
  if (status === "valid")
    return (
      <div className="flex items-center gap-1.5 text-primary font-mono text-[11px] font-bold">
        <CheckCircle2 className="h-3.5 w-3.5" />
        <span>connected - {isCustom ? "custom key (50 free pages/day)" : "server key"} is valid</span>
      </div>
    );
  if (status === "missing")
    return (
      <div className="flex items-center gap-1.5 text-destructive font-mono text-[11px]">
        <AlertCircle className="h-3.5 w-3.5" />
        <span>missing API key (neither server environment nor custom key configured)</span>
      </div>
    );
  if (status === "invalid")
    return (
      <div className="flex items-center gap-1.5 text-destructive font-mono text-[11px]">
        <AlertCircle className="h-3.5 w-3.5" />
        <span>{isCustom ? "custom key" : "server key"} is invalid or expired</span>
      </div>
    );
  return (
    <p className="font-mono text-[11px] text-muted-foreground">key connection not checked yet</p>
  );
}
