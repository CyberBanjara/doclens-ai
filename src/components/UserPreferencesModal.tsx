import { useState, useEffect, useMemo } from "react";
import {
  Check,
  ChevronRight,
  Languages,
  GraduationCap,
  ArrowLeft,
  Loader2,
  Search,
  X,
} from "lucide-react";
import { LANGUAGES, type LanguageInfo } from "@/lib/voiceLanguageMap";
import { EDUCATION_LEVELS, type EducationLevel } from "@/lib/classification";

interface UserPreferencesModalProps {
  open: boolean;
  initialLanguage?: string;
  initialEducationLevel?: EducationLevel | string;
  isInitialSetup?: boolean;
  onSave: (language: string, educationLevel: EducationLevel) => Promise<void> | void;
}

export function UserPreferencesModal({
  open,
  initialLanguage,
  initialEducationLevel,
  onSave,
}: UserPreferencesModalProps) {
  const [step, setStep] = useState<1 | 2>(1);
  const [selectedLang, setSelectedLang] = useState<string>(initialLanguage || "हिंदी");
  const [selectedLevel, setSelectedLevel] = useState<EducationLevel>(
    (initialEducationLevel as EducationLevel) || "class-10",
  );
  const [searchQuery, setSearchQuery] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (initialLanguage) setSelectedLang(initialLanguage);
    if (initialEducationLevel) {
      setSelectedLevel((initialEducationLevel as EducationLevel) || "class-10");
    }
  }, [initialLanguage, initialEducationLevel, open]);

  const filteredLanguages = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return LANGUAGES;
    return LANGUAGES.filter(
      (l) =>
        l.native.toLowerCase().includes(q) ||
        l.english.toLowerCase().includes(q) ||
        l.id.toLowerCase().includes(q),
    );
  }, [searchQuery]);

  if (!open) return null;

  const handleNextToLevel = (lang: string) => {
    setSelectedLang(lang);
    setStep(2);
  };

  const handleFinalSubmit = async (levelToSet?: EducationLevel) => {
    const finalLevel = levelToSet || selectedLevel;
    setIsSaving(true);
    try {
      await onSave(selectedLang, finalLevel);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-md p-4 animate-in fade-in duration-200">
      <div
        className="relative w-full max-w-xl rounded-3xl border border-border/80 bg-card/95 p-6 sm:p-7 shadow-2xl backdrop-blur-2xl text-left space-y-5 animate-in zoom-in-95 duration-200"
        role="dialog"
        aria-modal="true"
        aria-labelledby="preferences-setup-title"
      >
        {/* Header */}
        <div className="flex items-center gap-3.5 min-w-0">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-primary/10 text-primary border border-primary/20 shadow-inner">
            {step === 1 ? (
              <Languages className="h-6 w-6 text-primary" />
            ) : (
              <GraduationCap className="h-6 w-6 text-primary" />
            )}
          </div>
          <div className="space-y-0.5 min-w-0 flex-1">
            <h2
              id="preferences-setup-title"
              className="text-lg sm:text-xl font-extrabold tracking-tight text-foreground"
            >
              {step === 1 ? "Select the Language You Speak" : "Select Your Class or Goal"}
            </h2>
            <p className="text-xs text-muted-foreground leading-relaxed">
              {step === 1
                ? "Choose the language you know best for translations, audio narration, and explanations."
                : "Choose your study standard or reading preference to personalize your books."}
            </p>
          </div>
        </div>

        {/* Step Progress Bar */}
        <div className="flex items-center gap-2 pt-0.5">
          <div
            className={`h-1.5 flex-1 rounded-full transition-all duration-300 ${
              step >= 1 ? "bg-primary shadow-xs shadow-primary/30" : "bg-border"
            }`}
          />
          <div
            className={`h-1.5 flex-1 rounded-full transition-all duration-300 ${
              step >= 2 ? "bg-primary shadow-xs shadow-primary/30" : "bg-border/60"
            }`}
          />
        </div>

        {/* ─── STEP 1: MODERN UNIFIED LANGUAGE SELECTION ─── */}
        {step === 1 && (
          <div className="space-y-4 animate-in fade-in duration-200">
            {/* Clean Search Input */}
            <div className="relative">
              <Search className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <input
                type="text"
                placeholder="Search languages (Hindi, Tamil, Telugu, English...)"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full rounded-2xl border border-border/80 bg-surface/50 py-2.5 pl-10 pr-9 text-xs sm:text-sm text-foreground placeholder:text-muted-foreground focus:border-primary focus:bg-surface focus:outline-none focus:ring-2 focus:ring-primary/20 transition-all"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery("")}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground p-0.5 rounded-full transition-colors cursor-pointer"
                  title="Clear search"
                >
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>

            {/* Unified Languages Grid */}
            <div className="max-h-[46vh] overflow-y-auto pr-1 py-0.5">
              {filteredLanguages.length > 0 ? (
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
                  {filteredLanguages.map((lang: LanguageInfo) => {
                    const isChosen =
                      selectedLang.toLowerCase() === lang.native.toLowerCase() ||
                      selectedLang.toLowerCase() === lang.english.toLowerCase() ||
                      selectedLang.toLowerCase() === lang.id.toLowerCase();
                    return (
                      <button
                        key={lang.id}
                        type="button"
                        onClick={() => setSelectedLang(lang.native)}
                        className={`group relative flex flex-col justify-between items-start rounded-2xl p-3 sm:p-3.5 text-left transition-all duration-200 cursor-pointer border ${
                          isChosen
                            ? "border-primary bg-primary/10 ring-1 ring-primary/40 shadow-sm shadow-primary/15 text-foreground scale-[1.01]"
                            : "border-border/60 bg-surface/40 text-muted-foreground hover:border-primary/40 hover:bg-surface-2/60 hover:text-foreground active:scale-[0.98]"
                        }`}
                      >
                        <div className="flex items-center justify-between w-full gap-2">
                          <span className="text-base sm:text-lg font-bold text-foreground leading-tight tracking-tight">
                            {lang.native}
                          </span>
                          <div
                            className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border transition-all ${
                              isChosen
                                ? "border-primary bg-primary text-primary-foreground shadow-xs"
                                : "border-border/60 bg-surface text-transparent group-hover:border-primary/40"
                            }`}
                          >
                            <Check className="h-3 w-3 stroke-[3]" />
                          </div>
                        </div>

                        <span
                          className={`text-[11px] sm:text-xs font-medium mt-1.5 transition-colors ${
                            isChosen
                              ? "text-primary font-semibold"
                              : "text-muted-foreground group-hover:text-foreground/80"
                          }`}
                        >
                          {lang.english}
                        </span>
                      </button>
                    );
                  })}
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center py-10 text-center px-4 space-y-2.5">
                  <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-surface-2 text-muted-foreground border border-border">
                    <Search className="h-5 w-5" />
                  </div>
                  <div>
                    <p className="text-sm font-bold text-foreground">No languages found</p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      No matching result for &ldquo;{searchQuery}&rdquo;
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setSearchQuery("")}
                    className="text-xs font-bold text-primary hover:underline pt-1 cursor-pointer"
                  >
                    Clear search
                  </button>
                </div>
              )}
            </div>

            {/* Step 1 Action Button */}
            <div className="pt-2">
              <button
                type="button"
                onClick={() => handleNextToLevel(selectedLang)}
                disabled={!selectedLang}
                className="flex w-full items-center justify-center gap-2 rounded-2xl bg-primary py-3 px-4 font-bold text-sm text-primary-foreground shadow-lg shadow-primary/25 transition-all hover:opacity-95 active:scale-[0.99] disabled:opacity-40 cursor-pointer"
              >
                <span>Continue with {selectedLang}</span>
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          </div>
        )}

        {/* ─── STEP 2: MODERN CLASS / GOAL SELECTION ─── */}
        {step === 2 && (
          <div className="space-y-4 animate-in fade-in duration-200">
            {/* Unified Class Cards Grid */}
            <div className="max-h-[48vh] overflow-y-auto pr-1 py-0.5">
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
                {EDUCATION_LEVELS.map((level) => {
                  const isChosen = selectedLevel === level.id;
                  return (
                    <button
                      key={level.id}
                      type="button"
                      onClick={() => setSelectedLevel(level.id)}
                      className={`group relative flex flex-col justify-between items-start rounded-2xl p-3 sm:p-3.5 text-left transition-all duration-200 cursor-pointer border ${
                        isChosen
                          ? "border-primary bg-primary/10 ring-1 ring-primary/40 shadow-sm shadow-primary/15 text-foreground scale-[1.01]"
                          : "border-border/60 bg-surface/40 text-muted-foreground hover:border-primary/40 hover:bg-surface-2/60 hover:text-foreground active:scale-[0.98]"
                      }`}
                    >
                      <div className="flex items-start justify-between w-full gap-2">
                        <div className="flex items-center gap-2.5 min-w-0">
                          <div
                            className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-lg shadow-inner border transition-transform duration-200 group-hover:scale-105 ${
                              isChosen
                                ? "border-primary/40 bg-primary/20"
                                : "border-border/60 bg-surface-2"
                            }`}
                          >
                            {level.icon}
                          </div>
                          <span className="text-xs sm:text-sm font-bold text-foreground leading-tight truncate">
                            {level.label}
                          </span>
                        </div>

                        <div
                          className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border transition-all ${
                            isChosen
                              ? "border-primary bg-primary text-primary-foreground shadow-xs"
                              : "border-border/60 bg-surface text-transparent group-hover:border-primary/40"
                          }`}
                        >
                          <Check className="h-3 w-3 stroke-[3]" />
                        </div>
                      </div>

                      <p
                        className={`text-[10px] sm:text-[11px] line-clamp-2 mt-2 transition-colors ${
                          isChosen
                            ? "text-primary/90 font-medium"
                            : "text-muted-foreground group-hover:text-foreground/80"
                        }`}
                      >
                        {level.description}
                      </p>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Bottom Actions: Back and Save Preferences */}
            <div className="pt-2 border-t border-border/40 flex items-center justify-between gap-3">
              <button
                type="button"
                onClick={() => setStep(1)}
                disabled={isSaving}
                className="inline-flex items-center gap-1.5 rounded-xl border border-border/60 px-4 py-2.5 text-xs font-semibold text-muted-foreground transition-colors hover:bg-surface-2 hover:text-foreground disabled:opacity-40 cursor-pointer"
              >
                <ArrowLeft className="h-3.5 w-3.5" />
                <span>Back</span>
              </button>

              <button
                type="button"
                disabled={isSaving || !selectedLevel || !selectedLang}
                onClick={() => void handleFinalSubmit(selectedLevel)}
                className="flex-1 inline-flex items-center justify-center gap-2 rounded-xl bg-primary py-2.5 px-4 text-xs sm:text-sm font-bold text-primary-foreground shadow-md shadow-primary/20 hover:opacity-95 active:scale-95 transition-all disabled:opacity-40 cursor-pointer"
              >
                {isSaving ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    <span>Saving to Profile...</span>
                  </>
                ) : (
                  <span>Save & Open in {selectedLang}</span>
                )}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
