import { Languages, Search } from "lucide-react";
import { LANGUAGES } from "@/lib/voiceLanguageMap";

interface OutputLanguageSectionProps {
  language: string;
  customLang: string;
  onCustomLangChange: (value: string) => void;
  onCustomLangSubmit: () => void;
  onLangSelect: (id: string) => void;
}

export function OutputLanguageSection({
  language,
  customLang,
  onCustomLangChange,
  onCustomLangSubmit,
  onLangSelect,
}: OutputLanguageSectionProps) {
  return (
    <section className="glass-panel flex flex-col gap-4 rounded-[18px] p-4 md:p-6">
      <div className="flex items-center gap-3">
        <Languages className="h-5 w-5 text-primary" />
        <h3 className="text-lg font-semibold text-foreground">Output Language</h3>
      </div>
      <p className="text-sm text-muted-foreground">
        Default language for AI-generated summaries, translations, and text-to-speech.
      </p>
      <div className="relative">
        <input
          value={customLang}
          onChange={(e) => onCustomLangChange(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && onCustomLangSubmit()}
          placeholder="Search or type a custom language..."
          className="w-full rounded-[10px] border border-border bg-background py-2 pl-10 pr-4 text-sm outline-none transition-colors focus:border-primary"
        />
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
      </div>
      {/* Language Cards Grid */}
      <div
        className="grid gap-3 md:max-h-[480px] md:overflow-y-auto md:pr-1"
        style={{ gridTemplateColumns: "repeat(auto-fill, minmax(130px, 1fr))" }}
      >
        {LANGUAGES.filter((l) => {
          if (!customLang.trim()) return true;
          const q = customLang.trim().toLowerCase();
          return (
            l.native.toLowerCase().includes(q) ||
            l.english.toLowerCase().includes(q) ||
            l.id.toLowerCase().includes(q)
          );
        }).map((l) => {
          const isSelected = language === l.id;
          return (
            <button
              key={l.id}
              onClick={() => onLangSelect(l.id)}
              className={`group relative flex flex-col items-center justify-center gap-1 rounded-[16px] border px-3 py-4 text-center transition-all duration-300 active:scale-[0.97] hover:shadow-lg ${
                isSelected
                  ? "border-primary/50 bg-primary/10 ring-1 ring-primary/30 shadow-[0_0_20px_-4px] shadow-primary/25"
                  : "border-border bg-surface/30 hover:border-border-strong hover:bg-surface/60"
              }`}
            >
              <span
                className={`text-lg font-bold leading-tight transition-transform duration-300 group-hover:scale-105 ${
                  isSelected ? "text-primary" : "text-foreground"
                }`}
              >
                {l.native}
              </span>
              <span
                className={`text-[10px] font-semibold uppercase tracking-wider transition-colors duration-300 ${
                  isSelected
                    ? "text-primary/80"
                    : "text-muted-foreground group-hover:text-foreground/75"
                }`}
              >
                {l.english}
              </span>
              {isSelected && (
                <span className="absolute -top-1 -right-1 flex h-4.5 w-4.5 items-center justify-center rounded-full bg-primary text-[10px] text-primary-foreground shadow-md font-bold">
                  ✓
                </span>
              )}
            </button>
          );
        })}
      </div>
    </section>
  );
}
