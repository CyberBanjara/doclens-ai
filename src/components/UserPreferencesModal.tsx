import { useState, useEffect, useMemo } from "react";
import {
  Check,
  ChevronRight,
  Languages,
  Sparkles,
  GraduationCap,
  ArrowLeft,
  Loader2,
  Search,
  X,
  BookOpen,
  MessageSquare,
  Lightbulb,
  FileText,
  Compass,
  Layers,
  Cpu,
} from "lucide-react";
import { LANGUAGES, type LanguageInfo } from "@/lib/voiceLanguageMap";
import {
  type ProcessingStyle,
  type GlobalMode,
} from "@/lib/openrouter";
import { EDUCATION_LEVELS, type EducationLevel } from "@/lib/classification";

export interface StyleOption {
  id: ProcessingStyle;
  mode: GlobalMode;
  title: string;
  subtitle: string;
  description: string;
  icon: typeof BookOpen;
  badge: string;
  popular?: boolean;
}

export const ALL_STYLE_OPTIONS: StyleOption[] = [
  {
    id: "Native",
    mode: "translate",
    title: "Native Translation",
    subtitle: "Pure & Fluent",
    description:
      "Direct, fluent translation into your target language. Preserves original paragraphs, structure, and meaning.",
    icon: BookOpen,
    badge: "Translate",
    popular: true,
  },
  {
    id: "Mixed",
    mode: "translate",
    title: "Mixed / Bilingual",
    subtitle: "Conversational Blend",
    description:
      "Blends your chosen language with English as bilingual speakers naturally do (e.g., Hinglish). Keeps technical terms in English.",
    icon: MessageSquare,
    badge: "Translate",
  },
  {
    id: "Simple",
    mode: "explain",
    title: "Simple & Relatable",
    subtitle: "Beginner Friendly",
    description:
      "Explains complex ideas like teaching a beginner. Uses everyday analogies, simple language, and zero intimidating jargon.",
    icon: Lightbulb,
    badge: "Explain",
    popular: true,
  },
  {
    id: "Standard",
    mode: "explain",
    title: "Standard Explanation",
    subtitle: "Balanced & Structured",
    description:
      "Clear, balanced, and organized breakdown accessible to a general audience with structured sections.",
    icon: FileText,
    badge: "Explain",
  },
  {
    id: "Story",
    mode: "explain",
    title: "Story / Narrative",
    subtitle: "Engaging Scenarios",
    description:
      "Teaches concepts through stories, engaging scenarios, and intuitive narrative progression.",
    icon: Compass,
    badge: "Explain",
  },
  {
    id: "Deep",
    mode: "explain",
    title: "Deep Technical",
    subtitle: "Advanced In-Depth",
    description:
      "Comprehensive depth, edge cases, underlying mechanics, and critical reasoning for advanced study.",
    icon: Layers,
    badge: "Explain",
  },
  {
    id: "AI",
    mode: "explain",
    title: "AI Synthesis",
    subtitle: "First-Principles",
    description:
      "Holistic conceptual synthesis connecting core ideas logically from first principles with smooth readability.",
    icon: Cpu,
    badge: "Explain",
  },
];

interface UserPreferencesModalProps {
  open: boolean;
  initialLanguage?: string;
  initialStyle?: ProcessingStyle | string;
  initialMode?: GlobalMode;
  initialEducationLevel?: EducationLevel | string;
  onSave: (
    language: string,
    style: ProcessingStyle,
    mode: GlobalMode,
    educationLevel?: EducationLevel,
  ) => Promise<void> | void;
}

export type ModalStep = 1 | 2 | 3;

