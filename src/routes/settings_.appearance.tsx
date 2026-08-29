import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { SidebarLayout } from "@/components/SidebarLayout";
import { createDoc, StorageError } from "@/lib/storage";
import { toast } from "sonner";
import {
  LIGHT_THEMES,
  DARK_THEMES,
  getTheme,
  setTheme,
  applyTheme,
  type ThemeDefinition,
} from "@/lib/theme";

export const Route = createFileRoute("/settings_/appearance")({
  component: AppearanceSettingsPage,
  head: () => ({
    meta: [
      { title: "Anuwad — Appearance & Theme" },
      {
        name: "description",
        content:
          "Customize Anuwad's look and feel with light and dark themes, including the Deep Ocean design system.",
      },
      { property: "og:title", content: "Anuwad — Appearance & Theme" },
      {
        property: "og:description",
        content: "Customize Anuwad's look and feel with light and dark themes.",
      },
      { property: "og:url", content: "https://www.anuwad.com/settings/appearance" },
      { property: "og:type", content: "website" },
    ],
    links: [{ rel: "canonical", href: "https://www.anuwad.com/settings/appearance" }],
  }),
});

function AppearanceSettingsPage() {
  const navigate = useNavigate();
  const [currentThemeId, setCurrentThemeId] = useState("system");

  useEffect(() => {
    setCurrentThemeId(getTheme());
  }, []);

  const handleSelectTheme = (themeId: string) => {
    setCurrentThemeId(themeId);
    setTheme(themeId);
    applyTheme(themeId);
    toast.success(
      `Theme updated to ${themeId === "system" ? "System Default" : themeId.charAt(0).toUpperCase() + themeId.slice(1)}`,
    );
  };

  const handleNewDocument = async (f: File) => {
    try {
      const buf = await f.arrayBuffer();
      const rec = await createDoc(f, buf);
      toast.success(`"${f.name}" added to library.`);
      navigate({ to: "/doc/$id", params: { id: rec.id } });
    } catch (e) {
      if (e instanceof StorageError && e.code === "QUOTA_EXCEEDED") {
        toast.error(e.message);
      } else {
        toast.error("Failed to save document. Please try again.");
        console.error(e);
      }
    }
  };

  // Swatch color classes helper
  const SwatchDot = ({ color }: { color: string }) => (
    <span
      className="inline-block h-3.5 w-3.5 rounded-full border border-black/10 dark:border-white/10"
      style={{ backgroundColor: color }}
    />
  );

  return (
    <SidebarLayout pageTitle="Appearance Settings" onNewDocument={handleNewDocument}>
      <div className="mx-auto max-w-7xl space-y-8 p-8 pb-28">
        {/* Page Header */}
        <header className="hidden md:block">
          <h3 className="text-3xl font-bold tracking-tight text-foreground">Appearance Settings</h3>
          <p className="mt-1 text-sm text-muted-foreground">
            Customize the look and feel of your workspace.
          </p>
        </header>

        {/* SYSTEM DEFAULT */}
        <section className="space-y-4">
          <div className="flex items-center gap-2 border-b border-border/40 pb-2">
            <span className="text-lg">🖥️</span>
            <h4 className="text-sm font-bold uppercase tracking-wider text-muted-foreground">
              System preference
            </h4>
          </div>
          <button
            onClick={() => handleSelectTheme("system")}
            className={`flex w-full items-center justify-between rounded-[14px] border p-4 text-left transition-all active:scale-[0.99] ${
              currentThemeId === "system"
                ? "border-primary bg-primary/5 ring-1 ring-primary"
                : "border-border bg-card hover:bg-surface-2"
            }`}
          >
            <div className="flex items-center gap-4">
              <div
                className={`flex h-10 w-10 items-center justify-center rounded-[10px] border ${
                  currentThemeId === "system"
                    ? "border-primary bg-primary/20"
                    : "border-border bg-surface-2"
                }`}
              >
                <span className="text-lg">🌓</span>
              </div>
              <div>
                <span className="text-base font-bold text-foreground">System Default</span>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Automatically switches to light mode during the day and dark mode in the
                  evening/night, based on your device's clock
                </p>
              </div>
            </div>

            <div className="flex items-center gap-6">
              <div className="flex gap-1.5 bg-background/50 p-2 rounded-lg">
                {/* Generic Swatch for System representation */}
                <SwatchDot color="#ffffff" />
                <SwatchDot color="#e2e8f0" />
                <SwatchDot color="#ef4444" />
                <SwatchDot color="#3b82f6" />
                <SwatchDot color="#0f172a" />
              </div>
              {currentThemeId === "system" && (
                <span className="text-primary text-xl font-bold">✓</span>
              )}
            </div>
          </button>
        </section>

        {/* LIGHT THEMES */}
        <section className="space-y-4">
          <div className="flex items-center gap-2 border-b border-border/40 pb-2">
            <span className="text-lg">☀️</span>
            <h4 className="text-sm font-bold uppercase tracking-wider text-muted-foreground">
              Light Themes
            </h4>
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {LIGHT_THEMES.map((theme) => {
              const active = currentThemeId === theme.id;
              return (
                <button
                  key={theme.id}
                  onClick={() => handleSelectTheme(theme.id)}
                  className={`flex items-center justify-between rounded-[14px] border p-4 text-left transition-all active:scale-[0.99] ${
                    active
                      ? "border-primary bg-primary/5 ring-1 ring-primary"
                      : "border-border bg-card hover:bg-surface-2"
                  }`}
                >
                  <div className="flex items-center gap-4">
                    <div
                      className={`flex h-10 w-10 items-center justify-center rounded-[10px] border ${
                        active ? "border-primary bg-primary/20" : "border-border bg-surface-2"
                      }`}
                    >
                      <span className="text-lg">🎨</span>
                    </div>
                    <span className="text-base font-bold text-foreground">{theme.label}</span>
                  </div>

                  <div className="flex items-center gap-6">
                    <div className="flex gap-1.5 bg-black/5 p-1.5 rounded-lg">
                      {theme.swatches.map((color, i) => (
                        <SwatchDot key={i} color={color} />
                      ))}
                    </div>
                    {active && <span className="text-primary text-xl font-bold">✓</span>}
                  </div>
                </button>
              );
            })}
          </div>
        </section>

        {/* DARK THEMES */}
        <section className="space-y-4">
          <div className="flex items-center gap-2 border-b border-border/40 pb-2">
            <span className="text-lg">🌙</span>
            <h4 className="text-sm font-bold uppercase tracking-wider text-muted-foreground">
              Dark Themes
            </h4>
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {DARK_THEMES.map((theme) => {
              const active = currentThemeId === theme.id;
              return (
                <button
                  key={theme.id}
                  onClick={() => handleSelectTheme(theme.id)}
                  className={`flex items-center justify-between rounded-[14px] border p-4 text-left transition-all active:scale-[0.99] ${
                    active
                      ? "border-primary bg-primary/5 ring-1 ring-primary"
                      : "border-border bg-card hover:bg-surface-2"
                  }`}
                >
                  <div className="flex items-center gap-4">
                    <div
                      className={`flex h-10 w-10 items-center justify-center rounded-[10px] border ${
                        active ? "border-primary bg-primary/20" : "border-border bg-surface-2"
                      }`}
                    >
                      <span className="text-lg">🎨</span>
                    </div>
                    <span className="text-base font-bold text-foreground">{theme.label}</span>
                  </div>

                  <div className="flex items-center gap-6">
                    <div className="flex gap-1.5 bg-white/5 p-1.5 rounded-lg">
                      {theme.swatches.map((color, i) => (
                        <SwatchDot key={i} color={color} />
                      ))}
                    </div>
                    {active && <span className="text-primary text-xl font-bold">✓</span>}
                  </div>
                </button>
              );
            })}
          </div>
        </section>
      </div>
    </SidebarLayout>
  );
}
