import { useEffect, useState } from "react";
import { Check, Monitor, Moon, Palette, Sun } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  LIGHT_THEMES,
  DARK_THEMES,
  getTheme,
  setTheme,
  applyTheme,
  type ThemeDefinition,
} from "@/lib/theme";
import { toast } from "sonner";

interface ThemeSelectionModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onThemeChange?: (themeId: string) => void;
}

type FilterTab = "all" | "light" | "dark";

export function ThemeSelectionModal({
  open,
  onOpenChange,
  onThemeChange,
}: ThemeSelectionModalProps) {
  const [currentThemeId, setCurrentThemeId] = useState("system");
  const [tab, setTab] = useState<FilterTab>("all");

  useEffect(() => {
    if (open) {
      setCurrentThemeId(getTheme());
    }
  }, [open]);

  const handleSelectTheme = (themeId: string) => {
    setCurrentThemeId(themeId);
    setTheme(themeId);
    applyTheme(themeId);
    onThemeChange?.(themeId);

    const themeName =
      themeId === "system"
        ? "System Default"
        : [...LIGHT_THEMES, ...DARK_THEMES].find((t) => t.id === themeId)?.label ||
          themeId.charAt(0).toUpperCase() + themeId.slice(1);

    toast.success(`Theme switched to ${themeName}`);
  };

  const SwatchDot = ({ color }: { color: string }) => (
    <span
      className="inline-block h-3.5 w-3.5 rounded-full border border-black/10 dark:border-white/10 shadow-2xs"
      style={{ backgroundColor: color }}
    />
  );

  const renderThemeCard = (theme: ThemeDefinition) => {
    const isSelected = currentThemeId === theme.id;
    return (
      <button
        key={theme.id}
        type="button"
        onClick={() => handleSelectTheme(theme.id)}
        className={`group relative flex flex-col justify-between rounded-xl border p-3.5 text-left transition-all duration-200 cursor-pointer active:scale-[0.98] ${
          isSelected
            ? "border-primary bg-primary/10 shadow-sm ring-1 ring-primary/40"
            : "border-border/60 bg-surface/50 hover:border-border-strong hover:bg-surface-2"
        }`}
      >
        <div className="flex items-center justify-between w-full mb-3">
          <span
            className={`text-sm font-semibold tracking-tight ${
              isSelected ? "text-primary font-bold" : "text-foreground"
            }`}
          >
            {theme.label}
          </span>
          {isSelected && (
            <span className="flex h-5 w-5 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-xs">
              <Check className="h-3 w-3 stroke-[3]" />
            </span>
          )}
        </div>

        {/* Swatch preview */}
        <div className="flex items-center justify-between gap-1.5 rounded-lg border border-border/40 bg-background/60 p-1.5 px-2">
          <div className="flex items-center gap-1.5">
            {theme.swatches.map((color, i) => (
              <SwatchDot key={i} color={color} />
            ))}
          </div>
          <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            {theme.mode}
          </span>
        </div>
      </button>
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] flex flex-col border-border bg-background shadow-2xl p-0 overflow-hidden sm:rounded-2xl">
        {/* Header */}
        <DialogHeader className="p-6 pb-4 border-b border-border/40 text-left shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <Palette className="h-5 w-5" />
            </div>
            <div>
              <DialogTitle className="text-lg font-bold tracking-tight text-foreground">
                Workspace Themes
              </DialogTitle>
              <DialogDescription className="text-xs text-muted-foreground mt-0.5">
                Personalize your workspace palette, contrast, and visual accents.
              </DialogDescription>
            </div>
          </div>

          {/* Filter Tabs */}
          <div className="flex items-center gap-1.5 mt-4 pt-2">
            <button
              type="button"
              onClick={() => setTab("all")}
              className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition-all cursor-pointer ${
                tab === "all"
                  ? "bg-primary text-primary-foreground shadow-xs"
                  : "bg-surface-2 text-muted-foreground hover:text-foreground hover:bg-surface-2/80"
              }`}
            >
              All Themes
            </button>
            <button
              type="button"
              onClick={() => setTab("light")}
              className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition-all cursor-pointer ${
                tab === "light"
                  ? "bg-primary text-primary-foreground shadow-xs"
                  : "bg-surface-2 text-muted-foreground hover:text-foreground hover:bg-surface-2/80"
              }`}
            >
              <Sun className="h-3.5 w-3.5" />
              Light ({LIGHT_THEMES.length})
            </button>
            <button
              type="button"
              onClick={() => setTab("dark")}
              className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition-all cursor-pointer ${
                tab === "dark"
                  ? "bg-primary text-primary-foreground shadow-xs"
                  : "bg-surface-2 text-muted-foreground hover:text-foreground hover:bg-surface-2/80"
              }`}
            >
              <Moon className="h-3.5 w-3.5" />
              Dark ({DARK_THEMES.length})
            </button>
          </div>
        </DialogHeader>

        {/* Scrollable Theme Content */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {/* SYSTEM PREFERENCE (Visible in All or Light/Dark) */}
          {tab === "all" && (
            <section className="space-y-2.5">
              <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                <Monitor className="h-3.5 w-3.5" />
                Automatic Mode
              </span>
              <button
                type="button"
                onClick={() => handleSelectTheme("system")}
                className={`flex w-full items-center justify-between rounded-xl border p-3.5 text-left transition-all duration-200 cursor-pointer active:scale-[0.99] ${
                  currentThemeId === "system"
                    ? "border-primary bg-primary/10 shadow-sm ring-1 ring-primary/40"
                    : "border-border/60 bg-surface/50 hover:border-border-strong hover:bg-surface-2"
                }`}
              >
                <div className="flex items-center gap-3.5">
                  <div
                    className={`flex h-9 w-9 items-center justify-center rounded-lg border ${
                      currentThemeId === "system"
                        ? "border-primary/50 bg-primary/20 text-primary"
                        : "border-border/60 bg-surface-2 text-muted-foreground"
                    }`}
                  >
                    <Monitor className="h-5 w-5" />
                  </div>
                  <div>
                    <span
                      className={`text-sm font-semibold ${
                        currentThemeId === "system"
                          ? "text-primary font-bold"
                          : "text-foreground"
                      }`}
                    >
                      System Default
                    </span>
                    <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">
                      Automatically syncs with your operating system light / dark preferences
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  <div className="hidden sm:flex gap-1.5 bg-background/60 p-1.5 rounded-lg border border-border/40">
                    <SwatchDot color="#ffffff" />
                    <SwatchDot color="#0066cc" />
                    <SwatchDot color="#0f172a" />
                  </div>
                  {currentThemeId === "system" && (
                    <span className="flex h-5 w-5 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-xs">
                      <Check className="h-3 w-3 stroke-[3]" />
                    </span>
                  )}
                </div>
              </button>
            </section>
          )}

          {/* LIGHT THEMES */}
          {(tab === "all" || tab === "light") && (
            <section className="space-y-3">
              <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                <Sun className="h-3.5 w-3.5" />
                Light Themes
              </span>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 md:grid-cols-3">
                {LIGHT_THEMES.map((theme) => renderThemeCard(theme))}
              </div>
            </section>
          )}

          {/* DARK THEMES */}
          {(tab === "all" || tab === "dark") && (
            <section className="space-y-3">
              <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                <Moon className="h-3.5 w-3.5" />
                Dark Themes
              </span>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 md:grid-cols-3">
                {DARK_THEMES.map((theme) => renderThemeCard(theme))}
              </div>
            </section>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
