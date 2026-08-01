/**
 * Theme engine for Anuwad.
 *
 * Provides 12 built-in themes (6 light, 6 dark) + a "system" auto mode.
 * Persists the user's choice in localStorage and applies CSS custom-property
 * overrides on `:root` so every Tailwind / custom token updates instantly.
 */

// ── Types ──────────────────────────────────────────────────────────────────

export type ThemeMode = "light" | "dark";

export interface ThemeDefinition {
  id: string;
  label: string;
  mode: ThemeMode;
  /** 4–5 preview swatch hex colours shown on the theme card */
  swatches: string[];
  /** CSS custom-property values applied to :root */
  vars: Record<string, string>;
}

// ── Storage key ────────────────────────────────────────────────────────────

const STORAGE_KEY = "doclens-theme";

// ── Built-in themes ────────────────────────────────────────────────────────

export const LIGHT_THEMES: ThemeDefinition[] = [
  {
    id: "apple",
    label: "Apple (Light)",
    mode: "light",
    swatches: ["#f5f5f7", "#0066cc", "#1d1d1f", "#fafafc"],
    vars: {
      "--background": "#f5f5f7",
      "--foreground": "#1d1d1f",
      "--surface": "#ffffff",
      "--surface-2": "#fafafc",
      "--card": "#ffffff",
      "--card-foreground": "#1d1d1f",
      "--popover": "#ffffff",
      "--popover-foreground": "#1d1d1f",
      "--primary": "#0066cc",
      "--primary-foreground": "#ffffff",
      "--secondary": "#fafafc",
      "--secondary-foreground": "#1d1d1f",
      "--muted": "#f5f5f7",
      "--muted-foreground": "#7a7a7a",
      "--accent": "#2997ff",
      "--accent-foreground": "#ffffff",
      "--destructive": "#e30000",
      "--destructive-foreground": "#ffffff",
      "--border": "#e0e0e0",
      "--border-strong": "#d2d2d7",
      "--input": "#ffffff",
      "--ring": "#0071e3",
      "--syntax-key": "#0066cc",
      "--syntax-string": "#1d1d1f",
      "--syntax-number": "#7a7a7a",
      "--syntax-punct": "#7a7a7a",
    },
  },
  {
    id: "light",
    label: "Light",
    mode: "light",
    swatches: ["#faf5ff", "#6d28d9", "#e11d48", "#ec4899"],
    vars: {
      "--background": "#faf5ff",
      "--foreground": "#1e1133",
      "--surface": "#f3e8ff",
      "--surface-2": "#ede3fa",
      "--card": "#ffffff",
      "--card-foreground": "#1e1133",
      "--popover": "#ffffff",
      "--popover-foreground": "#1e1133",
      "--primary": "#6d28d9",
      "--primary-foreground": "#ffffff",
      "--secondary": "#ede3fa",
      "--secondary-foreground": "#1e1133",
      "--muted": "#f3e8ff",
      "--muted-foreground": "#6b5b7b",
      "--accent": "#c084fc",
      "--accent-foreground": "#1e1133",
      "--destructive": "#dc2626",
      "--destructive-foreground": "#ffffff",
      "--border": "rgba(109, 40, 217, 0.12)",
      "--border-strong": "rgba(109, 40, 217, 0.25)",
      "--input": "#ede3fa",
      "--ring": "#6d28d9",
      "--syntax-key": "#6d28d9",
      "--syntax-string": "#059669",
      "--syntax-number": "#d97706",
      "--syntax-punct": "#6b5b7b",
    },
  },
  {
    id: "lavender",
    label: "Lavender",
    mode: "light",
    swatches: ["#f5f3ff", "#7c3aed", "#8b5cf6", "#a78bfa"],
    vars: {
      "--background": "#f5f3ff",
      "--foreground": "#1e1b4b",
      "--surface": "#ede9fe",
      "--surface-2": "#e4dffe",
      "--card": "#ffffff",
      "--card-foreground": "#1e1b4b",
      "--popover": "#ffffff",
      "--popover-foreground": "#1e1b4b",
      "--primary": "#7c3aed",
      "--primary-foreground": "#ffffff",
      "--secondary": "#ede9fe",
      "--secondary-foreground": "#1e1b4b",
      "--muted": "#ede9fe",
      "--muted-foreground": "#6b6394",
      "--accent": "#a78bfa",
      "--accent-foreground": "#1e1b4b",
      "--destructive": "#dc2626",
      "--destructive-foreground": "#ffffff",
      "--border": "rgba(124, 58, 237, 0.12)",
      "--border-strong": "rgba(124, 58, 237, 0.25)",
      "--input": "#e4dffe",
      "--ring": "#7c3aed",
      "--syntax-key": "#7c3aed",
      "--syntax-string": "#059669",
      "--syntax-number": "#d97706",
      "--syntax-punct": "#6b6394",
    },
  },
  {
    id: "rose",
    label: "Rose",
    mode: "light",
    swatches: ["#fff1f2", "#e11d48", "#f43f5e", "#fb7185"],
    vars: {
      "--background": "#fff1f2",
      "--foreground": "#1c1017",
      "--surface": "#ffe4e6",
      "--surface-2": "#fecdd3",
      "--card": "#ffffff",
      "--card-foreground": "#1c1017",
      "--popover": "#ffffff",
      "--popover-foreground": "#1c1017",
      "--primary": "#e11d48",
      "--primary-foreground": "#ffffff",
      "--secondary": "#ffe4e6",
      "--secondary-foreground": "#1c1017",
      "--muted": "#ffe4e6",
      "--muted-foreground": "#9f616c",
      "--accent": "#fb7185",
      "--accent-foreground": "#1c1017",
      "--destructive": "#dc2626",
      "--destructive-foreground": "#ffffff",
      "--border": "rgba(225, 29, 72, 0.12)",
      "--border-strong": "rgba(225, 29, 72, 0.25)",
      "--input": "#fecdd3",
      "--ring": "#e11d48",
      "--syntax-key": "#e11d48",
      "--syntax-string": "#059669",
      "--syntax-number": "#d97706",
      "--syntax-punct": "#9f616c",
    },
  },
  {
    id: "sand",
    label: "Sand",
    mode: "light",
    swatches: ["#fffbeb", "#92400e", "#d97706", "#f59e0b"],
    vars: {
      "--background": "#fffbeb",
      "--foreground": "#1c1608",
      "--surface": "#fef3c7",
      "--surface-2": "#fde68a",
      "--card": "#ffffff",
      "--card-foreground": "#1c1608",
      "--popover": "#ffffff",
      "--popover-foreground": "#1c1608",
      "--primary": "#92400e",
      "--primary-foreground": "#ffffff",
      "--secondary": "#fef3c7",
      "--secondary-foreground": "#1c1608",
      "--muted": "#fef3c7",
      "--muted-foreground": "#8a7741",
      "--accent": "#f59e0b",
      "--accent-foreground": "#1c1608",
      "--destructive": "#dc2626",
      "--destructive-foreground": "#ffffff",
      "--border": "rgba(146, 64, 14, 0.12)",
      "--border-strong": "rgba(146, 64, 14, 0.25)",
      "--input": "#fde68a",
      "--ring": "#92400e",
      "--syntax-key": "#92400e",
      "--syntax-string": "#059669",
      "--syntax-number": "#d97706",
      "--syntax-punct": "#8a7741",
    },
  },
  {
    id: "sky",
    label: "Sky",
    mode: "light",
    swatches: ["#f0f9ff", "#0369a1", "#0284c7", "#38bdf8"],
    vars: {
      "--background": "#f0f9ff",
      "--foreground": "#0c1a2e",
      "--surface": "#e0f2fe",
      "--surface-2": "#bae6fd",
      "--card": "#ffffff",
      "--card-foreground": "#0c1a2e",
      "--popover": "#ffffff",
      "--popover-foreground": "#0c1a2e",
      "--primary": "#0284c7",
      "--primary-foreground": "#ffffff",
      "--secondary": "#e0f2fe",
      "--secondary-foreground": "#0c1a2e",
      "--muted": "#e0f2fe",
      "--muted-foreground": "#526a82",
      "--accent": "#38bdf8",
      "--accent-foreground": "#0c1a2e",
      "--destructive": "#dc2626",
      "--destructive-foreground": "#ffffff",
      "--border": "rgba(2, 132, 199, 0.12)",
      "--border-strong": "rgba(2, 132, 199, 0.25)",
      "--input": "#bae6fd",
      "--ring": "#0284c7",
      "--syntax-key": "#0284c7",
      "--syntax-string": "#059669",
      "--syntax-number": "#d97706",
      "--syntax-punct": "#526a82",
    },
  },
  {
    id: "slate",
    label: "Slate",
    mode: "light",
    swatches: ["#f8fafc", "#334155", "#475569", "#64748b"],
    vars: {
      "--background": "#f8fafc",
      "--foreground": "#0f172a",
      "--surface": "#f1f5f9",
      "--surface-2": "#e2e8f0",
      "--card": "#ffffff",
      "--card-foreground": "#0f172a",
      "--popover": "#ffffff",
      "--popover-foreground": "#0f172a",
      "--primary": "#475569",
      "--primary-foreground": "#ffffff",
      "--secondary": "#f1f5f9",
      "--secondary-foreground": "#0f172a",
      "--muted": "#f1f5f9",
      "--muted-foreground": "#64748b",
      "--accent": "#94a3b8",
      "--accent-foreground": "#0f172a",
      "--destructive": "#dc2626",
      "--destructive-foreground": "#ffffff",
      "--border": "rgba(71, 85, 105, 0.12)",
      "--border-strong": "rgba(71, 85, 105, 0.25)",
      "--input": "#e2e8f0",
      "--ring": "#475569",
      "--syntax-key": "#475569",
      "--syntax-string": "#059669",
      "--syntax-number": "#d97706",
      "--syntax-punct": "#64748b",
    },
  },
];

