import { useState, useRef, useEffect } from "react";
import { Zap, ChevronDown, Check, Languages, Sparkles, Sliders, Layers } from "lucide-react";
import {
  EXPLANATION_STYLES,
  TRANSLATION_STYLES,
  MODE_LABELS,
  type ProcessingStyle,
  type GlobalMode,
  type AiProvider,
} from "@/lib/openrouter";

interface AiPipelineDefaultsSectionProps {
  provider?: AiProvider;
  onProviderChange?: (provider: AiProvider) => void;
  openRouterStatus?: "connected" | "disconnected" | "checking";
  omniStatus?: "connected" | "disconnected" | "checking";
  ollamaStatus?: "connected" | "disconnected" | "checking";
  mode: GlobalMode;
  onModeChange: (mode: GlobalMode) => void;
  style: ProcessingStyle | string;
  onStyleChange: (style: ProcessingStyle) => void;
  temperature: number;
  onTemperatureChange: (temperature: number) => void;
}

const TEMP_PRESETS = [
  { value: 0.1, label: "0.1", desc: "Precise" },
  { value: 0.3, label: "0.3", desc: "Balanced" },
  { value: 0.7, label: "0.7", desc: "Creative" },
  { value: 1.0, label: "1.0", desc: "Diverse" },
];

