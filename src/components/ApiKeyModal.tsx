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
  getKey,
  getKeyStatus,
  isKeyFormatValid,
  OPEN_API_KEY_MODAL_EVT,
  onKeyChange,
  setKey,
  setKeyStatus,
  validateKey,
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
  const [input, setInput] = useState("");
  const [status, setStatus] = useState<Status>("unknown");

  // Listen for global open requests.
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent<{ reason?: string }>).detail;
      setReason(detail?.reason ?? null);
      setInput(getKey());
      setStatus(getKeyStatus());
      setOpen(true);
    };
    window.addEventListener(OPEN_API_KEY_MODAL_EVT, handler);
    return () => window.removeEventListener(OPEN_API_KEY_MODAL_EVT, handler);
  }, []);

  // Reflect external changes (e.g. saved from Settings).
  useEffect(() => onKeyChange(() => setStatus(getKeyStatus())), []);

  const trimmed = input.trim();
  const formatOk = isKeyFormatValid(trimmed);

  const handleValidate = async () => {
    if (!trimmed) {
      toast.error("Paste your OpenRouter API key first.");
      return;
    }
    if (!formatOk) {
      setStatus("invalid");
      toast.error("That doesn't look like an OpenRouter key (expected sk-or-…).");
      return;
    }
    setStatus("checking");
    const ok = await validateKey(trimmed);
    if (ok) {
      setKey(trimmed);
      setKeyStatus("valid");
      toast.success("API key validated and saved.");
      setOpen(false);
    } else {
      setStatus("invalid");
      toast.error("OpenRouter rejected this key. Double-check and try again.");
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="sm:max-w-[480px]">
        <DialogHeader>
          <DialogTitle>Add your OpenRouter API key</DialogTitle>
          <DialogDescription>
            DocLens runs entirely in your browser — your key is stored locally
            and only sent to OpenRouter when you trigger a translation.
          </DialogDescription>
        </DialogHeader>

        {reason && (
          <div className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 font-mono text-[11px] text-destructive">
            {reason}
          </div>
        )}

        <div className="space-y-2">
          <label className="block font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
            openrouter api key
          </label>
          <input
            value={input}
            onChange={(e) => {
              setInput(e.target.value);
              setStatus("unknown");
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") void handleValidate();
            }}
            type="password"
            autoFocus
            spellCheck={false}
            placeholder="sk-or-…"
            className="w-full rounded-md border border-border bg-background px-3 py-1.5 font-mono text-[12px] outline-none focus:border-primary"
          />
          <StatusLine status={status} formatOk={formatOk || !trimmed} />
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
              disabled={!trimmed || status === "checking"}
              className="rounded-md bg-primary px-3 py-1.5 font-mono text-[11px] uppercase tracking-widest text-primary-foreground disabled:opacity-40"
            >
              {status === "checking" ? "validating…" : "validate & save"}
            </button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function StatusLine({ status, formatOk }: { status: Status; formatOk: boolean }) {
  if (status === "checking")
    return <p className="font-mono text-[11px] text-muted-foreground">checking with openrouter…</p>;
  if (status === "valid")
    return <p className="font-mono text-[11px] text-primary">✓ connected — key is valid</p>;
  if (status === "invalid")
    return (
      <p className="font-mono text-[11px] text-destructive">
        ✗ invalid or expired key
      </p>
    );
  if (!formatOk)
    return (
      <p className="font-mono text-[11px] text-muted-foreground">
        keys start with <span className="text-foreground">sk-or-</span>
      </p>
    );
  return <p className="font-mono text-[11px] text-muted-foreground">not validated yet</p>;
}
