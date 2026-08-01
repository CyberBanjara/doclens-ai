/** Options for the R2 upload category picker (used by doc.$id.tsx and global-library.tsx). */
export const UPLOAD_CATEGORIES = [
  { id: "history", label: "📜 History", desc: "history/" },
  { id: "economics", label: "📈 Economics", desc: "economics/" },
  { id: "geography", label: "🌍 Geography", desc: "geography/" },
  { id: "civics", label: "🏛️ Civics", desc: "civics/" },
  { id: "science", label: "🔬 Science", desc: "science/" },
  { id: "custom", label: "✏️ Custom", desc: "Custom prefix" },
] as const;
