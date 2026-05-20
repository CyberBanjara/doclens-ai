import { useEffect, useState } from "react";
import {
  getKeyStatus,
  onKeyChange,
  openApiKeyModal,
  type KeyStatus,
} from "@/lib/openrouter";

const LABELS: Record<KeyStatus, string> = {
  valid: "connected",
  invalid: "invalid key",
  missing: "no api key",
  unknown: "key not verified",
};

const CLASSES: Record<KeyStatus, string> = {
  valid:
    "border-primary/40 bg-primary/10 text-primary hover:border-primary",
  invalid:
    "border-destructive/50 bg-destructive/10 text-destructive hover:border-destructive",
  missing:
    "border-destructive/50 bg-destructive/10 text-destructive hover:border-destructive",
  unknown:
    "border-border bg-background text-muted-foreground hover:text-foreground",
};

/** Header chip showing OpenRouter key status. Clicking opens the modal. */
export function ApiKeyStatusBadge() {
  const [status, setStatus] = useState<KeyStatus>("unknown");

  useEffect(() => {
    setStatus(getKeyStatus());
    return onKeyChange(() => setStatus(getKeyStatus()));
  }, []);

  return (
    <button
      onClick={() =>
        openApiKeyModal(
          status === "valid" ? undefined : "A valid OpenRouter key is required to run translations.",
        )
      }
      className={`rounded-md border px-2.5 py-1.5 font-mono text-[11px] uppercase tracking-widest transition-colors ${CLASSES[status]}`}
      title="OpenRouter API key"
    >
      <span className="mr-1.5">●</span>
      {LABELS[status]}
    </button>
  );
}