export function UserPreferencesModal({
  open,
  initialLanguage,
  initialStyle,
  initialMode,
  initialEducationLevel,
  onSave,
}: UserPreferencesModalProps) {
  const needLang = !initialLanguage;
  const needStyle = !initialStyle;
  const needLevel = !initialEducationLevel;

  const neededSteps = useMemo<ModalStep[]>(() => {
    const steps: ModalStep[] = [];
    if (needLang) steps.push(1);
    if (needStyle) steps.push(2);
    if (needLevel) steps.push(3);
    return steps.length > 0 ? steps : [1, 2, 3];
  }, [needLang, needStyle, needLevel]);

  const [step, setStep] = useState<ModalStep>(() => neededSteps[0] ?? 1);
  const [selectedLang, setSelectedLang] = useState<string>(initialLanguage || "");
  const [selectedStyle, setSelectedStyle] = useState<ProcessingStyle | "">(
    (initialStyle as ProcessingStyle) || "",
  );
  const [selectedMode, setSelectedMode] = useState<GlobalMode>(initialMode || "translate");
  const [selectedLevel, setSelectedLevel] = useState<EducationLevel | "">(
    (initialEducationLevel as EducationLevel) || "",
  );
  const [searchQuery, setSearchQuery] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (open) {
      if (initialLanguage) setSelectedLang(initialLanguage);
      if (initialStyle) setSelectedStyle(initialStyle as ProcessingStyle);
      if (initialMode) setSelectedMode(initialMode);
      if (initialEducationLevel) setSelectedLevel(initialEducationLevel as EducationLevel);
      setStep(neededSteps[0] ?? 1);
    }
  }, [initialLanguage, initialStyle, initialMode, initialEducationLevel, open, neededSteps]);

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

  const currentStepIndex = neededSteps.indexOf(step);
  const isFirstNeededStep = currentStepIndex <= 0;
  const isLastNeededStep = currentStepIndex >= neededSteps.length - 1;
  const nextStep = !isLastNeededStep ? neededSteps[currentStepIndex + 1] : null;
  const prevStep = !isFirstNeededStep ? neededSteps[currentStepIndex - 1] : null;

  const handleSelectLanguage = (lang: string) => {
    setSelectedLang(lang);
  };

  const handleSelectStyleOption = (opt: StyleOption) => {
    setSelectedStyle(opt.id);
    setSelectedMode(opt.mode);
  };

  const handleNext = () => {
    if (nextStep) {
      setStep(nextStep);
    } else {
      void handleFinalSubmit();
    }
  };

  const handleBack = () => {
    if (prevStep) {
      setStep(prevStep);
    }
  };

  const handleFinalSubmit = async (customLevel?: EducationLevel) => {
    const finalLang = selectedLang || initialLanguage || "";
    const finalStyle = (selectedStyle || initialStyle || "Native") as ProcessingStyle;
    const finalMode = selectedMode;
    const finalLevel =
      customLevel ||
      (selectedLevel as EducationLevel) ||
      (initialEducationLevel as EducationLevel) ||
      undefined;

    if (!finalLang || !finalStyle) return;

    setIsSaving(true);
    try {
      await onSave(finalLang, finalStyle, finalMode, finalLevel);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md p-4 animate-in fade-in duration-200">
      <div
        className="relative w-full max-w-2xl rounded-3xl border border-border/80 bg-card/95 p-6 sm:p-7 shadow-2xl backdrop-blur-2xl text-left space-y-5 animate-in zoom-in-95 duration-200 overflow-hidden"
        role="dialog"
        aria-modal="true"
        aria-labelledby="preferences-setup-title"
      >
        {/* Header */}
        <div className="flex items-center gap-3.5 min-w-0">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-primary/10 text-primary border border-primary/20 shadow-inner">
            {step === 1 ? (
              <Languages className="h-6 w-6 text-primary" />
            ) : step === 2 ? (
              <Sparkles className="h-6 w-6 text-primary" />
            ) : (
              <GraduationCap className="h-6 w-6 text-primary" />
            )}
          </div>
          <div className="space-y-0.5 min-w-0 flex-1">
            <h2
              id="preferences-setup-title"
              className="text-lg sm:text-xl font-extrabold tracking-tight text-foreground"
            >
              {step === 1
                ? "Choose Your Translation Language"
                : step === 2
                  ? "Choose Your Reading & AI Style"
                  : "Choose Your Class or Study Goal"}
            </h2>
            <p className="text-xs text-muted-foreground leading-relaxed">
              {step === 1
                ? "Select the language you want documents, translations, and audio narration in."
                : step === 2
                  ? "Select how AI should translate and explain pages for your reading style."
                  : "Select your standard or goal to personalize books, study materials, and library."}
            </p>
          </div>
        </div>

        {/* Step Progress Bar */}
        {neededSteps.length > 1 && (
          <div className="flex items-center gap-2 pt-0.5">
            {neededSteps.map((s, idx) => (
              <div
                key={s}
                className={`h-1.5 flex-1 rounded-full transition-all duration-300 ${
                  currentStepIndex >= idx
                    ? "bg-primary shadow-xs shadow-primary/30"
                    : "bg-border/60"
                }`}
              />
            ))}
          </div>
        )}

        {/* ─── STEP 1: LANGUAGE SELECTION ─── */}
        {step === 1 && (
          <div className="space-y-4 animate-in fade-in duration-200">
            {/* Search Input */}
            <div className="relative">
              <Search className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <input
                type="text"
                placeholder="Search language (Hindi, Telugu, Tamil, Bengali, English...)"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                autoFocus
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

            {/* Languages Grid */}
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
                        onClick={() => handleSelectLanguage(lang.native)}
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
                onClick={handleNext}
                disabled={!selectedLang || isSaving}
                className="flex w-full items-center justify-center gap-2 rounded-2xl bg-primary py-3 px-4 font-bold text-sm text-primary-foreground shadow-lg shadow-primary/25 transition-all hover:opacity-95 active:scale-[0.99] disabled:opacity-40 cursor-pointer"
              >
                {isSaving ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    <span>Saving preferences...</span>
                  </>
                ) : isLastNeededStep ? (
                  <span>Save Preferences</span>
                ) : (
                  <>
                    <span>
                      {selectedLang ? `Continue with ${selectedLang}` : "Select a language to continue"}
                    </span>
                    <ChevronRight className="h-4 w-4" />
                  </>
                )}
              </button>
            </div>
          </div>
        )}

        {/* ─── STEP 2: STYLE SELECTION ─── */}
        {step === 2 && (
          <div className="space-y-4 animate-in fade-in duration-200">
            {/* Style Cards Grid */}
            <div className="max-h-[48vh] overflow-y-auto pr-1 py-0.5 space-y-2.5">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                {ALL_STYLE_OPTIONS.map((opt) => {
                  const isChosen = selectedStyle === opt.id;
                  const Icon = opt.icon;
                  return (
                    <button
                      key={opt.id}
                      type="button"
                      onClick={() => handleSelectStyleOption(opt)}
                      className={`group relative flex flex-col justify-between items-start rounded-2xl p-3.5 sm:p-4 text-left transition-all duration-200 cursor-pointer border ${
                        isChosen
                          ? "border-primary bg-primary/10 ring-1 ring-primary/40 shadow-sm shadow-primary/15 text-foreground scale-[1.01]"
                          : "border-border/60 bg-surface/40 text-muted-foreground hover:border-primary/40 hover:bg-surface-2/60 hover:text-foreground active:scale-[0.98]"
                      }`}
                    >
                      <div className="flex items-start justify-between w-full gap-2">
                        <div className="flex items-center gap-2.5 min-w-0">
                          <div
                            className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl shadow-inner border transition-transform duration-200 group-hover:scale-105 ${
                              isChosen
                                ? "border-primary/40 bg-primary/20 text-primary"
                                : "border-border/60 bg-surface-2 text-foreground"
                            }`}
                          >
                            <Icon className="h-4 w-4" />
                          </div>
                          <div className="min-w-0">
                            <div className="flex items-center gap-1.5">
                              <span className="text-xs sm:text-sm font-bold text-foreground leading-tight truncate">
                                {opt.title}
                              </span>
                              {opt.popular && (
                                <span className="rounded bg-primary/15 px-1.5 py-0.5 text-[9px] font-bold text-primary">
                                  Popular
                                </span>
                              )}
                            </div>
                            <span className="text-[10px] text-muted-foreground font-medium">
                              {opt.subtitle}
                            </span>
                          </div>
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
                        className={`text-[10px] sm:text-[11px] leading-relaxed mt-2.5 transition-colors ${
                          isChosen
                            ? "text-primary/90 font-medium"
                            : "text-muted-foreground group-hover:text-foreground/80"
                        }`}
                      >
                        {opt.description}
                      </p>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Bottom Actions: Back and Continue/Save */}
            <div className="pt-2 border-t border-border/40 flex items-center justify-between gap-3">
              {!isFirstNeededStep && (
                <button
                  type="button"
                  onClick={handleBack}
                  disabled={isSaving}
                  className="inline-flex items-center gap-1.5 rounded-xl border border-border/60 px-4 py-2.5 text-xs font-semibold text-muted-foreground transition-colors hover:bg-surface-2 hover:text-foreground disabled:opacity-40 cursor-pointer"
                >
                  <ArrowLeft className="h-3.5 w-3.5" />
                  <span>Back</span>
                </button>
              )}

              <button
                type="button"
                disabled={isSaving || !selectedStyle || (!selectedLang && !initialLanguage)}
                onClick={handleNext}
                className="flex-1 inline-flex items-center justify-center gap-2 rounded-xl bg-primary py-2.5 px-4 text-xs sm:text-sm font-bold text-primary-foreground shadow-md shadow-primary/20 hover:opacity-95 active:scale-95 transition-all disabled:opacity-40 cursor-pointer"
              >
                {isSaving ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    <span>Saving to Profile & Syncing JWT...</span>
                  </>
                ) : isLastNeededStep ? (
                  <span>Save Preferences</span>
                ) : (
                  <>
                    <span>Continue to Standard / Goal</span>
                    <ChevronRight className="h-4 w-4" />
                  </>
                )}
              </button>
            </div>
          </div>
        )}

        {/* ─── STEP 3: CLASS / STANDARD / GOAL SELECTION ─── */}
        {step === 3 && (
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
              {!isFirstNeededStep && (
                <button
                  type="button"
                  onClick={handleBack}
                  disabled={isSaving}
                  className="inline-flex items-center gap-1.5 rounded-xl border border-border/60 px-4 py-2.5 text-xs font-semibold text-muted-foreground transition-colors hover:bg-surface-2 hover:text-foreground disabled:opacity-40 cursor-pointer"
                >
                  <ArrowLeft className="h-3.5 w-3.5" />
                  <span>Back</span>
                </button>
              )}

              <button
                type="button"
                disabled={
                  isSaving ||
                  !selectedLevel ||
                  (!selectedStyle && !initialStyle) ||
                  (!selectedLang && !initialLanguage)
                }
                onClick={() => void handleFinalSubmit()}
                className="flex-1 inline-flex items-center justify-center gap-2 rounded-xl bg-primary py-2.5 px-4 text-xs sm:text-sm font-bold text-primary-foreground shadow-md shadow-primary/20 hover:opacity-95 active:scale-95 transition-all disabled:opacity-40 cursor-pointer"
              >
                {isSaving ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    <span>Saving to Profile & Syncing JWT...</span>
                  </>
                ) : (
                  <span>
                    {(selectedLang || initialLanguage) && (selectedStyle || initialStyle)
                      ? `Save & Start Translation in ${selectedLang || initialLanguage}`
                      : "Save Preferences"}
                  </span>
                )}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