export const DARK_THEMES: ThemeDefinition[] = [
  {
    id: "apple-dark",
    label: "Apple (Dark)",
    mode: "dark",
    swatches: ["#1d1d1f", "#2997ff", "#ffffff", "#272729"],
    vars: {
      "--background": "#1d1d1f",
      "--foreground": "#ffffff",
      "--surface": "#272729",
      "--surface-2": "#2a2a2c",
      "--card": "#272729",
      "--card-foreground": "#ffffff",
      "--popover": "#272729",
      "--popover-foreground": "#ffffff",
      "--primary": "#2997ff",
      "--primary-foreground": "#ffffff",
      "--secondary": "#2a2a2c",
      "--secondary-foreground": "#ffffff",
      "--muted": "#2a2a2c",
      "--muted-foreground": "#cccccc",
      "--accent": "#0066cc",
      "--accent-foreground": "#ffffff",
      "--destructive": "#ff3b30",
      "--destructive-foreground": "#ffffff",
      "--border": "rgba(255, 255, 255, 0.08)",
      "--border-strong": "rgba(255, 255, 255, 0.18)",
      "--input": "#2a2a2c",
      "--ring": "#0071e3",
      "--syntax-key": "#2997ff",
      "--syntax-string": "#ffffff",
      "--syntax-number": "#cccccc",
      "--syntax-punct": "#cccccc",
    },
  },
  {
    id: "dark",
    label: "Dark",
    mode: "dark",
    swatches: ["#0b1326", "#4edea3", "#e11d48", "#f43f5e"],
    vars: {
      "--background": "#0b1326",
      "--foreground": "#dae2fd",
      "--surface": "#131b2e",
      "--surface-2": "#222a3d",
      "--card": "#171f33",
      "--card-foreground": "#dae2fd",
      "--popover": "#171f33",
      "--popover-foreground": "#dae2fd",
      "--primary": "#4edea3",
      "--primary-foreground": "#003824",
      "--secondary": "#2d3449",
      "--secondary-foreground": "#dae2fd",
      "--muted": "#222a3d",
      "--muted-foreground": "#8a96a8",
      "--accent": "#c0c1ff",
      "--accent-foreground": "#07006c",
      "--destructive": "oklch(0.65 0.22 25)",
      "--destructive-foreground": "oklch(0.98 0.005 260)",
      "--border": "rgba(255, 255, 255, 0.08)",
      "--border-strong": "rgba(255, 255, 255, 0.18)",
      "--input": "#2d3449",
      "--ring": "#4edea3",
      "--syntax-key": "#c0c1ff",
      "--syntax-string": "#6ffbbe",
      "--syntax-number": "#ffb95f",
      "--syntax-punct": "#86948a",
    },
  },
  {
    id: "ocean",
    label: "Ocean",
    mode: "dark",
    swatches: ["#0c1a2e", "#38bdf8", "#818cf8", "#a5b4fc"],
    vars: {
      "--background": "#0c1a2e",
      "--foreground": "#d6e4f0",
      "--surface": "#112240",
      "--surface-2": "#1a2f50",
      "--card": "#132337",
      "--card-foreground": "#d6e4f0",
      "--popover": "#132337",
      "--popover-foreground": "#d6e4f0",
      "--primary": "#38bdf8",
      "--primary-foreground": "#002842",
      "--secondary": "#1a2f50",
      "--secondary-foreground": "#d6e4f0",
      "--muted": "#1a2f50",
      "--muted-foreground": "#7a99b8",
      "--accent": "#818cf8",
      "--accent-foreground": "#0a0e3f",
      "--destructive": "oklch(0.65 0.22 25)",
      "--destructive-foreground": "oklch(0.98 0.005 260)",
      "--border": "rgba(56, 189, 248, 0.1)",
      "--border-strong": "rgba(56, 189, 248, 0.22)",
      "--input": "#1a2f50",
      "--ring": "#38bdf8",
      "--syntax-key": "#818cf8",
      "--syntax-string": "#67e8f9",
      "--syntax-number": "#fbbf24",
      "--syntax-punct": "#7a99b8",
    },
  },
  {
    id: "forest",
    label: "Forest",
    mode: "dark",
    swatches: ["#0a1a0e", "#22c55e", "#4ade80", "#86efac"],
    vars: {
      "--background": "#0a1a0e",
      "--foreground": "#d1e7d6",
      "--surface": "#0f261a",
      "--surface-2": "#163324",
      "--card": "#112a1a",
      "--card-foreground": "#d1e7d6",
      "--popover": "#112a1a",
      "--popover-foreground": "#d1e7d6",
      "--primary": "#22c55e",
      "--primary-foreground": "#003314",
      "--secondary": "#163324",
      "--secondary-foreground": "#d1e7d6",
      "--muted": "#163324",
      "--muted-foreground": "#6fa882",
      "--accent": "#86efac",
      "--accent-foreground": "#002e0e",
      "--destructive": "oklch(0.65 0.22 25)",
      "--destructive-foreground": "oklch(0.98 0.005 260)",
      "--border": "rgba(34, 197, 94, 0.1)",
      "--border-strong": "rgba(34, 197, 94, 0.22)",
      "--input": "#163324",
      "--ring": "#22c55e",
      "--syntax-key": "#86efac",
      "--syntax-string": "#6ee7b7",
      "--syntax-number": "#fbbf24",
      "--syntax-punct": "#6fa882",
    },
  },
  {
    id: "sunset",
    label: "Sunset",
    mode: "dark",
    swatches: ["#1a0f0a", "#f97316", "#fb923c", "#fdba74"],
    vars: {
      "--background": "#1a0f0a",
      "--foreground": "#f0ddd0",
      "--surface": "#261810",
      "--surface-2": "#332218",
      "--card": "#221610",
      "--card-foreground": "#f0ddd0",
      "--popover": "#221610",
      "--popover-foreground": "#f0ddd0",
      "--primary": "#f97316",
      "--primary-foreground": "#1a0800",
      "--secondary": "#332218",
      "--secondary-foreground": "#f0ddd0",
      "--muted": "#332218",
      "--muted-foreground": "#b58a6f",
      "--accent": "#fdba74",
      "--accent-foreground": "#1a0800",
      "--destructive": "#ef4444",
      "--destructive-foreground": "#ffffff",
      "--border": "rgba(249, 115, 22, 0.1)",
      "--border-strong": "rgba(249, 115, 22, 0.22)",
      "--input": "#332218",
      "--ring": "#f97316",
      "--syntax-key": "#fdba74",
      "--syntax-string": "#fbbf24",
      "--syntax-number": "#fb923c",
      "--syntax-punct": "#b58a6f",
    },
  },
  {
    id: "sea",
    label: "Sea",
    mode: "dark",
    swatches: ["#0a1a1e", "#06b6d4", "#22d3ee", "#67e8f9"],
    vars: {
      "--background": "#0a1a1e",
      "--foreground": "#d0e8ee",
      "--surface": "#0f2a30",
      "--surface-2": "#143840",
      "--card": "#0e2428",
      "--card-foreground": "#d0e8ee",
      "--popover": "#0e2428",
      "--popover-foreground": "#d0e8ee",
      "--primary": "#06b6d4",
      "--primary-foreground": "#00252e",
      "--secondary": "#143840",
      "--secondary-foreground": "#d0e8ee",
      "--muted": "#143840",
      "--muted-foreground": "#6ba8b8",
      "--accent": "#67e8f9",
      "--accent-foreground": "#002830",
      "--destructive": "oklch(0.65 0.22 25)",
      "--destructive-foreground": "oklch(0.98 0.005 260)",
      "--border": "rgba(6, 182, 212, 0.1)",
      "--border-strong": "rgba(6, 182, 212, 0.22)",
      "--input": "#143840",
      "--ring": "#06b6d4",
      "--syntax-key": "#67e8f9",
      "--syntax-string": "#6ee7b7",
      "--syntax-number": "#fbbf24",
      "--syntax-punct": "#6ba8b8",
    },
  },
  {
    id: "mint",
    label: "Mint",
    mode: "dark",
    swatches: ["#0a1e1a", "#2dd4bf", "#5eead4", "#99f6e4"],
    vars: {
      "--background": "#0a1e1a",
      "--foreground": "#d0ede6",
      "--surface": "#0f2e28",
      "--surface-2": "#143d34",
      "--card": "#0e2822",
      "--card-foreground": "#d0ede6",
      "--popover": "#0e2822",
      "--popover-foreground": "#d0ede6",
      "--primary": "#2dd4bf",
      "--primary-foreground": "#002e24",
      "--secondary": "#143d34",
      "--secondary-foreground": "#d0ede6",
      "--muted": "#143d34",
      "--muted-foreground": "#6bb8a6",
      "--accent": "#99f6e4",
      "--accent-foreground": "#002e24",
      "--destructive": "oklch(0.65 0.22 25)",
      "--destructive-foreground": "oklch(0.98 0.005 260)",
      "--border": "rgba(45, 212, 191, 0.1)",
      "--border-strong": "rgba(45, 212, 191, 0.22)",
      "--input": "#143d34",
      "--ring": "#2dd4bf",
      "--syntax-key": "#99f6e4",
      "--syntax-string": "#6ee7b7",
      "--syntax-number": "#fbbf24",
      "--syntax-punct": "#6bb8a6",
    },
  },
];

