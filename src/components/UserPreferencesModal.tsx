import { useState, useEffect, useMemo } from "react";
import {
  Check,
  ChevronDown,
  Languages,
  Sparkles,
  GraduationCap,
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
    description: "Direct, fluent translation preserving original structure.",
    icon: BookOpen,
    badge: "Translate",
    popular: true,
  },
  {
    id: "Mixed",
    mode: "translate",
    title: "Mixed / Bilingual",
    subtitle: "Native Script + English Terms",
    description: "Native script translation with English abbreviations and keywords (no Hinglish text/script).",
    icon: MessageSquare,
    badge: "Translate",
  },
  {
    id: "Simple",
    mode: "explain",
    title: "Simple & Relatable",
    subtitle: "Beginner Friendly",
    description: "Simple language with everyday analogies and zero jargon.",
    icon: Lightbulb,
    badge: "Explain",
    popular: true,
  },
  {
    id: "Standard",
    mode: "explain",
    title: "Standard Explanation",
    subtitle: "Balanced & Structured",
    description: "Clear and organized breakdown with structured sections.",
    icon: FileText,
    badge: "Explain",
  },
  {
    id: "Story",
    mode: "explain",
    title: "Story / Narrative",
    subtitle: "Engaging Scenarios",
    description: "Concepts taught through engaging stories and scenarios.",
    icon: Compass,
    badge: "Explain",
  },
  {
    id: "Deep",
    mode: "explain",
    title: "Deep Technical",
    subtitle: "Advanced Depth",
    description: "Comprehensive depth, mechanics, and critical reasoning.",
    icon: Layers,
    badge: "Explain",
  },
  {
    id: "AI",
    mode: "explain",
    title: "AI Synthesis",
    subtitle: "First-Principles",
    description: "Holistic synthesis connecting core ideas logically.",
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

type ActiveDropdown = "lang" | "style" | "level" | null;

export function UserPreferencesModal({
  open,
  initialLanguage,
  initialStyle,
  initialMode,
  initialEducationLevel,
  onSave,
}: UserPreferencesModalProps) {
  const [selectedLang, setSelectedLang] = useState<string>(initialLanguage || "");
  const [selectedStyle, setSelectedStyle] = useState<ProcessingStyle | "">(
    (initialStyle as ProcessingStyle) || "",
  );
  const [selectedMode, setSelectedMode] = useState<GlobalMode>(initialMode || "translate");
  const [selectedLevel, setSelectedLevel] = useState<EducationLevel | "">(
    (initialEducationLevel as EducationLevel) || "",
  );
  const [activeDropdown, setActiveDropdown] = useState<ActiveDropdown>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (open) {
      if (initialLanguage) setSelectedLang(initialLanguage);
      if (initialStyle) {
        setSelectedStyle(initialStyle as ProcessingStyle);
        const found = ALL_STYLE_OPTIONS.find((s) => s.id === initialStyle);
        if (found) setSelectedMode(found.mode);
      }
      if (initialMode) setSelectedMode(initialMode);
      if (initialEducationLevel) setSelectedLevel(initialEducationLevel as EducationLevel);

      // Auto-open first missing parameter if any is missing
      if (!initialLanguage) {
        setActiveDropdown("lang");
      } else if (!initialStyle) {
        setActiveDropdown("style");
      } else if (!initialEducationLevel) {
        setActiveDropdown("level");
      } else {
        setActiveDropdown(null);
      }
    }
  }, [initialLanguage, initialStyle, initialMode, initialEducationLevel, open]);

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

  const currentLangObj = useMemo(() => {
    if (!selectedLang) return null;
    return LANGUAGES.find(
      (l) =>
        l.native.toLowerCase() === selectedLang.toLowerCase() ||
        l.english.toLowerCase() === selectedLang.toLowerCase() ||
        l.id.toLowerCase() === selectedLang.toLowerCase(),
    );
  }, [selectedLang]);

  const currentStyleObj = useMemo(() => {
    if (!selectedStyle) return null;
    return ALL_STYLE_OPTIONS.find((s) => s.id === selectedStyle);
  }, [selectedStyle]);

  const currentLevelObj = useMemo(() => {
    if (!selectedLevel) return null;
    return EDUCATION_LEVELS.find((l) => l.id === selectedLevel);
  }, [selectedLevel]);

  if (!open) return null;

  const handleSelectLanguage = (lang: string) => {
    setSelectedLang(lang);
    if (!selectedStyle) {
      setActiveDropdown("style");
    } else if (!selectedLevel) {
      setActiveDropdown("level");
    } else {
      setActiveDropdown(null);
    }
  };

  const handleSelectStyle = (opt: StyleOption) => {
    setSelectedStyle(opt.id);
    setSelectedMode(opt.mode);
    if (!selectedLevel) {
      setActiveDropdown("level");
    } else {
      setActiveDropdown(null);
    }
  };

  const handleSelectLevel = (levelId: EducationLevel) => {
    setSelectedLevel(levelId);
    setActiveDropdown(null);
  };

  const toggleDropdown = (target: "lang" | "style" | "level") => {
    setActiveDropdown((prev) => (prev === target ? null : target));
    setSearchQuery("");
  };

  const handleSave = async () => {
    const finalLang = selectedLang || initialLanguage || "";
    const finalStyle = (selectedStyle || initialStyle || "Native") as ProcessingStyle;
    const finalMode = selectedMode;
    const finalLevel =
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

  const isFormValid = Boolean(selectedLang && selectedStyle && selectedLevel);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-in fade-in duration-200">
      <div
        className="relative w-full max-w-lg rounded-2xl border border-border bg-card p-5 sm:p-6 shadow-2xl backdrop-blur-2xl text-left space-y-4 animate-in zoom-in-95 duration-200 overflow-hidden"
        role="dialog"
        aria-modal="true"
        aria-labelledby="preferences-modal-title"
      >
        {/* Header */}
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary border border-primary/20">
            <Sparkles className="h-5 w-5" />
          </div>
          <div>
            <h2
              id="preferences-modal-title"
              className="text-lg font-bold tracking-tight text-foreground"
            >
              Preferences
            </h2>
            <p className="text-xs text-muted-foreground">
              Select your language, style, and study goal.
            </p>
          </div>
        </div>

        {/* 3 Parameter Boxes */}
        <div className="space-y-2.5">
          {/* Box 1: Language */}
          <div className="rounded-xl border border-border/70 bg-surface/40 overflow-hidden transition-all duration-200">
            <button
              type="button"
              onClick={() => toggleDropdown("lang")}
              className={`w-full flex items-center justify-between p-3.5 text-left transition-colors cursor-pointer hover:bg-surface-2/60 ${
                activeDropdown === "lang"
                  ? "bg-primary/5 border-b border-border/70"
                  : ""
              }`}
            >
              <div className="flex items-center gap-3 min-w-0">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-surface-2 text-foreground border border-border/60">
                  <Languages className="h-4 w-4 text-primary" />
                </div>
                <div className="min-w-0">
                  <div className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                    Language
                  </div>
                  <div className="text-sm font-semibold text-foreground truncate">
                    {currentLangObj ? (
                      <span>
                        {currentLangObj.native}{" "}
                        <span className="text-xs text-muted-foreground font-normal">
                          ({currentLangObj.english})
                        </span>
                      </span>
                    ) : selectedLang ? (
                      selectedLang
                    ) : (
                      <span className="text-muted-foreground font-normal">
                        Select language...
                      </span>
                    )}
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-2">
                {selectedLang && (
                  <span className="flex h-5 w-5 items-center justify-center rounded-full bg-primary/15 text-primary">
                    <Check className="h-3 w-3 stroke-[3]" />
                  </span>
                )}
                <ChevronDown
                  className={`h-4 w-4 text-muted-foreground transition-transform duration-200 ${
                    activeDropdown === "lang" ? "rotate-180 text-primary" : ""
                  }`}
                />
              </div>
            </button>

            {/* Language Dropdown Content */}
            {activeDropdown === "lang" && (
              <div className="p-3 space-y-2.5 bg-background/60 border-t border-border/50 animate-in fade-in slide-in-from-top-1 duration-150">
                <div className="relative">
                  <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                  <input
                    type="text"
                    placeholder="Search languages (Hindi, Telugu, English...)"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    autoFocus
                    className="w-full rounded-lg border border-border/70 bg-surface/80 py-1.5 pl-8 pr-8 text-xs text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                  />
                  {searchQuery && (
                    <button
                      type="button"
                      onClick={() => setSearchQuery("")}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground cursor-pointer"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>

                <div className="max-h-44 overflow-y-auto pr-1 grid grid-cols-2 sm:grid-cols-3 gap-1.5">
                  {filteredLanguages.map((lang: LanguageInfo) => {
                    const isSelected =
                      selectedLang.toLowerCase() === lang.native.toLowerCase() ||
                      selectedLang.toLowerCase() === lang.english.toLowerCase() ||
                      selectedLang.toLowerCase() === lang.id.toLowerCase();
                    return (
                      <button
                        key={lang.id}
                        type="button"
                        onClick={() => handleSelectLanguage(lang.native)}
                        className={`flex items-center justify-between rounded-lg px-2.5 py-1.5 text-left text-xs transition-all cursor-pointer border ${
                          isSelected
                            ? "border-primary bg-primary/15 text-primary font-semibold"
                            : "border-border/50 bg-surface/30 text-foreground hover:bg-surface-2 hover:border-border"
                        }`}
                      >
                        <div className="truncate">
                          <span className="font-medium">{lang.native}</span>
                          <span className="block text-[10px] text-muted-foreground truncate">
                            {lang.english}
                          </span>
                        </div>
                        {isSelected && <Check className="h-3 w-3 shrink-0 ml-1 stroke-[3]" />}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          {/* Box 2: AI Style */}
          <div className="rounded-xl border border-border/70 bg-surface/40 overflow-hidden transition-all duration-200">
            <button
              type="button"
              onClick={() => toggleDropdown("style")}
              className={`w-full flex items-center justify-between p-3.5 text-left transition-colors cursor-pointer hover:bg-surface-2/60 ${
                activeDropdown === "style"
                  ? "bg-primary/5 border-b border-border/70"
                  : ""
              }`}
            >
              <div className="flex items-center gap-3 min-w-0">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-surface-2 text-foreground border border-border/60">
                  <Sparkles className="h-4 w-4 text-primary" />
                </div>
                <div className="min-w-0">
                  <div className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                    Style
                  </div>
                  <div className="text-sm font-semibold text-foreground truncate">
                    {currentStyleObj ? (
                      <span>
                        {currentStyleObj.title}{" "}
                        <span className="text-xs text-muted-foreground font-normal">
                          ({currentStyleObj.subtitle})
                        </span>
                      </span>
                    ) : (
                      <span className="text-muted-foreground font-normal">
                        Select style...
                      </span>
                    )}
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-2">
                {selectedStyle && (
                  <span className="flex h-5 w-5 items-center justify-center rounded-full bg-primary/15 text-primary">
                    <Check className="h-3 w-3 stroke-[3]" />
                  </span>
                )}
                <ChevronDown
                  className={`h-4 w-4 text-muted-foreground transition-transform duration-200 ${
                    activeDropdown === "style" ? "rotate-180 text-primary" : ""
                  }`}
                />
              </div>
            </button>

            {/* Style Dropdown Content */}
            {activeDropdown === "style" && (
              <div className="p-3 space-y-2 bg-background/60 border-t border-border/50 animate-in fade-in slide-in-from-top-1 duration-150">
                <div className="max-h-52 overflow-y-auto pr-1 grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                  {ALL_STYLE_OPTIONS.map((opt) => {
                    const isSelected = selectedStyle === opt.id;
                    const Icon = opt.icon;
                    return (
                      <button
                        key={opt.id}
                        type="button"
                        onClick={() => handleSelectStyle(opt)}
                        className={`flex items-start gap-2.5 rounded-lg p-2.5 text-left text-xs transition-all cursor-pointer border ${
                          isSelected
                            ? "border-primary bg-primary/15 text-primary ring-1 ring-primary/30"
                            : "border-border/50 bg-surface/30 text-foreground hover:bg-surface-2 hover:border-border"
                        }`}
                      >
                        <div
                          className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-md border ${
                            isSelected
                              ? "border-primary/40 bg-primary/20 text-primary"
                              : "border-border/60 bg-surface-2 text-muted-foreground"
                          }`}
                        >
                          <Icon className="h-3.5 w-3.5" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center justify-between gap-1">
                            <span className="font-semibold text-xs text-foreground truncate">
                              {opt.title}
                            </span>
                            {isSelected && (
                              <Check className="h-3 w-3 shrink-0 text-primary stroke-[3]" />
                            )}
                          </div>
                          <span className="block text-[10px] text-muted-foreground mt-0.5 truncate">
                            {opt.subtitle}
                          </span>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          {/* Box 3: Class / Study Goal */}
          <div className="rounded-xl border border-border/70 bg-surface/40 overflow-hidden transition-all duration-200">
            <button
              type="button"
              onClick={() => toggleDropdown("level")}
              className={`w-full flex items-center justify-between p-3.5 text-left transition-colors cursor-pointer hover:bg-surface-2/60 ${
                activeDropdown === "level"
                  ? "bg-primary/5 border-b border-border/70"
                  : ""
              }`}
            >
              <div className="flex items-center gap-3 min-w-0">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-surface-2 text-foreground border border-border/60">
                  {currentLevelObj ? (
                    <span className="text-base leading-none">{currentLevelObj.icon}</span>
                  ) : (
                    <GraduationCap className="h-4 w-4 text-primary" />
                  )}
                </div>
                <div className="min-w-0">
                  <div className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                    Class / Goal
                  </div>
                  <div className="text-sm font-semibold text-foreground truncate">
                    {currentLevelObj ? (
                      <span>
                        {currentLevelObj.label}{" "}
                        <span className="text-xs text-muted-foreground font-normal">
                          ({currentLevelObj.description})
                        </span>
                      </span>
                    ) : (
                      <span className="text-muted-foreground font-normal">
                        Select class or goal...
                      </span>
                    )}
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-2">
                {selectedLevel && (
                  <span className="flex h-5 w-5 items-center justify-center rounded-full bg-primary/15 text-primary">
                    <Check className="h-3 w-3 stroke-[3]" />
                  </span>
                )}
                <ChevronDown
                  className={`h-4 w-4 text-muted-foreground transition-transform duration-200 ${
                    activeDropdown === "level" ? "rotate-180 text-primary" : ""
                  }`}
                />
              </div>
            </button>

            {/* Class / Goal Dropdown Content */}
            {activeDropdown === "level" && (
              <div className="p-3 space-y-2 bg-background/60 border-t border-border/50 animate-in fade-in slide-in-from-top-1 duration-150">
                <div className="max-h-52 overflow-y-auto pr-1 grid grid-cols-2 sm:grid-cols-3 gap-1.5">
                  {EDUCATION_LEVELS.map((lvl) => {
                    const isSelected = selectedLevel === lvl.id;
                    return (
                      <button
                        key={lvl.id}
                        type="button"
                        onClick={() => handleSelectLevel(lvl.id)}
                        className={`flex items-center justify-between rounded-lg px-2.5 py-2 text-left text-xs transition-all cursor-pointer border ${
                          isSelected
                            ? "border-primary bg-primary/15 text-primary font-semibold"
                            : "border-border/50 bg-surface/30 text-foreground hover:bg-surface-2 hover:border-border"
                        }`}
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          <span className="text-sm">{lvl.icon}</span>
                          <span className="truncate">{lvl.label}</span>
                        </div>
                        {isSelected && <Check className="h-3 w-3 shrink-0 ml-1 stroke-[3]" />}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Footer / Save Action */}
        <div className="pt-2">
          <button
            type="button"
            onClick={() => void handleSave()}
            disabled={isSaving || !isFormValid}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-primary py-3 px-4 font-semibold text-sm text-primary-foreground shadow-md shadow-primary/20 transition-all hover:opacity-95 active:scale-[0.99] disabled:opacity-40 cursor-pointer"
          >
            {isSaving ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                <span>Saving Preferences...</span>
              </>
            ) : (
              <>
                <Check className="h-4 w-4 stroke-[3]" />
                <span>Save Preferences</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

