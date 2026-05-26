import { Link, useMatchRoute } from "@tanstack/react-router";
import { useRef } from "react";
import { ApiKeyStatusBadge } from "@/components/ApiKeyStatusBadge";

interface SidebarLayoutProps {
  children: React.ReactNode;
  /** Title shown in the top bar */
  pageTitle: string;
  /** Optional content for the right side of the top bar */
  topBarRight?: React.ReactNode;
  /** Callback when a file is selected via the "New Document" button */
  onNewDocument?: (file: File) => void;
}

const NAV_ITEMS = [
  { to: "/", label: "Library", icon: "📁" },
  { to: "/settings", label: "General Settings", icon: "⚙" },
  { to: "/settings/voice", label: "Voice Settings", icon: "🎙" },
] as const;

export function SidebarLayout({
  children,
  pageTitle,
  topBarRight,
  onNewDocument,
}: SidebarLayoutProps) {
  const matchRoute = useMatchRoute();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file && onNewDocument) onNewDocument(file);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  return (
    <div className="flex h-screen overflow-hidden bg-background text-foreground">
      {/* ──── Fixed Left Sidebar ──── */}
      <aside className="flex w-64 flex-shrink-0 flex-col border-r border-border bg-background">
        {/* Logo */}
        <div className="px-6 pt-8 pb-6">
          <Link to="/" className="flex items-center gap-3 group">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary font-mono text-base font-black text-primary-foreground shadow-[0_0_18px_rgba(78,222,163,0.2)]">
              ◐
            </div>
            <div>
              <h1 className="text-lg font-black tracking-tight text-primary transition-colors group-hover:text-foreground">
                DocLens
              </h1>
              <p className="text-[11px] tracking-wide text-muted-foreground">
                AI Intelligence
              </p>
            </div>
          </Link>
        </div>

        {/* Navigation */}
        <nav className="flex flex-col gap-1 px-4">
          {NAV_ITEMS.map((item) => {
            const isActive = item.to === "/"
              ? !!matchRoute({ to: "/", fuzzy: false })
              : !!matchRoute({ to: item.to, fuzzy: true });

            return (
              <Link
                key={item.to}
                to={item.to}
                className={`flex items-center gap-3 rounded-lg px-4 py-2.5 text-sm font-medium transition-all duration-200 ${
                  isActive
                    ? "border-r-2 border-primary bg-surface-2/60 text-primary font-bold"
                    : "text-muted-foreground hover:bg-surface-2/40 hover:text-foreground"
                }`}
              >
                <span className="text-base">{item.icon}</span>
                <span>{item.label}</span>
              </Link>
            );
          })}
        </nav>

        {/* Spacer */}
        <div className="flex-1" />

        {/* New Document Button */}
        <div className="px-4 pb-4">
          <input
            ref={fileInputRef}
            type="file"
            accept="application/pdf,.pdf"
            className="hidden"
            onChange={handleFileChange}
          />
          <button
            onClick={() => fileInputRef.current?.click()}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-primary py-3 px-4 font-bold text-primary-foreground transition-all hover:opacity-90 active:scale-[0.97]"
          >
            <span className="text-lg leading-none">+</span>
            New Document
          </button>
        </div>

        {/* Support Link */}
        <div className="border-t border-border px-4 py-4">
          <a
            href="#"
            className="flex items-center gap-3 rounded-lg px-4 py-2 text-sm text-muted-foreground transition-colors hover:text-primary"
          >
            <span className="text-base">❓</span>
            <span>Support</span>
          </a>
        </div>
      </aside>

      {/* ──── Main Content Area ──── */}
      <div className="flex flex-1 flex-col overflow-hidden">
        {/* Top Bar */}
        <header className="flex h-16 flex-shrink-0 items-center justify-between border-b border-border bg-background/80 px-8 backdrop-blur-md">
          <div className="flex items-center gap-3">
            <h2 className="text-2xl font-black tracking-tight text-primary">
              {pageTitle}
            </h2>
          </div>
          <div className="flex items-center gap-4">
            {topBarRight}
            <ApiKeyStatusBadge />
          </div>
        </header>

        {/* Scrollable Content */}
        <main className="flex-1 overflow-y-auto">
          {children}
        </main>
      </div>
    </div>
  );
}
