import { Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { ApiKeyStatusBadge } from "@/components/ApiKeyStatusBadge";
import { estimateStorage } from "@/lib/storage";

function useQuotaIndicator(): string | null {
  const [label, setLabel] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    const tick = async () => {
      const e = await estimateStorage();
      if (cancelled || !e) return;
      const mb = e.usage / (1024 * 1024);
      setLabel(mb > 100 ? `IDB: ${mb.toFixed(0)} MB` : null);
    };
    tick();
    const id = window.setInterval(tick, 30_000);
    return () => { cancelled = true; window.clearInterval(id); };
  }, []);
  return label;
}

export function AppHeader({ right }: { right?: React.ReactNode }) {
  const quota = useQuotaIndicator();
  return (
    <header className="flex h-14 items-center justify-between border-b border-border bg-surface px-4 shadow-sm">
      <Link to="/" className="flex items-center gap-3 group">
        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary font-mono text-base font-black text-primary-foreground shadow-[0_0_18px_rgba(78,222,163,0.2)]">
          ◐
        </div>
        <div className="flex items-baseline gap-2 min-w-0">
          <h1 className="text-lg font-black tracking-tight text-primary transition-colors group-hover:text-foreground">
            DocLens
          </h1>
          <span className="hidden font-mono text-[10px] uppercase tracking-[0.22em] text-muted-foreground sm:inline">
            AI Intelligence
          </span>
        </div>
      </Link>
      <div className="flex items-center gap-2">
        {quota && (
          <span className="hidden font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground sm:inline" title="IndexedDB usage">
            {quota}
          </span>
        )}
        {right}
        <ApiKeyStatusBadge />

        <Link
          to="/settings"
          className="rounded-md border border-border bg-background px-2.5 py-1.5 font-mono text-[11px] uppercase tracking-widest text-muted-foreground transition-colors hover:text-foreground hover:border-border-strong"
          title="Settings"
          aria-label="Settings"
        >
          ⚙ settings
        </Link>
      </div>
    </header>
  );
}
