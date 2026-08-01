import { Zap } from "lucide-react";
import { EXPLANATION_STYLES, MODE_INSTRUCTIONS, type ExplanationStyle, type GlobalMode } from "@/lib/openrouter";

interface AiPipelineDefaultsSectionProps {
  mode: GlobalMode;
  onModeChange: (mode: GlobalMode) => void;
  style: ExplanationStyle;
  onStyleChange: (style: ExplanationStyle) => void;
  temperature: number;
  onTemperatureChange: (temperature: number) => void;
}

export function AiPipelineDefaultsSection({
  mode,
  onModeChange,
  style,
  onStyleChange,
  temperature,
  onTemperatureChange,
}: AiPipelineDefaultsSectionProps) {
  return (
    <section className="glass-panel rounded-[18px] p-4 md:p-6">
      <div className="mb-6 flex items-center gap-3">
        <Zap className="h-5 w-5 text-accent" />
        <h3 className="text-lg font-semibold text-foreground">AI Pipeline Defaults</h3>
      </div>
      <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
        {/* Default Mode */}
        <div className="flex flex-col gap-2">
          <label className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
            Default Mode
          </label>
          <select
            value={mode}
            onChange={(e) => onModeChange(e.target.value as GlobalMode)}
            className="w-full cursor-pointer rounded-[10px] border border-border bg-background px-3 py-2 text-sm outline-none transition-colors focus:border-primary"
          >
            {Object.entries(MODE_INSTRUCTIONS).map(([k, v]) => (
              <option key={k} value={k}>
                {v.label}
              </option>
            ))}
          </select>
        </div>

        {/* Tone Style */}
        <div className="flex flex-col gap-2">
          <label className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
            Tone Style {mode === "translate" ? "(ignored in translate)" : ""}
          </label>
          <select
            value={style}
            disabled={mode === "translate"}
            onChange={(e) => onStyleChange(e.target.value as ExplanationStyle)}
            className="w-full cursor-pointer rounded-[10px] border border-border bg-background px-3 py-2 text-sm outline-none transition-colors focus:border-primary disabled:opacity-50"
          >
            {EXPLANATION_STYLES.map((s) => (
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
