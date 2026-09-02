/** Options for the R2 upload Subject and Class picker (used by doc.$id.tsx and global-library.tsx). */
export const UPLOAD_CATEGORIES = [
  { id: "history", label: "History", icon: "📜", desc: "Indian & world history, civilizations" },
  {
    id: "political-science",
    label: "Political Science",
    icon: "🏛️",
    desc: "Polity, constitution, governance",
  },
  { id: "economics", label: "Economics", icon: "📈", desc: "Macro/microeconomics & development" },
  {
    id: "miscellaneous",
    label: "Miscellaneous",
    icon: "📦",
    desc: "General knowledge & references",
  },
] as const;

export const UPLOAD_EDUCATION_LEVELS = [
  { id: "class-6", label: "Class 6", icon: "🌱", desc: "Middle School 6th Grade" },
  { id: "class-7", label: "Class 7", icon: "📖", desc: "Middle School 7th Grade" },
  { id: "class-8", label: "Class 8", icon: "📚", desc: "Middle School 8th Grade" },
  { id: "class-9", label: "Class 9", icon: "🎒", desc: "Secondary 9th Grade" },
  { id: "class-10", label: "Class 10", icon: "🎯", desc: "Secondary 10th Grade (Boards)" },
  { id: "class-11", label: "Class 11", icon: "📚", desc: "Higher Secondary 11th Grade" },
  { id: "class-12", label: "Class 12", icon: "🎓", desc: "Senior Secondary 12th Grade (Boards)" },
  {
    id: "gov-exams",
    label: "Govt Exams",
    icon: "🏛️",
    desc: "UPSC / State PSC / SSC / Civil Services",
  },
  {
    id: "hobby-reading",
    label: "Hobby Reading",
    icon: "☕",
    desc: "Literature, Self-Study & Leisure",
  },
  { id: "general", label: "General / All", icon: "🌐", desc: "Foundational & Reference Material" },
] as const;