export function AiPipelineDefaultsSection({
  mode,
  onModeChange,
  style,
  onStyleChange,
  temperature,
  onTemperatureChange,
}: AiPipelineDefaultsSectionProps) {
  const currentStyles = mode === "translate" ? TRANSLATION_STYLES : EXPLANATION_STYLES;

  const [styleOpen, setStyleOpen] = useState(false);
  const styleRef = useRef<HTMLDivElement>(null);

  // Close dropdown on click outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (styleRef.current && !styleRef.current.contains(event.target as Node)) {
        setStyleOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleModeChange = (newMode: GlobalMode) => {
    onModeChange(newMode);
    if (newMode === "translate") {
      if (!TRANSLATION_STYLES.some((s) => s.id === style)) {
        onStyleChange("Native");
      }
    } else {
      if (!EXPLANATION_STYLES.some((s) => s.id === style)) {
        onStyleChange("Standard");
      }
    }
  };

  const selectedStyleObj = currentStyles.find((s) => s.id === style) || currentStyles[0];

  return (
    <section className="glass-panel relative z-20 rounded-[18px] p-5 md:p-6 border border-border/70 bg-surface/40 backdrop-blur-md">
      {/* Header */}
      <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2.5">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <Zap className="h-4 w-4" />
          </div>
          <div>
            <h3 className="text-base font-semibold text-foreground tracking-tight">
              Translation &amp; Processing Defaults
            </h3>
            <p className="text-xs text-muted-foreground">
              Manage default reading mode, style, and AI response creativity.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 self-start sm:self-auto rounded-full border border-primary/25 bg-primary/10 px-3 py-1 text-xs font-semibold text-primary shadow-xs">
          <span className="relative flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary opacity-60" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-primary" />
          </span>
          <span>Engine: Managed AI (Default)</span>
        </div>
      </div>

      {/* 3-Column Control Grid */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        {/* 1. DEFAULT MODE */}
        <div className="flex flex-col gap-2 rounded-xl border border-border/50 bg-background/40 p-3.5">
          <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground flex items-center justify-between">
            <span>Default Mode</span>
          </span>

          <div className="flex flex-col gap-2">
            {(Object.keys(MODE_LABELS) as GlobalMode[]).map((key) => {
              const isSelected = mode === key;
              const Icon = key === "translate" ? Languages : Sparkles;

              return (
                <button
                  key={key}
                  type="button"
                  id={`mode-select-${key}`}
                  onClick={() => handleModeChange(key)}
                  className={`flex w-full items-center justify-between rounded-lg px-3 py-2.5 text-xs transition-all duration-150 cursor-pointer ${
                    isSelected
                      ? "border border-primary/50 bg-primary/10 text-foreground font-semibold shadow-sm ring-1 ring-primary/30"
                      : "border border-border/50 bg-surface-elevated/40 text-foreground font-medium hover:border-border hover:bg-surface-elevated"
                  }`}
                >
                  <div className="flex items-center gap-2.5 truncate">
                    <Icon
                      className={`h-4 w-4 shrink-0 ${
                        isSelected ? "text-primary" : "text-muted-foreground"
                      }`}
                    />
                    <span className="truncate">{MODE_LABELS[key]}</span>
                  </div>
                  {isSelected && <Check className="h-4 w-4 text-primary shrink-0 ml-1.5" />}
                </button>
              );
            })}
          </div>
        </div>

        {/* 2. STYLE */}
        <div
          className={`relative flex flex-col justify-between gap-2 rounded-xl border border-border/50 bg-background/40 p-3.5 ${
            styleOpen ? "z-40" : "z-10"
          }`}
          ref={styleRef}
        >
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
              {mode === "translate" ? "Translation Style" : "Explanation Style"}
            </span>
          </div>

          <div className="relative">
            <button
              type="button"
              id="style-dropdown-btn"
              onClick={() => setStyleOpen((v) => !v)}
              className={`flex w-full items-center justify-between rounded-lg border bg-surface-elevated/40 px-3 py-2.5 text-xs text-foreground font-semibold transition-all duration-150 outline-none cursor-pointer ${
                styleOpen
                  ? "border-primary ring-1 ring-primary/30 shadow-sm"
                  : "border-border/50 hover:border-border hover:bg-surface-elevated"
              }`}
            >
              <div className="flex items-center gap-2 truncate">
                <Layers className="h-4 w-4 text-primary shrink-0" />
                <span className="font-semibold text-foreground truncate">
                  {selectedStyleObj?.label || style}
                </span>
              </div>
              <ChevronDown
                className={`h-4 w-4 shrink-0 text-muted-foreground transition-transform duration-200 ${
                  styleOpen ? "rotate-180 text-primary" : ""
                }`}
              />
            </button>

            {/* Dropdown Menu */}
            {styleOpen && (
              <div className="absolute left-0 right-0 top-full z-50 mt-1.5 max-h-56 overflow-y-auto rounded-xl border border-border bg-popover p-1 shadow-2xl backdrop-blur-xl animate-in fade-in-0 zoom-in-95">
                <div className="space-y-0.5">
                  {currentStyles.map((s) => {
                    const isSelected = style === s.id;
                    const isPopular = s.id === "Story";

                    return (
                      <button
                        key={s.id}
                        type="button"
                        onClick={() => {
                          onStyleChange(s.id as ProcessingStyle);
                          setStyleOpen(false);
                        }}
                        className={`flex w-full items-center justify-between rounded-lg px-2.5 py-2 text-left text-xs transition-all cursor-pointer ${
                          isSelected
                            ? "bg-primary/15 text-foreground font-semibold border border-primary/20"
                            : "text-foreground font-medium hover:bg-surface-elevated"
                        }`}
                      >
                        <div className="flex items-center gap-1.5 min-w-0">
                          <span className="truncate">{s.label}</span>
                          {isPopular && (
                            <span className="shrink-0 rounded-full bg-amber-500/15 border border-amber-500/30 px-1.5 py-0.5 text-[8px] font-bold text-amber-600 dark:text-amber-400 leading-none shadow-xs">
                              Popular
                            </span>
                          )}
                        </div>
                        {isSelected && (
                          <Check className="h-3.5 w-3.5 text-primary shrink-0 ml-1.5" />
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          <div className="text-[10px] text-muted-foreground truncate">
            {mode === "translate"
              ? style === "Mixed"
                ? "Bilingual English blend"
                : "Fluent natural phrasing"
              : style === "Simple"
                ? "Beginner-friendly ELI5"
                : style === "Story"
                  ? "Narrative & scenario"
                  : style === "Deep"
                    ? "In-depth technical breakdown"
                    : style === "AI"
                      ? "Structured AI synthesis"
                      : "Balanced general overview"}
          </div>
        </div>

        {/* 3. TEMPERATURE */}
        <div className="flex flex-col justify-between gap-2 rounded-xl border border-border/50 bg-background/40 p-3.5">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
              <Sliders className="h-3 w-3 text-primary" />
              <span>Creativity / Temp</span>
            </span>
            <span className="rounded-md bg-primary/10 px-1.5 py-0.5 text-[11px] font-mono font-semibold text-primary border border-primary/20">
              {temperature.toFixed(2)}
            </span>
          </div>

          <div className="space-y-2">
            <input
              type="range"
              min={0}
              max={1.5}
              step={0.05}
              id="temperature-slider"
              value={temperature}
              onChange={(e) => onTemperatureChange(parseFloat(e.target.value))}
              className="w-full accent-primary cursor-pointer h-1.5"
            />

            {/* Quick Presets */}
            <div className="flex items-center justify-between gap-1">
              {TEMP_PRESETS.map((p) => {
                const isSelected = Math.abs(temperature - p.value) < 0.05;
                return (
                  <button
                    key={p.value}
                    type="button"
                    onClick={() => onTemperatureChange(p.value)}
                    className={`flex-1 rounded-md py-1 text-center text-[10px] transition-all cursor-pointer ${
                      isSelected
                        ? "bg-primary text-primary-foreground font-semibold shadow-xs"
                        : "bg-surface-elevated/40 text-foreground font-medium hover:bg-surface-elevated border border-border/40"
                    }`}
                    title={`${p.label} - ${p.desc}`}
                  >
                    {p.desc}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