const ALL_THEMES: ThemeDefinition[] = [...LIGHT_THEMES, ...DARK_THEMES];

// ── Helpers ────────────────────────────────────────────────────────────────

/** Read the stored theme id (defaults to "system"). */
export function getTheme(): string {
  try {
    return localStorage.getItem(STORAGE_KEY) ?? "system";
  } catch {
    return "system";
  }
}

/** Persist a theme id. */
export function setTheme(id: string): void {
  try {
    localStorage.setItem(STORAGE_KEY, id);
  } catch {
    /* storage full – silently ignore */
  }
}

/** Find a theme definition by id. Returns undefined for "system". */
function findTheme(id: string): ThemeDefinition | undefined {
  return ALL_THEMES.find((t) => t.id === id);
}

/** Morning through late afternoon counts as "daytime" → light mode. */
const DAY_START_HOUR = 6;
/** From this hour onward (inclusive) counts as evening/night → dark mode. */
const DAY_END_HOUR = 18;

/** True if the system clock's current local hour falls within the daytime window. */
function isDaytimeNow(): boolean {
  const hour = new Date().getHours();
  return hour >= DAY_START_HOUR && hour < DAY_END_HOUR;
}

/**
 * Resolve which concrete theme should be used.
 * If "system", picks light mode during the day and dark mode in the evening/night,
 * based on the device's current system clock time (not the OS dark-mode setting).
 */
