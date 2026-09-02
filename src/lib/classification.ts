import type { R2File } from "./file-utils";

export type EducationLevel = "class-9" | "class-10" | "class-11" | "class-12" | "gov-exams";

export type SubjectCategory = "history" | "political-science" | "economics" | "miscellaneous";

export interface EducationLevelConfig {
  id: EducationLevel;
  label: string;
  shortLabel: string;
  icon: string;
  badge: string;
  description: string;
  badgeBg: string;
}

export const EDUCATION_LEVELS: EducationLevelConfig[] = [
  {
    id: "class-9",
    label: "Class 9",
    shortLabel: "Class 9",
    icon: "🎒",
    badge: "Class 9",
    description: "NCERT Class 9 Curriculum & Social Science Chapters",
    badgeBg: "bg-blue-500/15 text-blue-400 border-blue-500/30",
  },
  {
    id: "class-10",
    label: "Class 10",
    shortLabel: "Class 10",
    icon: "🎒",
    badge: "Class 10",
    description: "NCERT Class 10 Board Curriculum & Core Concepts",
    badgeBg: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
  },
  {
    id: "class-11",
    label: "Class 11",
    shortLabel: "Class 11",
    icon: "📚",
    badge: "Class 11",
    description: "NCERT Class 11 Humanities, History & Social Sciences",
    badgeBg: "bg-purple-500/15 text-purple-400 border-purple-500/30",
  },
  {
    id: "class-12",
    label: "Class 12",
    shortLabel: "Class 12",
    icon: "🎓",
    badge: "Class 12",
    description: "NCERT Class 12 Senior Secondary History & Syllabus",
    badgeBg: "bg-amber-500/15 text-amber-400 border-amber-500/30",
  },
  {
    id: "gov-exams",
    label: "Government Exam Preparation",
    shortLabel: "Govt Exams",
    icon: "🏛️",
    badge: "Govt Exams",
    description: "UPSC, State PSC, SSC & Civil Services Foundation Material",
    badgeBg: "bg-rose-500/15 text-rose-400 border-rose-500/30",
  },
];

export interface SubjectCategoryConfig {
  id: SubjectCategory;
  label: string;
  icon: string;
  gradient: string;
  accentColor: string;
  borderAccent: string;
  badgeBg: string;
  description: string;
}

export const SUBJECT_CATEGORIES: SubjectCategoryConfig[] = [
  {
    id: "history",
    label: "History",
    icon: "📜",
    gradient: "from-amber-500/20 via-orange-500/10 to-yellow-500/20",
    accentColor: "text-amber-400",
    borderAccent: "border-amber-500/30",
    badgeBg: "bg-amber-500/15 text-amber-400 border-amber-500/30",
    description: "Indian and world history, civilizations, and modern eras",
  },
  {
    id: "political-science",
    label: "Political Science",
    icon: "🏛️",
    gradient: "from-purple-500/20 via-pink-500/10 to-violet-500/20",
    accentColor: "text-purple-400",
    borderAccent: "border-purple-500/30",
    badgeBg: "bg-purple-500/15 text-purple-400 border-purple-500/30",
    description: "Polity, constitution, democratic politics, and governance",
  },
  {
    id: "economics",
    label: "Economics",
    icon: "📈",
    gradient: "from-emerald-500/20 via-teal-500/10 to-green-500/20",
    accentColor: "text-emerald-400",
    borderAccent: "border-emerald-500/30",
    badgeBg: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
    description: "Macroeconomics, microeconomics, and economic development",
  },
  {
    id: "miscellaneous",
    label: "Miscellaneous",
    icon: "📦",
    gradient: "from-slate-500/20 via-gray-500/10 to-zinc-500/20",
    accentColor: "text-slate-400",
    borderAccent: "border-slate-500/30",
    badgeBg: "bg-slate-500/15 text-slate-400 border-slate-500/30",
    description: "General knowledge, reference materials, geography, and notes",
  },
];

