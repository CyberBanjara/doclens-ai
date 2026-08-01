# General Settings Page

> **Route:** `/settings`  
> **Source File:** `settings.tsx`  
> **Layout:** [[SidebarLayout]]  
> **SEO Title:** `Anuwad — General Settings`

---

## Purpose

The **General Settings Page** is the unified configuration hub for the Anuwad application. It combines AI pipeline configuration, output language selection, neural voice management, API connectivity, and model browsing into a single streamlined interface.

---

## Layout Structure

Uses a `max-w-7xl` layout organized into three rows with a clean visual hierarchy:

```
┌─── Row 1 (Full Width) ────────────────────┐
│ ⚡ AI Pipeline Defaults                     │
│ (Mode, Style, Temperature)                 │
├─── Row 2 (Two Columns) ──────────────────┤
│ 🌐 Output Language  │ 🎙️ Natural Voice   │
│                      │    Cache Manager   │
├─── Row 3 (Two Columns) ──────────────────┤
│ 🔑 API Key Mgmt     │ 🧠 Model Selection │
└──────────────────────┴────────────────────┘
```

---

## UI Components & Interactive Elements

1. **AI Pipeline Defaults (Row 1 — Full Width):**
   - Configures default parameters: Mode (`translate` or `explain`), Tone Style (used only in `explain` mode), and LLM Temperature.
   - Positioned at the top for quick access since it's the most frequently adjusted section.

2. **Output Language (Row 2 — Left Column):**
   - Quick preset chips for regional and international languages (हिंदी, বাংলা, English, Spanish, etc.).
   - Search bar for finding or typing a custom language.

3. **Natural Voice Cache Manager (Row 2 — Right Column):**
   - Displays neural voices available for the currently selected output language.
   - Pre-download voices for offline use with real-time progress indicators.
   - Delete individual cached voices to reclaim storage space.
   - Powered by [[Voice Cache Layer]] (OPFS primary, IndexedDB fallback).

4. **API Key Management (Row 3 — Left Column):**
   - Displays server API key connectivity status.
   - Optional custom API key input with connection verification.

5. **Model Selection (Row 3 — Right Column):**
   - Displays compatible LLM models fetched from the server via [[OpenRouter API]].
   - Filterable by tabs: `free`, `popular`, and `all`.

---

## Removed Sections

The following sections were **removed** from the settings page UI to reduce clutter:

- **Storage & Memory Diagnostics:** Previously showed IndexedDB capacity bars and JS Heap / Canvas buffer metrics. The `MemoryDiagnostics` component still exists in the source for debugging but is no longer rendered.
- **Clear AI Cache Button:** Previously offered one-click purge of cached AI translations.

---

## Relationships

- **Workflow:** Sets the configuration variables used by the [[PDF to Translation Workflow]].

---

_Part of [[MOC — Pages]]_
