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
        Your study standard or reading goal. Automatically organizes curriculum books and NCERT materials.
      </p>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
        {EDUCATION_LEVELS.map((level) => {
          const isSelected = educationLevel === level.id;
          return (
            <button
              key={level.id}
              type="button"
              onClick={() => onEducationLevelChange(level.id)}
              className={`group relative flex flex-col justify-between items-start rounded-2xl p-3.5 text-left transition-all duration-200 cursor-pointer border ${
                isSelected
                  ? "border-primary bg-primary/10 ring-1 ring-primary/40 shadow-sm shadow-primary/15 text-foreground scale-[1.01]"
                  : "border-border/60 bg-surface/40 text-muted-foreground hover:border-primary/40 hover:bg-surface-2/60 hover:text-foreground active:scale-[0.98]"
              }`}
            >
              <div className="flex items-start justify-between w-full gap-2">
                <div className="flex items-center gap-2.5 min-w-0">
                  <div
                    className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-lg shadow-inner border transition-transform duration-200 group-hover:scale-105 ${
                      isSelected ? "border-primary/40 bg-primary/20" : "border-border/60 bg-surface-2"
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
                    isSelected
                      ? "border-primary bg-primary text-primary-foreground shadow-xs"
                      : "border-border/60 bg-surface text-transparent group-hover:border-primary/40"
                  }`}
                >
                  <Check className="h-3 w-3 stroke-[3]" />
                </div>
              </div>

              <p
                className={`text-[10px] sm:text-[11px] line-clamp-2 mt-2 transition-colors ${
                  isSelected
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
    </section>
  );
}
