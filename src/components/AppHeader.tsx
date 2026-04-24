import { Link } from "@tanstack/react-router";

export function AppHeader({ right }: { right?: React.ReactNode }) {
  return (
    <header className="flex items-center justify-between border-b border-border bg-surface px-5 py-3">
      <Link to="/" className="flex items-center gap-3 group">
        <div className="flex h-7 w-7 items-center justify-center rounded-md bg-primary font-mono text-sm font-bold text-primary-foreground">
          ◐
        </div>
        <div className="flex items-baseline gap-2">
          <h1 className="text-base font-semibold tracking-tight group-hover:text-primary transition-colors">
            DocLens
          </h1>
          <span className="hidden font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground sm:inline">
            document → ai pipeline inspector
          </span>
        </div>
      </Link>
      <div className="flex items-center gap-2">
        {right}
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
