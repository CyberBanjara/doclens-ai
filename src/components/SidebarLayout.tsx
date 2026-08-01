import { Link, useMatchRoute } from "@tanstack/react-router";
import { useRef, useState } from "react";
import { HelpCircle, Plus } from "lucide-react";
import { ApiKeyStatusBadge } from "@/components/ApiKeyStatusBadge";
import { SupportModal } from "@/components/SupportModal";
import { MobileTabBar } from "@/components/mobile/MobileTabBar";
import { ProfileDropdown } from "@/components/ProfileDropdown";
import { useIsMobile } from "@/hooks/use-mobile";

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
  { to: "/global-library", label: "Global Library", icon: "🌐" },
  { to: "/settings/appearance", label: "Appearance", icon: "🎨" },
  { to: "/settings", label: "General Settings", icon: "⚙" },
] as const;

export function SidebarLayout({
  children,
  pageTitle,
  topBarRight,
  onNewDocument,
}: SidebarLayoutProps) {
  const isMobile = useIsMobile();
  const matchRoute = useMatchRoute();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [supportOpen, setSupportOpen] = useState(false);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file && onNewDocument) onNewDocument(file);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const fileInput = (
    <input
      ref={fileInputRef}
      type="file"
      accept="application/pdf,.pdf"
      className="hidden"
      onChange={handleFileChange}
    />
  );

  if (isMobile) {
    return (
      <div className="flex h-dvh flex-col bg-background text-foreground">
        <header className="flex h-12 flex-shrink-0 items-center gap-2 border-b border-border bg-background/80 px-4 backdrop-blur-md">
          <div className="w-9 flex-shrink-0" />
          <h2 className="flex-1 truncate text-center text-base font-semibold tracking-tight text-foreground">
            {pageTitle}
          </h2>
          <ProfileDropdown />
        </header>

        <main className="flex-1 overflow-y-auto pb-24">{children}</main>

        {onNewDocument && (
          <>
            {fileInput}
            <button
              onClick={() => fileInputRef.current?.click()}
              className="fixed bottom-[calc(4.25rem+env(safe-area-inset-bottom))] right-4 z-40 flex h-14 w-14 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-xl transition-transform active:scale-95"
              aria-label="Add document"
            >
              <Plus className="h-6 w-6" />
            </button>
          </>
        )}

        <MobileTabBar />
        <SupportModal open={supportOpen} onOpenChange={setSupportOpen} />
      </div>
    );
  }

  return (
    <div className="flex h-dvh overflow-hidden bg-background text-foreground">
      {/* ──── Desktop Sidebar ──── */}
      <aside className="flex w-64 flex-shrink-0 flex-col border-r border-border bg-background">
        {/* Logo */}
        <div className="px-6 pt-8 pb-6">
          <Link to="/" className="flex items-center gap-3 group">
            <img
              src="/light_13746323.png"
              alt="Anuwad Logo"
              className="h-10 w-10 object-contain rounded-lg shadow-sm"
            />
            <div>
              <h1 className="text-lg font-bold tracking-tight text-foreground transition-colors group-hover:text-primary">
                Anuwad
              </h1>
              <p className="text-[11px] font-medium tracking-wide text-muted-foreground">
                AI Intelligence
              </p>
            </div>
          </Link>
        </div>

        {/* Navigation */}
        <nav className="flex flex-col gap-1 px-4">
          {NAV_ITEMS.map((item) => {
            const isActive =
              item.to === "/"
                ? !!matchRoute({ to: "/", fuzzy: false })
                : !!matchRoute({ to: item.to, fuzzy: true });

            return (
              <Link
                key={item.to}
                to={item.to}
                className={`flex items-center gap-3 rounded-lg px-4 py-2.5 text-sm font-semibold transition-all duration-200 ${
                  isActive
                    ? "bg-primary/10 text-primary"
                    : "text-muted-foreground hover:bg-surface-2/60 hover:text-foreground"
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
          {fileInput}
          <button
            onClick={() => fileInputRef.current?.click()}
            className="flex w-full items-center justify-center gap-2 rounded-full bg-primary py-3 px-4 text-sm font-semibold text-primary-foreground transition-all hover:opacity-90 active:scale-95 shadow-sm"
          >
            <span className="text-lg leading-none">+</span>
            New Document
          </button>
        </div>

        {/* Support & Legal Links */}
        <div className="border-t border-border px-4 py-3 space-y-1">
          <button
            onClick={() => setSupportOpen(true)}
            className="flex w-full items-center gap-3 rounded-lg px-4 py-2 text-sm text-muted-foreground transition-colors hover:text-primary"
          >
            <span className="text-base">❓</span>
            <span>Support & Feedback</span>
          </button>
          <div className="flex items-center justify-between px-4 pt-1 text-[11px] font-medium text-muted-foreground">
            <Link to="/privacy" className="hover:text-primary transition-colors">
              Privacy Policy
            </Link>
            <span>•</span>
            <Link to="/terms" className="hover:text-primary transition-colors">
              Terms of Service
            </Link>
          </div>
        </div>
      </aside>

      {/* ──── Main Content Area ──── */}
      <div className="flex flex-1 flex-col overflow-hidden">
        {/* Top Bar */}
        <header className="flex h-16 flex-shrink-0 items-center justify-between border-b border-border bg-background/80 px-8 backdrop-blur-md">
          <h2 className="text-2xl font-bold tracking-tight text-foreground">{pageTitle}</h2>
          <div className="flex items-center gap-4">
            {topBarRight}
            <ApiKeyStatusBadge />
            <ProfileDropdown />
          </div>
        </header>

        {/* Scrollable Content */}
        <main className="flex-1 overflow-y-auto">{children}</main>
      </div>

      <SupportModal open={supportOpen} onOpenChange={setSupportOpen} />
    </div>
  );
}
