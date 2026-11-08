import { useState } from "react";
import { ChevronRight, Globe, Languages, Search } from "lucide-react";
import { LANGUAGES, type LanguageInfo } from "@/lib/voiceLanguageMap";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface OutputLanguageSectionProps {
  language: string;
  customLang: string;
  onCustomLangChange: (value: string) => void;
  onCustomLangSubmit: () => void;
  onLangSelect: (id: string) => void;
}

type CategoryKey = "indian" | "foreign";

/** Language ids (from LANGUAGES) that belong to the "Indian Languages" group. */
const INDIAN_LANGUAGE_IDS = new Set([
  "हिंदी",
  "বাংলা",
  "मराठी",
  "తెలుగు",
  "தமிழ்",
  "ગુજરાતી",
  "ಕನ್ನಡ",
  "മലയാളം",
  "ਪੰਜਾਬੀ",
  "ଓଡ଼ିଆ",
  "اردو",
  "অসমীয়া",
]);

const CATEGORIES: Record<
  CategoryKey,
  { title: string; subtitle: string; icon: typeof Languages; languages: LanguageInfo[] }
> = {
  indian: {
    title: "Indian Languages",
    subtitle: "हिंदी, বাংলা, தமிழ், తెలుగు…",
    icon: Languages,
    languages: LANGUAGES.filter((l) => INDIAN_LANGUAGE_IDS.has(l.id)),
  },
  foreign: {
    title: "Foreign Languages",
    subtitle: "English, Español, Français, 日本語…",
    icon: Globe,
    languages: LANGUAGES.filter((l) => !INDIAN_LANGUAGE_IDS.has(l.id)).sort((a, b) =>
      a.english.localeCompare(b.english),
    ),
  },
};

function LanguageCard({
  lang,
  isSelected,
  onClick,
}: {
  lang: LanguageInfo;
  isSelected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
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
        {lang.native}
      </span>
      <span
        className={`text-[10px] font-semibold uppercase tracking-wider transition-colors duration-300 ${
          isSelected ? "text-primary/80" : "text-muted-foreground group-hover:text-foreground/75"
        }`}
      >
        {lang.english}
      </span>
      {isSelected && (
        <span className="absolute -top-1 -right-1 flex h-4.5 w-4.5 items-center justify-center rounded-full bg-primary text-[10px] text-primary-foreground shadow-md font-bold">
          ✓
        </span>
      )}
    </button>
  );
}

const GRID_STYLE = { gridTemplateColumns: "repeat(auto-fill, minmax(130px, 1fr))" };

export function OutputLanguageSection({
  language,
  customLang,
  onCustomLangChange,
  onCustomLangSubmit,
  onLangSelect,
}: OutputLanguageSectionProps) {
  const [openCategory, setOpenCategory] = useState<CategoryKey | null>(null);

  const query = customLang.trim().toLowerCase();
  const searchResults = query
    ? LANGUAGES.filter(
        (l) =>
          l.native.toLowerCase().includes(query) ||
          l.english.toLowerCase().includes(query) ||
          l.id.toLowerCase().includes(query),
      )
    : [];

  const selectedInfo = LANGUAGES.find((l) => l.id === language);
  const selectedCategory: CategoryKey | null = selectedInfo
    ? INDIAN_LANGUAGE_IDS.has(selectedInfo.id)
      ? "indian"
      : "foreign"
    : null;

  const activeCategory = openCategory ? CATEGORIES[openCategory] : null;

  return (
    <section className="glass-panel flex flex-col gap-4 rounded-[18px] p-4 md:p-6">
      <div className="flex items-center gap-3">
        <Languages className="h-5 w-5 text-primary" />
        <h3 className="text-lg font-semibold text-foreground">Mother Tongue</h3>
      </div>
      <p className="text-sm text-muted-foreground">
        Select your mother tongue for AI translations, explanations, and text-to-speech.
      </p>

      {/* Current selection */}
      {language && (
        <div className="flex items-center justify-between gap-3 rounded-[12px] border border-primary/30 bg-primary/5 px-4 py-3">
          <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Selected
          </span>
          <span className="truncate text-sm font-semibold text-primary">
            {selectedInfo ? `${selectedInfo.native} · ${selectedInfo.english}` : language}
          </span>
        </div>
      )}

      <div className="relative">
        <input
          value={customLang}
          onChange={(e) => onCustomLangChange(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && onCustomLangSubmit()}
          placeholder="Search your mother tongue (Hindi, Telugu, Bengali...)"
          className="w-full rounded-[10px] border border-border bg-background py-2 pl-10 pr-4 text-sm outline-none transition-colors focus:border-primary"
        />
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
      </div>

      {query ? (
        searchResults.length > 0 ? (
          <div className="grid gap-3" style={GRID_STYLE}>
            {searchResults.map((l) => (
              <LanguageCard
                key={l.id}
                lang={l}
                isSelected={language === l.id}
                onClick={() => onLangSelect(l.id)}
              />
            ))}
          </div>
        ) : (
          <p className="text-xs text-muted-foreground">
            No match. Press Enter to use “{customLang.trim()}” as your language.
          </p>
        )
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {(Object.keys(CATEGORIES) as CategoryKey[]).map((key) => {
            const cat = CATEGORIES[key];
            const Icon = cat.icon;
            const isActive = selectedCategory === key;
            return (
              <button
                key={key}
                type="button"
                onClick={() => setOpenCategory(key)}
                className={`group flex items-center gap-3 rounded-[16px] border px-4 py-4 text-left transition-all duration-300 active:scale-[0.98] hover:shadow-lg ${
                  isActive
                    ? "border-primary/50 bg-primary/10 ring-1 ring-primary/30"
                    : "border-border bg-surface/30 hover:border-border-strong hover:bg-surface/60"
                }`}
              >
                <span
                  className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${
                    isActive ? "bg-primary/20 text-primary" : "bg-surface/60 text-muted-foreground"
                  }`}
                >
                  <Icon className="h-5 w-5" />
                </span>
                <span className="flex min-w-0 flex-1 flex-col">
                  <span
                    className={`text-sm font-semibold ${isActive ? "text-primary" : "text-foreground"}`}
                  >
                    {cat.title}
                  </span>
                  <span className="truncate text-xs text-muted-foreground">
                    {cat.languages.length} languages · {cat.subtitle}
                  </span>
                </span>
                <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
              </button>
            );
          })}
        </div>
      )}

      <Dialog open={openCategory !== null} onOpenChange={(open) => !open && setOpenCategory(null)}>
        <DialogContent className="max-w-2xl rounded-[18px]">
          {activeCategory && (
            <>
              <DialogHeader>
                <DialogTitle>{activeCategory.title}</DialogTitle>
                <DialogDescription>Choose your mother tongue.</DialogDescription>
              </DialogHeader>
              <div className="grid max-h-[60vh] gap-3 overflow-y-auto p-1" style={GRID_STYLE}>
                {activeCategory.languages.map((l) => (
                  <LanguageCard
                    key={l.id}
                    lang={l}
                    isSelected={language === l.id}
                    onClick={() => {
                      onLangSelect(l.id);
                      setOpenCategory(null);
                    }}
                  />
                ))}
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </section>
  );
}
