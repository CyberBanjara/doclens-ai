import { useState, useEffect, useMemo } from "react";
import {
  Check,
  Sparkles,
  ChevronRight,
  Languages,
  GraduationCap,
  ArrowLeft,
  Loader2,
  Search,
} from "lucide-react";
import { LANGUAGES, type LanguageInfo } from "@/lib/voiceLanguageMap";
import { EDUCATION_LEVELS, type EducationLevel, getEducationLevelMeta } from "@/lib/classification";

interface UserPreferencesModalProps {
  open: boolean;
  initialLanguage?: string;
  initialEducationLevel?: EducationLevel | string;
  isInitialSetup?: boolean;
  onSave: (language: string, educationLevel: EducationLevel) => Promise<void> | void;
}

// Top featured / most common regional languages for quick one-tap selection
const POPULAR_LANGUAGES = [
  "हिंदी",
  "English",
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
];

export function UserPreferencesModal({
  open,
  initialLanguage,
  initialEducationLevel,
  isInitialSetup = true,
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

  const currentLevelMeta = getEducationLevelMeta(selectedLevel);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-md p-4 animate-in fade-in duration-200">
      <div
        className="relative w-full max-w-lg rounded-3xl border border-border/80 bg-card/95 p-6 sm:p-7 shadow-2xl backdrop-blur-2xl text-left space-y-5 animate-in zoom-in-95 duration-200"
        role="dialog"
        aria-modal="true"
        aria-labelledby="preferences-setup-title"
      >
        {/* Header & Step Indicator */}
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-3.5 min-w-0">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-primary/10 text-primary border border-primary/20 shadow-inner">
              {step === 1 ? (
                <Languages className="h-6 w-6 text-primary" />
              ) : (
                <GraduationCap className="h-6 w-6 text-primary" />
              )}
            </div>
            <div className="space-y-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h2
                  id="preferences-setup-title"
                  className="text-lg sm:text-xl font-extrabold tracking-tight text-foreground"
                >
                  {step === 1 ? "Select Your Native Language" : "Select Your Class / Standard"}
                </h2>
                {isInitialSetup && (
                  <span className="flex items-center gap-1 rounded-full bg-primary/15 px-2 py-0.5 text-[10px] font-bold text-primary">
                    <Sparkles className="h-3 w-3" />
                    One-Time Setup
                  </span>
                )}
              </div>
              <p className="text-xs text-muted-foreground leading-relaxed">
                {step === 1
                  ? "Choose the language for AI translations, audio narration, and explanations."
                  : "Choose your study standard to automatically filter textbooks and curriculum."}
              </p>
            </div>
          </div>
        </div>

        {/* Step Progress Bar */}
        <div className="flex items-center gap-2 pt-1">
          <div
            className={`h-1.5 flex-1 rounded-full transition-all duration-300 ${
              step >= 1 ? "bg-primary" : "bg-border"
            }`}
          />
          <div
            className={`h-1.5 flex-1 rounded-full transition-all duration-300 ${
              step >= 2 ? "bg-primary" : "bg-border/60"
            }`}
          />
        </div>

        {/* ─── STEP 1: LANGUAGE SELECTION ─── */}
        {step === 1 && (
          <div className="space-y-3.5 animate-in fade-in duration-200">
            {/* Quick Popular Chips */}
            <div className="space-y-1.5">
              <div className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                Popular Regional Languages
              </div>
              <div className="flex flex-wrap gap-1.5">
                {POPULAR_LANGUAGES.map((nativeName) => {
                  const isSelected = selectedLang === nativeName;
                  return (
                    <button
                      key={nativeName}
                      type="button"
                      onClick={() => setSelectedLang(nativeName)}
                      className={`rounded-xl px-3 py-1.5 text-xs font-semibold transition-all cursor-pointer border ${
                        isSelected
                          ? "border-primary bg-primary text-primary-foreground shadow-sm shadow-primary/20 scale-105"
                          : "border-border/70 bg-surface/60 text-foreground hover:bg-surface-2 hover:border-primary/40"
                      }`}
                    >
                      {nativeName}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Search Input */}
            <div className="relative">
              <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
              <input
                type="text"
                placeholder="Search languages (Hindi, Tamil, Bengali, English...)"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full rounded-xl border border-border/80 bg-surface/40 py-2 pl-9 pr-3 text-xs text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
              />
            </div>

            {/* Languages Scrollable Grid */}
            <div className="max-h-[36vh] space-y-1.5 overflow-y-auto pr-0.5">
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
                    className={`group relative flex w-full items-center justify-between rounded-2xl p-2.5 sm:p-3 text-left transition-all duration-150 cursor-pointer border ${
                      isChosen
                        ? "border-primary bg-primary/10 ring-1 ring-primary text-foreground"
                        : "border-border/60 bg-surface/40 text-muted-foreground hover:border-primary/40 hover:bg-surface-2/60 hover:text-foreground"
                    }`}
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div
                        className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg font-bold text-xs transition-colors ${
                          isChosen
                            ? "bg-primary text-primary-foreground"
                            : "bg-surface-2 text-foreground group-hover:bg-primary/20 group-hover:text-primary"
                        }`}
                      >
                        {lang.native.slice(0, 2)}
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5">
                          <span className="text-sm font-bold text-foreground truncate">
                            {lang.native}
                          </span>
                          <span className="text-xs text-muted-foreground">({lang.english})</span>
                        </div>
                      </div>
                    </div>

                    <div
                      className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border transition-all ${
                        isChosen
                          ? "border-primary bg-primary text-primary-foreground"
                          : "border-border/80 bg-background/50 text-transparent group-hover:border-primary/50"
                      }`}
                    >
                      <Check className="h-3 w-3 stroke-[3]" />
                    </div>
                  </button>
                );
              })}
            </div>

            {/* Step 1 Action Button */}
            <div className="pt-2">
              <button
                type="button"
                onClick={() => handleNextToLevel(selectedLang)}
                disabled={!selectedLang}
                className="flex w-full items-center justify-center gap-2 rounded-2xl bg-primary py-3 px-4 font-bold text-sm text-primary-foreground shadow-lg shadow-primary/20 transition-all hover:opacity-95 active:scale-[0.99] disabled:opacity-40 cursor-pointer"
              >
                <span>Continue with {selectedLang}</span>
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          </div>
        )}

        {/* ─── STEP 2: CLASS / STANDARD SELECTION ─── */}
        {step === 2 && (
          <div className="space-y-3 animate-in fade-in duration-200">
            {/* 5 Education Levels */}
            <div className="space-y-2 max-h-[46vh] overflow-y-auto pr-0.5">
              {EDUCATION_LEVELS.map((level) => {
                const isChosen = selectedLevel === level.id;
                return (
                  <button
                    key={level.id}
                    type="button"
                    onClick={() => setSelectedLevel(level.id)}
                    className={`group relative flex w-full items-center justify-between rounded-2xl p-3 sm:p-3.5 text-left transition-all duration-200 cursor-pointer border ${
                      isChosen
                        ? "border-primary bg-primary/10 ring-1 ring-primary shadow-md shadow-primary/5 text-foreground"
                        : "border-border/70 bg-surface/50 text-muted-foreground hover:border-primary/40 hover:bg-surface-2/60 hover:text-foreground"
                    }`}
                  >
                    <div className="flex items-center gap-3.5 min-w-0">
                      <div
                        className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-xl shadow-inner border transition-transform duration-200 group-hover:scale-105 ${
                          isChosen
                            ? "border-primary/40 bg-primary/20"
                            : "border-border/60 bg-surface-2"
                        }`}
                      >
                        {level.icon}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="text-xs sm:text-sm font-bold text-foreground truncate">
                            {level.label}
                          </span>
                        </div>
                        <p className="text-[11px] text-muted-foreground line-clamp-1 mt-0.5">
                          {level.description}
                        </p>
                      </div>
                    </div>

                    <div className="ml-2 shrink-0 flex items-center">
                      <div
                        className={`flex h-6 w-6 items-center justify-center rounded-full border transition-all ${
                          isChosen
                            ? "border-primary bg-primary text-primary-foreground shadow-sm"
                            : "border-border/80 bg-surface text-transparent group-hover:border-primary/40"
                        }`}
                      >
                        <Check className="h-3.5 w-3.5 stroke-[3]" />
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>

            {/* Bottom Actions: Back and Save Preferences */}
            <div className="pt-2 border-t border-border/40 flex items-center justify-between gap-3">
              <button
                type="button"
                onClick={() => setStep(1)}
                disabled={isSaving}
                className="inline-flex items-center gap-1.5 rounded-xl border border-border/60 px-3.5 py-2 text-xs font-semibold text-muted-foreground transition-colors hover:bg-surface-2 hover:text-foreground disabled:opacity-40 cursor-pointer"
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
                  <>
                    <span>Save & Open in {selectedLang}</span>
                    <Sparkles className="h-4 w-4" />
                  </>
                )}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