function resolveTheme(id: string): ThemeDefinition {
  if (id !== "system") {
    const t = findTheme(id);
    if (t) return t;
  }
  // system / fallback — driven by time of day
  return isDaytimeNow()
    ? (findTheme("apple") as ThemeDefinition) || (findTheme("light") as ThemeDefinition)
    : (findTheme("apple-dark") as ThemeDefinition) || (findTheme("dark") as ThemeDefinition);
}

/**
 * Apply a theme by injecting CSS custom-property overrides on :root
 * and toggling the .dark class on <html>.
 */
export function applyTheme(id: string): void {
  const theme = resolveTheme(id);
  const root = document.documentElement;

  // Set CSS variables
  for (const [key, value] of Object.entries(theme.vars)) {
    root.style.setProperty(key, value);
  }

  // Toggle dark class for Tailwind dark variant
  if (theme.mode === "dark") {
    root.classList.add("dark");
  } else {
    root.classList.remove("dark");
  }

  // Update glass-panel backgrounds for light themes
  // (the glass-panel has hardcoded rgba that assumes dark bg)
  root.dataset.themeMode = theme.mode;
  root.dataset.themeId = theme.id;
}

/** How often to re-check the clock for a light/dark boundary crossing. */
const TIME_CHECK_INTERVAL_MS = 60_000;

/**
 * Initialise the theme on app boot + keep re-checking the system clock so
 * "system" mode flips between light and dark as the time of day crosses the
 * morning/evening boundary while the app stays open (no page reload needed).
 */
export function initTheme(): void {
  const id = getTheme();
  applyTheme(id);

  setInterval(() => {
    if (getTheme() === "system") {
      applyTheme("system");
    }
  }, TIME_CHECK_INTERVAL_MS);
}
