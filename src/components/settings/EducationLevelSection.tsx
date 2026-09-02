import { GraduationCap, Check } from "lucide-react";
import { EDUCATION_LEVELS, type EducationLevel } from "@/lib/classification";

interface EducationLevelSectionProps {
  educationLevel: EducationLevel;
  onEducationLevelChange: (level: EducationLevel) => void;
}

export function EducationLevelSection({
  educationLevel,
  onEducationLevelChange,
}: EducationLevelSectionProps) {
  return (
    <section className="glass-panel flex flex-col gap-4 rounded-[18px] p-4 md:p-6">
      <div className="flex items-center gap-3">
        <GraduationCap className="h-5 w-5 text-primary" />
        <h3 className="text-lg font-semibold text-foreground">Class / Education Level</h3>
      </div>
      <p className="text-sm text-muted-foreground">
        Your current study level. Automatically organizes curriculum books and NCERT materials.
      </p>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {EDUCATION_LEVELS.map((level) => {
          const isSelected = educationLevel === level.id;
          return (
            <button
              key={level.id}
              type="button"
              onClick={() => onEducationLevelChange(level.id)}
              className={`group relative flex items-center justify-between rounded-2xl p-3.5 text-left transition-all duration-200 cursor-pointer border ${
                isSelected
                  ? "border-primary bg-primary/10 ring-1 ring-primary shadow-md shadow-primary/5 text-foreground"
                  : "border-border/70 bg-surface/40 text-muted-foreground hover:border-primary/40 hover:bg-surface-2/60 hover:text-foreground"
              }`}
            >
              <div className="flex items-center gap-3 min-w-0">
                <div
                  className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-xl shadow-inner border transition-transform duration-200 group-hover:scale-105 ${
                    isSelected ? "border-primary/40 bg-primary/20" : "border-border/60 bg-surface-2"
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
                  <p className="text-[10px] text-muted-foreground line-clamp-1 mt-0.5">
                    {level.shortLabel}
                  </p>
                </div>
              </div>

              <div
                className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border transition-all ${
                  isSelected
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
    </section>
  );
}
