import { Link, useMatchRoute } from "@tanstack/react-router";
import { Library, Globe, Palette, Settings } from "lucide-react";

const TABS = [
  { to: "/library", label: "Library", icon: Library },
  { to: "/global-library", label: "Global", icon: Globe },
  { to: "/settings/appearance", label: "Appearance", icon: Palette },
  { to: "/settings", label: "Settings", icon: Settings },
] as const;

/** Persistent bottom tab bar — primary app navigation on mobile, replacing
 * the desktop sidebar's hamburger + slide-in drawer. Fixed, full-width,
 * distinct from the floating contextual-control pill used in the reader. */
export function MobileTabBar() {
  const matchRoute = useMatchRoute();

  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 flex items-stretch border-t border-border bg-surface/90 pb-[env(safe-area-inset-bottom)] backdrop-blur-xl">
      {TABS.map((tab) => {
        const isActive =
          tab.to === "/"
            ? !!matchRoute({ to: "/", fuzzy: false })
            : !!matchRoute({ to: tab.to, fuzzy: true });
        const Icon = tab.icon;
        return (
          <Link
            key={tab.to}
            to={tab.to}
            className="flex flex-1 flex-col items-center justify-center gap-0.5 py-2.5 active:scale-95 transition-transform"
          >
            <Icon
              className={`h-5 w-5 ${isActive ? "text-primary" : "text-muted-foreground"}`}
              strokeWidth={isActive ? 2.25 : 2}
            />
            <span
              className={`text-[10px] font-medium ${isActive ? "text-primary" : "text-muted-foreground"}`}
            >
              {tab.label}
            </span>
          </Link>
        );
      })}
    </nav>
  );
}
