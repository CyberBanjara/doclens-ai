import { useState, useEffect } from "react";
import { Check, Sparkles, ChevronRight, Languages } from "lucide-react";
import { LANGUAGES } from "@/lib/voiceLanguageMap";

export interface AvailableLanguageOption {
  id: string;
  native: string;
  english: string;
  slug?: string;
  pages?: number[];
  translatedCount?: number;
}

function formatPageNumbers(pages?: number[]): string {
  if (!pages || pages.length === 0) return "";
  if (pages.length <= 6) return pages.join(", ");
  return `${pages.slice(0, 5).join(", ")}... (+${pages.length - 5} more)`;
}

interface LanguageSelectionModalProps {
  open: boolean;
  bookTitle?: string;
  availableLanguages: AvailableLanguageOption[];
  loadingAvailable?: boolean;
  currentLanguage: string;
  onSelectLanguage: (language: string) => void;
}

export function LanguageSelectionModal({
  open,
  bookTitle,
  availableLanguages,
  loadingAvailable = false,
  currentLanguage,
  onSelectLanguage,
}: LanguageSelectionModalProps) {
  // Match currentLanguage to one of the options or default to the first available language
  const [selected, setSelected] = useState<string>(() => {
    if (availableLanguages.length > 0) {
      const match = availableLanguages.find(
        (l) =>
          l.id.toLowerCase() === currentLanguage.toLowerCase() ||
          l.native.toLowerCase() === currentLanguage.toLowerCase() ||
          l.english.toLowerCase() === currentLanguage.toLowerCase(),
      );
      return match ? match.id : availableLanguages[0].id;
    }
    return currentLanguage || "हिंदी";
  });

  const [showAllLanguages, setShowAllLanguages] = useState(false);

  useEffect(() => {
    if (availableLanguages.length > 0) {
      const match = availableLanguages.find(
        (l) =>
          l.id.toLowerCase() === currentLanguage.toLowerCase() ||
          l.native.toLowerCase() === currentLanguage.toLowerCase() ||
          l.english.toLowerCase() === currentLanguage.toLowerCase(),
      );
      if (match) {
        setSelected(match.id);
      } else {
        setSelected(availableLanguages[0].id);
      }
    } else {
      setSelected(currentLanguage || "हिंदी");
    }
  }, [availableLanguages, currentLanguage, open]);

  if (!open) return null;

  const handleConfirm = (langToSet?: string) => {
    const target = langToSet || selected;
    onSelectLanguage(target);
  };

  const hasAvailable = availableLanguages.length > 0;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-md p-4 animate-in fade-in duration-200">
      <div
        className="relative w-full max-w-lg rounded-3xl border border-border/80 bg-card/95 p-6 sm:p-7 shadow-2xl backdrop-blur-2xl text-left space-y-5 animate-in zoom-in-95 duration-200"
        role="dialog"
        aria-modal="true"
        aria-labelledby="language-selection-title"
      >
        {/* Header */}
        <div className="flex items-start gap-3.5">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-primary/10 text-primary border border-primary/20 shadow-inner">
            <Languages className="h-6 w-6 text-primary" />
          </div>
          <div className="space-y-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h2
                id="language-selection-title"
                className="text-lg sm:text-xl font-extrabold tracking-tight text-foreground"
              >
                Which mother tongue do you want to read in?
              </h2>
            </div>
            <p className="text-xs text-muted-foreground leading-relaxed">
              {bookTitle ? (
                <span>
                  Select your mother tongue for reading{" "}
                  <strong className="text-foreground">{bookTitle}</strong>.
                </span>
              ) : (
                "Choose your mother tongue to read pre-translated pages."
              )}
            </p>
          </div>
        </div>

        {/* Available Pre-translated Languages section */}
        <div className="space-y-3">
          {loadingAvailable ? (
            <div className="flex items-center justify-center py-8 gap-2 text-xs text-muted-foreground">
              <span className="h-4 w-4 rounded-full border-2 border-primary border-t-transparent animate-spin" />
              <span>Checking available translation tables in Supabase...</span>
            </div>
          ) : hasAvailable && !showAllLanguages ? (
            <div className="space-y-2">
              <div className="flex items-center justify-between text-[11px] font-semibold uppercase tracking-wider text-primary">
                <span className="flex items-center gap-1.5">
                  <Sparkles className="h-3.5 w-3.5" />
                  Available Translations in Your Mother Tongue
                </span>
                <span className="text-[10px] text-muted-foreground font-normal lowercase">
                  ({availableLanguages.length}{" "}
                  {availableLanguages.length === 1 ? "language" : "languages"})
                </span>
              </div>

              <div className="space-y-2 max-h-[50vh] overflow-y-auto pr-0.5">
                {availableLanguages.map((lang) => {
                  const isChosen = selected === lang.id;
                  const count = lang.translatedCount || lang.pages?.length || 0;
                  const pagesText = formatPageNumbers(lang.pages);
                  return (
                    <button
                      key={lang.id}
                      type="button"
                      onClick={() => setSelected(lang.id)}
                      className={`group relative flex w-full items-center justify-between rounded-2xl p-3.5 sm:p-4 text-left transition-all duration-200 cursor-pointer border ${
                        isChosen
                          ? "border-primary bg-primary/10 ring-1 ring-primary shadow-md shadow-primary/5 text-foreground"
                          : "border-border/70 bg-surface/50 text-muted-foreground hover:border-primary/40 hover:bg-surface-2/60 hover:text-foreground"
                      }`}
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <div
                          className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl font-bold text-sm transition-colors ${
                            isChosen
                              ? "bg-primary text-primary-foreground"
                              : "bg-surface-2 text-foreground group-hover:bg-primary/20 group-hover:text-primary"
                          }`}
                        >
                          {lang.native.slice(0, 2)}
                        </div>
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="text-base font-bold text-foreground truncate">
                              {lang.native}
                            </span>
                            <span className="text-xs text-muted-foreground">({lang.english})</span>
                            {count > 0 && (
                              <span className="rounded bg-primary/15 px-1.5 py-0.5 text-[9px] font-bold text-primary">
                                {count} {count === 1 ? "page" : "pages"}
                              </span>
                            )}
                          </div>
                          <p className="text-[11px] text-primary/80 font-medium mt-0.5 truncate">
                            {pagesText
                              ? `Pages: ${pagesText}`
                              : "Pre-translated pages available in Supabase"}
                          </p>
                        </div>
                      </div>

                      <div
                        className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full border transition-all ${
                          isChosen
                            ? "border-primary bg-primary text-primary-foreground"
                            : "border-border/80 bg-background/50 text-transparent group-hover:border-primary/50"
                        }`}
                      >
                        <Check className="h-3.5 w-3.5" />
                      </div>
                    </button>
                  );
                })}
              </div>

              <div className="pt-1 text-center">
                <button
                  type="button"
                  onClick={() => setShowAllLanguages(true)}
                  className="text-xs text-muted-foreground hover:text-primary transition-colors underline cursor-pointer"
                >
                  Choose a different mother tongue instead
                </button>
              </div>
            </div>
          ) : (
            /* Show all standard languages catalog if no pre-translations or user wants a different language */
            <div className="space-y-2">
              <div className="flex items-center justify-between text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                <span>All Supported Mother Tongues & Languages</span>
                {hasAvailable && (
                  <button
                    type="button"
                    onClick={() => setShowAllLanguages(false)}
                    className="text-[11px] text-primary hover:underline cursor-pointer lowercase"
                  >
                    ← back to available
                  </button>
                )}
              </div>

              <div className="space-y-2 max-h-[50vh] overflow-y-auto pr-0.5">
                {LANGUAGES.map((lang) => {
                  const isChosen = selected === lang.id || selected === lang.native;
                  const matchedAvailable = availableLanguages.find(
                    (a) =>
                      a.id.toLowerCase() === lang.id.toLowerCase() ||
                      a.native.toLowerCase() === lang.native.toLowerCase() ||
                      a.english.toLowerCase() === lang.english.toLowerCase(),
                  );
                  const isPreTranslated = !!matchedAvailable;
                  const count =
                    matchedAvailable?.translatedCount || matchedAvailable?.pages?.length || 0;

                  return (
                    <button
                      key={lang.id}
                      type="button"
                      onClick={() => setSelected(lang.id)}
                      className={`group relative flex w-full items-center justify-between rounded-2xl p-3 sm:p-3.5 text-left transition-all duration-200 cursor-pointer border ${
                        isChosen
                          ? "border-primary bg-primary/10 ring-1 ring-primary shadow-md shadow-primary/5 text-foreground"
                          : "border-border/70 bg-surface/50 text-muted-foreground hover:border-primary/40 hover:bg-surface-2/60 hover:text-foreground"
                      }`}
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <div
                          className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl font-bold text-xs transition-colors ${
                            isChosen
                              ? "bg-primary text-primary-foreground"
                              : "bg-surface-2 text-foreground group-hover:bg-primary/20 group-hover:text-primary"
                          }`}
                        >
                          {lang.native.slice(0, 2)}
                        </div>
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-bold text-foreground truncate">
                              {lang.native}
                            </span>
                            <span className="text-xs text-muted-foreground">({lang.english})</span>
                            {isPreTranslated && (
                              <span className="rounded bg-primary/15 px-1.5 py-0.5 text-[9px] font-bold text-primary">
                                {count > 0 ? `${count} pages` : "Available"}
                              </span>
                            )}
                          </div>
                          <p className="text-[10px] text-muted-foreground">
                            {isPreTranslated
                              ? "Pre-translated pages available"
                              : "Translates on-demand page by page"}
                          </p>
                        </div>
                      </div>

                      <div
                        className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border transition-all ${
                          isChosen
                            ? "border-primary bg-primary text-primary-foreground"
                            : "border-border/80 bg-background/50 text-transparent group-hover:border-primary/50"
                        }`}
                      >
                        <Check className="h-3.5 w-3.5" />
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* Footer actions */}
        <div className="pt-2">
          <button
            type="button"
            disabled={!selected || loadingAvailable}
            onClick={() => handleConfirm(selected)}
            className="flex w-full items-center justify-center gap-2 rounded-2xl bg-primary py-3.5 px-4 font-bold text-sm text-primary-foreground shadow-lg shadow-primary/20 transition-all hover:opacity-95 active:scale-[0.99] disabled:opacity-40 cursor-pointer"
          >
            <span>Open in {selected}</span>
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