export function getEducationLevelMeta(level: EducationLevel | string): EducationLevelConfig {
  const found = EDUCATION_LEVELS.find((l) => l.id === level);
  if (found) return found;
  return EDUCATION_LEVELS[1]; // default to Class 10
}

export function getSubjectCategoryMeta(category: SubjectCategory | string): SubjectCategoryConfig {
  const found = SUBJECT_CATEGORIES.find((c) => c.id === category);
  if (found) return found;
  return SUBJECT_CATEGORIES[0]; // default to History
}

export interface ClassifiedBook extends R2File {
  category: SubjectCategory;
  educationLevel: EducationLevel | "general";
  displayName: string;
  chapterNumber: number;
  folderPath: string;
}

// Letter mapping to Class: a-1, b-2, ... i-9, j-10, k-11, l-12
const LETTER_CLASS_MAP: Record<string, EducationLevel> = {
  i: "class-9",
  j: "class-10",
  k: "class-11",
  l: "class-12",
};

/**
 * Parses file key to extract the 4 standardized categories and education tier.
 */
export function classifyR2Book(file: R2File): ClassifiedBook {
  const lowerKey = file.key.toLowerCase();
  const parts = file.key
    .split("/")
    .map((p) => p.trim())
    .filter(Boolean);
  const rawFileName = parts[parts.length - 1] || file.key;
  const baseCode = rawFileName.replace(/\.[^/.]+$/, "").toLowerCase();

  let category: SubjectCategory = "miscellaneous";
  let educationLevel: EducationLevel | "general" = "general";
  let displayName = rawFileName.endsWith(".pdf") ? rawFileName.slice(0, -4) : rawFileName;
  let chapterNumber = 999;

  // 1. Check direct folder segment hierarchy (e.g. "history/class-10/Chapter 1.pdf")
  const validCategories: SubjectCategory[] = [
    "history",
    "political-science",
    "economics",
    "miscellaneous",
  ];
  const validLevels: EducationLevel[] = [
    "class-9",
    "class-10",
    "class-11",
    "class-12",
    "gov-exams",
  ];

  let pathCategoryFound = false;
  let pathLevelFound = false;

  if (parts.length >= 2) {
    const firstSeg = parts[0].toLowerCase();
    const catMatch = validCategories.find(
      (c) =>
        firstSeg === c ||
        (c === "political-science" && (firstSeg.includes("pol") || firstSeg.includes("civ"))),
    );
    if (catMatch) {
      category = catMatch;
      pathCategoryFound = true;
    }

    if (parts.length >= 3) {
      const secondSeg = parts[1].toLowerCase();
      const lvlMatch = validLevels.find(
        (l) =>
          secondSeg === l ||
          secondSeg.includes(l) ||
          secondSeg.includes(l.replace("-", " ")) ||
          secondSeg.includes(l.replace("-", "_")),
      );
      if (lvlMatch) {
        educationLevel = lvlMatch;
        pathLevelFound = true;
      }
    }
  }

  // 2. Direct NCERT code decoder (e.g. jess101, jess201, jess401, iest101, kehs101, lehs101)
  const isNcertCode = /^[a-z]{4}\d{3}$/i.test(baseCode);

  if (isNcertCode) {
    const firstChar = baseCode[0];
    if (!pathLevelFound && LETTER_CLASS_MAP[firstChar]) {
      educationLevel = LETTER_CLASS_MAP[firstChar];
    }

    // Determine Subject from code if not already set from path
    if (!pathCategoryFound) {
      if (
        baseCode.startsWith("jess4") ||
        baseCode.startsWith("keps") ||
        baseCode.startsWith("leps")
      ) {
        category = "political-science";
      } else if (
        baseCode.startsWith("jess2") ||
        baseCode.startsWith("keec") ||
        baseCode.startsWith("kest") ||
        baseCode.startsWith("leec")
      ) {
        category = "economics";
      } else if (
        baseCode.startsWith("jess1") ||
        baseCode.startsWith("jess3") ||
        baseCode.startsWith("kehs") ||
        baseCode.startsWith("lehs") ||
        baseCode.startsWith("iest") ||
        baseCode.startsWith("fees") ||
        baseCode.startsWith("gees") ||
        baseCode.startsWith("hees")
      ) {
        category = "history";
      }
    }

    // Determine Chapter number from the last 2 digits
    const last2Digits = parseInt(baseCode.slice(-2), 10);
    if (!isNaN(last2Digits)) {
      chapterNumber = last2Digits;
      // Multi-part sequels handling
      if (baseCode.startsWith("jess3")) {
        chapterNumber += 7; // Class 10 History Part 2 -> Chapter 8..12
      } else if (baseCode.startsWith("gees2")) {
        chapterNumber += 12; // Class 7 History Part 2 -> Chapter 13..20
      } else if (baseCode.startsWith("hees2")) {
        chapterNumber += 7; // Class 8 History Part 2 -> Chapter 8..16
      } else if (baseCode.startsWith("lehs2")) {
        chapterNumber += 4; // Class 12 History Part 2 -> Chapter 5..8
      } else if (baseCode.startsWith("lehs3")) {
        chapterNumber += 8; // Class 12 History Part 3 -> Chapter 9..12
      }
      displayName = `Chapter ${chapterNumber}`;
    }
  } else {
    // 3. Fallback: Decode from Path or Human-Readable Title if not determined
    if (!pathCategoryFound) {
      if (
        lowerKey.includes("/political-science") ||
        lowerKey.includes("political-science/") ||
        lowerKey.includes("/political science") ||
        lowerKey.includes("politics") ||
        lowerKey.includes("polity") ||
        lowerKey.includes("civics") ||
        lowerKey.includes("constitution") ||
        lowerKey.includes("democratic politics")
      ) {
        category = "political-science";
      } else if (
        lowerKey.includes("/economics") ||
        lowerKey.includes("economics/") ||
        lowerKey.includes("economy") ||
        lowerKey.includes("macroeconomics") ||
        lowerKey.includes("microeconomics") ||
        lowerKey.includes("economic development") ||
        lowerKey.includes("finance")
      ) {
        category = "economics";
      } else if (
        lowerKey.includes("/history") ||
        lowerKey.includes("history/") ||
        lowerKey.includes("ancient") ||
        lowerKey.includes("medieval") ||
        lowerKey.includes("contemporary world") ||
        lowerKey.includes("themes in world history") ||
        lowerKey.includes("themes in indian history")
      ) {
        category = "history";
      } else {
        category = "miscellaneous";
      }
    }

    // Detect Education Level if not already determined from path
    if (!pathLevelFound) {
      if (
        lowerKey.includes("class 9") ||
        lowerKey.includes("class-9") ||
        lowerKey.includes("class_9") ||
        lowerKey.includes("class9") ||
        lowerKey.includes("grade 9") ||
        lowerKey.includes("9th") ||
        /\b(ix|class-ix|class ix)\b/.test(lowerKey)
      ) {
        educationLevel = "class-9";
      } else if (
        lowerKey.includes("class 10") ||
        lowerKey.includes("class-10") ||
        lowerKey.includes("class_10") ||
        lowerKey.includes("class10") ||
        lowerKey.includes("grade 10") ||
        lowerKey.includes("10th") ||
        /\b(x|class-x|class x)\b/.test(lowerKey)
      ) {
        educationLevel = "class-10";
      } else if (
        lowerKey.includes("class 11") ||
        lowerKey.includes("class-11") ||
        lowerKey.includes("class_11") ||
        lowerKey.includes("class11") ||
        lowerKey.includes("grade 11") ||
        lowerKey.includes("11th") ||
        /\b(xi|class-xi|class xi)\b/.test(lowerKey)
      ) {
        educationLevel = "class-11";
      } else if (
        lowerKey.includes("class 12") ||
        lowerKey.includes("class-12") ||
        lowerKey.includes("class_12") ||
        lowerKey.includes("class12") ||
        lowerKey.includes("grade 12") ||
        lowerKey.includes("12th") ||
        /\b(xii|class-xii|class xii)\b/.test(lowerKey)
      ) {
        educationLevel = "class-12";
      } else if (
        lowerKey.includes("gov-exam") ||
        lowerKey.includes("govt-exam") ||
        lowerKey.includes("government") ||
        lowerKey.includes("upsc") ||
        lowerKey.includes("ssc") ||
        lowerKey.includes("psc") ||
        lowerKey.includes("ias") ||
        lowerKey.includes("civil-services") ||
        lowerKey.includes("civil services")
      ) {
        educationLevel = "gov-exams";
      }
    }

    // Extract Chapter number
    const chMatch = displayName.match(/(?:chapter|theme|ch|unit)\s*(\d+)/i);
    if (chMatch && chMatch[1]) {
      chapterNumber = parseInt(chMatch[1], 10);
    } else if (/prelim|intro|toc|cover/i.test(displayName)) {
      chapterNumber = 0;
    }
  }

  return {
    ...file,
    category,
    educationLevel,
    displayName,
    chapterNumber,
    folderPath: parts.slice(0, -1).join("/"),
  };
}

