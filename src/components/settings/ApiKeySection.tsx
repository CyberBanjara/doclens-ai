import { KeyRound } from "lucide-react";

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
  return (
    <section className="glass-panel flex flex-col gap-4 rounded-[18px] p-4 md:col-span-5 md:p-6">
      <div className="flex items-center gap-3">
        <KeyRound className="h-5 w-5 text-primary" />
        <h3 className="text-lg font-semibold text-foreground">API Key Management</h3>
      </div>
      <p className="text-sm text-muted-foreground">
        Anuwad uses the server-managed key by default, but you can enter your own key here to
        override it.
      </p>

      <div className="flex flex-col gap-1.5">
        <div className="flex justify-between items-center">
          <label className="text-xs font-semibold text-foreground">Custom API Key (Optional)</label>
          <a
            href="https://openrouter.ai/keys"
            target="_blank"
            rel="noreferrer"
            className="text-[10px] text-primary hover:underline"
          >
            Get a key →
          </a>
        </div>
        <input
          type="password"
          placeholder="sk-or-v1-..."
          value={customKey}
          onChange={(e) => onCustomKeyChange(e.target.value)}
          className="w-full rounded-[10px] border border-border bg-background px-3 py-2 text-sm font-mono outline-none focus:border-primary"
        />
        <p className="text-[10px] text-muted-foreground">
          Leave blank to fallback to the server environment key. Saved locally in your browser.
        </p>
      </div>

      <button
        onClick={onValidate}
        disabled={keyStatus === "checking"}
        className="w-full rounded-full bg-accent py-2 text-sm font-semibold text-accent-foreground transition-all hover:opacity-90 active:scale-95 disabled:opacity-40 shadow-sm"
      >
        {keyStatus === "checking" ? "Checking..." : "Save and Verify Connection"}
      </button>
      <div className="text-xs font-semibold">
        {keyStatus === "valid" && (
          <span className="text-primary">
            {customKey.trim() ? "Custom key validated" : "Server key validated"}
          </span>
        )}
        {keyStatus === "missing" && (
          <span className="text-destructive">
            No API key configured (neither server nor custom key)
          </span>
        )}
        {keyStatus === "invalid" && (
          <span className="text-destructive">
            {customKey.trim() ? "Invalid custom key" : "Invalid server key"}
          </span>
        )}
        {keyStatus === "unknown" && <span className="text-muted-foreground">Not checked</span>}
      </div>
    </section>
  );
}
