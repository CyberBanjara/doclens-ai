import { Eye, EyeOff } from "lucide-react";
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
  const [status, setStatus] = useState<Status>("unknown");
  const [customKey, setCustomKeyInput] = useState("");
  const [showKey, setShowKey] = useState(false);

  // Listen for global open requests.
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent<{ reason?: string }>).detail;
      setReason(detail?.reason ?? null);
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
          ? "Custom OpenRouter key saved and validated."
          : "Server OpenRouter key is configured.",
      );
      setOpen(false);
    } else {
      const nextStatus = getKeyStatus();
      setStatus(nextStatus === "missing" ? "missing" : "invalid");
      toast.error(
        nextStatus === "missing"
          ? "No API key configured (neither server environment nor custom key)."
          : "OpenRouter rejected the API key.",
      );
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="sm:max-w-[480px]">
        <DialogHeader>
          <DialogTitle>OpenRouter API Key Setup</DialogTitle>
          <DialogDescription>
            Anuwad can use the server-wide environment key or you can supply your own custom key
            (saved locally in your browser).
          </DialogDescription>
        </DialogHeader>

        {reason && (
          <div className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 font-mono text-[11px] text-destructive">
            {reason}
          </div>
        )}

        <div className="space-y-2">
          <label className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
            Custom API Key (Optional)
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
              className="w-full rounded-md border border-border bg-background pl-3 pr-10 py-2 text-sm font-mono outline-none focus:border-primary"
            />
            <button
              type="button"
              onClick={() => setShowKey(!showKey)}
              className="absolute right-3 text-muted-foreground hover:text-foreground"
              tabIndex={-1}
              aria-label={showKey ? "Hide key" : "Show key"}
            >
              {showKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
          <p className="text-[10px] text-muted-foreground">
            If provided, this key overrides the server environment variable. Leave blank to fallback
            to the server-managed key.
          </p>
        </div>

        <div className="rounded-md border border-border bg-background px-3 py-2">
          <StatusLine status={status} isCustom={!!customKey.trim()} />
        </div>

        <div className="flex items-center justify-between gap-3 pt-1">
          <a
            href="https://openrouter.ai/keys"
            target="_blank"
            rel="noreferrer"
            className="font-mono text-[11px] uppercase tracking-widest text-primary underline-offset-4 hover:underline"
          >
            get an api key →
          </a>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setOpen(false)}
              className="rounded-md border border-border bg-background px-3 py-1.5 font-mono text-[11px] uppercase tracking-widest text-muted-foreground hover:text-foreground"
            >
              cancel
            </button>
            <button
              onClick={handleValidate}
              disabled={status === "checking"}
              className="rounded-md bg-primary px-3 py-1.5 font-mono text-[11px] uppercase tracking-widest text-primary-foreground disabled:opacity-40"
            >
              {status === "checking" ? "checking…" : "save & validate"}
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
      <p className="font-mono text-[11px] text-muted-foreground">checking connection status…</p>
    );
  if (status === "valid")
    return (
      <p className="font-mono text-[11px] text-primary font-bold">
        connected - {isCustom ? "custom key" : "server key"} is valid
      </p>
    );
  if (status === "missing")
    return (
      <p className="font-mono text-[11px] text-destructive">
        missing API key (neither server environment nor custom key configured)
      </p>
    );
  if (status === "invalid")
    return (
      <p className="font-mono text-[11px] text-destructive">
        {isCustom ? "custom key" : "server key"} is invalid or expired
      </p>
    );
  return (
    <p className="font-mono text-[11px] text-muted-foreground">key connection not checked yet</p>
  );
}
