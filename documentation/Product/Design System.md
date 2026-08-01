# Design System

> The visual design language of Anuwad — the **Deep Ocean** theme.

---

## Color Palette

| Token                  | Value                    | Usage                                     |
| ---------------------- | ------------------------ | ----------------------------------------- |
| `--background`         | `#0b1326`                | Page background                           |
| `--foreground`         | `#dae2fd`                | Primary text                              |
| `--surface`            | `#131b2e`                | Card backgrounds                          |
| `--surface-2`          | `#222a3d`                | Elevated surfaces, inputs                 |
| `--primary`            | `#4edea3`                | CTAs, active states, brand accent (green) |
| `--primary-foreground` | `#003824`                | Text on primary backgrounds               |
| `--accent`             | `#c0c1ff`                | Secondary accent (lavender)               |
| `--destructive`        | `oklch(0.65 0.22 25)`    | Error states, delete actions              |
| `--muted-foreground`   | `#8a96a8`                | Secondary text, labels                    |
| `--border`             | `rgba(255,255,255,0.08)` | Subtle dividers                           |
| `--ring`               | `#4edea3`                | Focus rings                               |

---

## Typography

| Token         | Font           | Usage                               |
| ------------- | -------------- | ----------------------------------- |
| `--font-sans` | Inter          | Body text, UI labels                |
| `--font-mono` | JetBrains Mono | Technical labels, code, diagnostics |

**Key patterns:**

- Section headers: `font-mono text-[10px] uppercase tracking-widest` — creates a "HUD / data readout" aesthetic
- Body text: `text-sm` (14px) with `font-feature-settings: "cv11", "ss01"`
- Reader text: 15px / 1.75 line-height for translated content

---

## Visual Patterns

### Glassmorphism

Cards and panels use `.glass-panel`:

- `backdrop-filter: blur(12px)`
- `background: rgba(19, 27, 46, 0.6)`
- `border: 1px solid rgba(255,255,255,0.06)`

### Micro-animations

- Card hover: `translate-y(-4px)` lift + enhanced shadow
- Page card enter: 250ms fade-in + slide-up
- Active page sync: 1.5s pulse-border animation
- Button press: `scale(0.97)` on active

### Custom Controls

- Range sliders: Green thumb with glow shadow
- Scrollbars: 6px width, semi-transparent
- Toggle pills: Custom sliding indicator

---

## Background Patterns

- **Library grid:** `.bg-grid` — 32px CSS grid lines at 2.5% opacity
- **PDF viewer:** `.pdf-viewer-bg` — vertical gradient from `#1a1a2e` → `#16213e` → `#0f1624`

---

## Related

- [[What is Anuwad]] — Product context
- [[Tech Stack]] — Implementation details
- [[Library Page]] — Design system in action
- [[Workspace Page]] — Reader text and glassmorphism usage

---

_Part of [[MOC — Product]]_
