import { useState, useEffect } from "react";
import { Check, Sparkles, BookOpen, GraduationCap, X } from "lucide-react";
import {
  EDUCATION_LEVELS,
  type EducationLevel,
  saveEducationLevel,
} from "@/lib/classification";

interface EducationLevelModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  currentLevel: EducationLevel;
  onSelectLevel: (level: EducationLevel) => void;
  isFirstTime?: boolean;
}

export function EducationLevelModal({
  open,
  onOpenChange,
  currentLevel,
  onSelectLevel,
  isFirstTime = false,
}: EducationLevelModalProps) {
  const [selected, setSelected] = useState<EducationLevel>(currentLevel);

  useEffect(() => {
    setSelected(currentLevel);
  }, [currentLevel, open]);

  if (!open) return null;

  const handleConfirm = (levelToSet?: EducationLevel) => {
    const target = levelToSet || selected;
    saveEducationLevel(target);
    onSelectLevel(target);
    onOpenChange(false);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-md p-4 animate-in fade-in duration-200">
      <div
        className="relative w-full max-w-lg rounded-3xl border border-border/80 bg-card/95 p-6 sm:p-7 shadow-2xl backdrop-blur-2xl text-left space-y-5 animate-in zoom-in-95 duration-200"
        role="dialog"
        aria-modal="true"
        aria-labelledby="education-level-title"
      >
        {/* Close button (only when not strictly forcing first time, or allow close anytime) */}
        {!isFirstTime && (
          <button
            onClick={() => onOpenChange(false)}
            className="absolute top-5 right-5 h-8 w-8 rounded-full border border-border/60 bg-surface/80 flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-surface-2 transition-all cursor-pointer"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        )}

        {/* Modal Header */}
        <div className="flex items-start gap-3.5 pr-8">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-primary/10 text-primary border border-primary/20 shadow-inner">
            <GraduationCap className="h-6 w-6 text-primary" />
          </div>
          <div className="space-y-1 min-w-0">
            <div className="flex items-center gap-2">
              <h2
                id="education-level-title"
                className="text-lg sm:text-xl font-extrabold tracking-tight text-foreground"
              >
                {isFirstTime ? "Select Your Education Level" : "Change Education Level"}
              </h2>
              {isFirstTime && (
                <span className="flex items-center gap-1 rounded-full bg-primary/15 px-2 py-0.5 text-[10px] font-bold text-primary">
                  <Sparkles className="h-3 w-3" />
                  Quick Setup
                </span>
              )}
            </div>
            <p className="text-xs text-muted-foreground leading-relaxed">
              Tailor the Global Library to show relevant curriculum books, NCERTs, and exam materials.
            </p>
          </div>
        </div>

        {/* 5 Education Tier Cards */}
        <div className="space-y-2.5 max-h-[60vh] overflow-y-auto pr-0.5">
          {EDUCATION_LEVELS.map((level) => {
            const isChosen = selected === level.id;
            return (
              <button
                key={level.id}
                type="button"
                onClick={() => {
                  setSelected(level.id);
                  handleConfirm(level.id);
                }}
                className={`group relative flex w-full items-center justify-between rounded-2xl p-3.5 sm:p-4 text-left transition-all duration-200 cursor-pointer border ${
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

        {/* Action Button & Note */}
        <div className="pt-2 border-t border-border/40 flex flex-col sm:flex-row items-center justify-between gap-3 text-center sm:text-left">
          <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
            <BookOpen className="h-3.5 w-3.5 text-primary/80 shrink-0" />
            <span>You can switch your level anytime from the top bar.</span>
          </div>

          <button
            type="button"
            onClick={() => handleConfirm()}
            className="w-full sm:w-auto px-5 py-2.5 rounded-xl bg-primary text-xs font-bold text-primary-foreground shadow-md shadow-primary/20 hover:opacity-95 active:scale-95 transition-all cursor-pointer shrink-0"
          >
            Continue to Library
          </button>
        </div>
      </div>
    </div>
  );
}
