# PageWorkstation Component

> **File:** `src/components/PageWorkstation.tsx`
> **Type:** AI Translation Control Panel

---

## Purpose

The workstation component acts as the main controller for the translation workspace. It coordinates per-page translation state (run/cancel/dedup), request payload construction, user setting overrides, and the connective events that drive [[Auto-Translate|continuous auto-read]] and TTS playback.

---

## UI Sections & Elements

1. **Page Workstation Card:**
   - **Header:** Shows page status, custom badges, TTS buttons (Play, Pause, Stop, Forward, Rewind), and the override panel toggle (⚙).
   - **Body:** Shows the streaming translation output. Clickable sentence chunks highlight in sync with the audio player during TTS playback.
2. **Collapsible Override Panel (⚙):**
   - Hosts selectors to configure model, mode, style, and temperature settings for the active page.
   - The style selector dynamically changes based on the current mode: **Translation styles** (Native, Mixed) in Translate mode, **Explanation styles** (Standard, Simple, Story, Deep, AI Mode) in Explain mode.
   - Provides reset buttons and a JSON payload editor.
3. **Loading States:**
   - Uses [[LoadingLogo]] as a branded placeholder during page rendering and processing.

---

## State & Engine Integration

- **SSE Streaming:** Uses real-time Server-Sent Events via `streamCompletion()` from [[OpenRouter API]] to pipe translation tokens to the UI progressively, with periodic flush of the streaming buffer.
- **AI Response Sanitization:** All streamed results are passed through `cleanAiText()` (see [[AI Response Sanitization]]) before being saved to IndexedDB and displayed in the UI, stripping any markdown artifacts.
- **Auto-Translate Active Page:** On document load, auto-translation now targets the currently visible `activePage` instead of defaulting to page 1. A ref (`autoTranslatedInitialPageRef`) tracks per-document auto-translation to avoid duplicate runs.
- **Auto-Read Events:** Dispatches/listens for `doclens:page-ready` and `doclens:ensure-page-ready` events that drive [[Auto-Translate|continuous auto-read]] and TTS auto-play in `RightPanel`.
- **`localStorage` State Persistence:** Persists AI defaults (model, mode, style, temperature, language) as user preferences.
- **Error Handling:** Granular error handling with descriptive toast messages for extraction failures, storage quota exhaustion, and API errors.

---

## Relationships

- **Used In:** [[Workspace Page]].
- **Feature powered:** [[AI Translation]], [[Auto-Translate]], [[Per-Page Overrides]], [[Text-to-Speech]].
- **Components:** [[LoadingLogo]].

---

_Part of [[MOC — Components]]_
