import { Zap } from "lucide-react";
import {
  EXPLANATION_STYLES,
  TRANSLATION_STYLES,
  MODE_LABELS,
  isOmniRouterConfigured,
  type ExplanationStyle,
  type TranslationStyle,
  type ProcessingStyle,
  type GlobalMode,
  type AiProvider,
} from "@/lib/openrouter";

interface AiPipelineDefaultsSectionProps {
  provider?: AiProvider;
  onProviderChange?: (provider: AiProvider) => void;
  mode: GlobalMode;
  onModeChange: (mode: GlobalMode) => void;
  style: ProcessingStyle | string;
  onStyleChange: (style: ProcessingStyle) => void;
  temperature: number;
  onTemperatureChange: (temperature: number) => void;
}

export function AiPipelineDefaultsSection({
  provider = "openrouter",
  onProviderChange,
  mode,
  onModeChange,
  style,
  onStyleChange,
  temperature,
  onTemperatureChange,
}: AiPipelineDefaultsSectionProps) {
  const currentStyles = mode === "translate" ? TRANSLATION_STYLES : EXPLANATION_STYLES;
  const isOmniConfigured = isOmniRouterConfigured();

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

  return (
    <section className="glass-panel rounded-[18px] p-4 md:p-6">
      <div className="mb-6 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Zap className="h-5 w-5 text-accent" />
          <h3 className="text-lg font-semibold text-foreground">
            Translation & Processing Defaults
          </h3>
        </div>
      </div>
      <div
        className={`grid grid-cols-1 gap-6 ${isOmniConfigured ? "sm:grid-cols-2 lg:grid-cols-4" : "md:grid-cols-3"}`}
      >
        {/* AI Provider (Only when OmniRouter is configured) */}
        {isOmniConfigured && (
          <div className="flex flex-col gap-2">
            <label className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
              AI Provider
            </label>
            <select
              value={provider}
              onChange={(e) => onProviderChange?.(e.target.value as AiProvider)}
              className="w-full cursor-pointer rounded-[10px] border border-border bg-background px-3 py-2 text-sm outline-none transition-colors focus:border-primary"
            >
              <option value="openrouter">OpenRouter (Default)</option>
              <option value="omnirouter">OmniRouter (Local)</option>
            </select>
          </div>
        )}

        {/* Default Mode */}
        <div className="flex flex-col gap-2">
          <label className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
            Default Mode
          </label>
          <select
            value={mode}
            onChange={(e) => handleModeChange(e.target.value as GlobalMode)}
            className="w-full cursor-pointer rounded-[10px] border border-border bg-background px-3 py-2 text-sm outline-none transition-colors focus:border-primary"
          >
            {Object.entries(MODE_LABELS).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
        </div>

        {/* Style */}
        <div className="flex flex-col gap-2">
          <label className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
            {mode === "translate" ? "Translation Style" : "Explanation Style"}
          </label>
          <select
            value={style}
            onChange={(e) => onStyleChange(e.target.value as ProcessingStyle)}
            className="w-full cursor-pointer rounded-[10px] border border-border bg-background px-3 py-2 text-sm outline-none transition-colors focus:border-primary"
          >
            {currentStyles.map((s) => (
              <option key={s.id} value={s.id}>
                {s.label}
              </option>
            ))}
          </select>
        </div>

        {/* Temperature */}
        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <label className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
              Temperature
            </label>
            <span className="text-sm font-semibold text-accent">{temperature.toFixed(1)}</span>
          </div>
          <input
            type="range"
            min={0}
            max={1.5}
            step={0.05}
            value={temperature}
            onChange={(e) => onTemperatureChange(parseFloat(e.target.value))}
            className="mt-2 w-full"
          />
          <div className="flex justify-between text-[10px] uppercase text-muted-foreground">
            <span>Precise</span>
            <span>Creative</span>
          </div>
        </div>
      </div>
    </section>
  );
}