/**
 * Filter and numerically sort chapter books for the selected education level and subject category.
 */
export function filterBooks(
  books: ClassifiedBook[],
  educationLevel: EducationLevel,
  activeCategory: SubjectCategory | string,
  searchQuery: string,
): ClassifiedBook[] {
  const filtered = books.filter((book) => {
    // 1. Education Level Filter
    if (educationLevel === "gov-exams") {
      // Govt Exam Prep shows govt exam material, general references, plus senior secondary NCERTs (Class 11 & 12)
      const matchesGov =
        book.educationLevel === "gov-exams" ||
        book.educationLevel === "general" ||
        book.educationLevel === "class-11" ||
        book.educationLevel === "class-12";
      if (!matchesGov) return false;
    } else {
      // Specific class filter: Show books specifically for this class, or general books
      const matchesLevel =
        book.educationLevel === educationLevel || book.educationLevel === "general";
      if (!matchesLevel) return false;
    }

    // 2. Strict Subject Category Filter (No "all" fallback)
    if (book.category !== activeCategory) {
      return false;
    }

    // 3. Search Query Filter
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      const matchesTitle = book.displayName.toLowerCase().includes(q);
      const matchesKey = book.key.toLowerCase().includes(q);
      if (!matchesTitle && !matchesKey) return false;
    }

    return true;
  });

  // Sort numerically by Chapter Number (Chapter 1, Chapter 2... Chapter 10)
  return filtered.sort((a, b) => {
    if (a.chapterNumber !== b.chapterNumber) {
      return a.chapterNumber - b.chapterNumber;
    }
    return a.displayName.localeCompare(b.displayName, undefined, { numeric: true });
  });
}

const STORAGE_KEY = "doclens_education_level";

export function getSavedEducationLevel(): EducationLevel | null {
  if (typeof window === "undefined") return null;
  try {
    const saved = localStorage.getItem(STORAGE_KEY) as EducationLevel | null;
    if (saved && ["class-9", "class-10", "class-11", "class-12", "gov-exams"].includes(saved)) {
      return saved;
    }
  } catch (e) {
    console.warn("Could not read education level from localStorage:", e);
  }
  return null;
}

export function saveEducationLevel(level: EducationLevel): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY, level);
    window.dispatchEvent(new CustomEvent("doclens:education-level-changed", { detail: level }));
  } catch (e) {
    console.warn("Could not save education level to localStorage:", e);
  }
}
