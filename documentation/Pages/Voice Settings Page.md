# Voice Settings Page

> **Route:** `/settings/voice`  
> **Source File:** `settings_.voice.tsx`  
> **Layout:** [[SidebarLayout]]  
> **SEO Title:** `Anuwad — Voice Settings`

---

## Purpose

The **Voice Settings Page** manages the Text-to-Speech (TTS) subsystem. It configures default speech output engines, handles Piper neural voice models, controls playback speed and pitch, and hosts the browser-native Web Speech API voice selection inventory.

---

## Layout Overview

Organized in a single column (`max-w-4xl`) for linear settings configuration (Language → Engine → Voice → Speed/Pitch).

```
┌─── Section 1 ─────────────────────┐
│ 🌐 Current Document Language      │
├─── Section 2 ─────────────────────┤
│ 🎙️ Neural Voice Models (Piper)    │
│    - Engine Selection Toggle      │
│    - Catalog Catalog Modal        │
├─── Section 3 ─────────────────────┤
│ 🎚️ Speed and Pitch Controls        │
├─── Section 4 ─────────────────────┤
│ 🗣️ Browser Voices List            │
│    - Search and Favorite Stars    │
└───────────────────────────────────┘
```

---

## UI Components & Interactive Elements

1. **Document Language Card:**
   - Displays the current language and total matching system voices. Clicking the change button opens a language modal listing 90+ languages.
2. **Neural Voice Models (Piper) Card:**
   - **Engine Preference Toggle:** Configures target engines (`auto` / `neural` / `browser`).
   - **Installed Voice Rows:** Shows installed models, test playback triggers, and deletion buttons.
   - **Browse Catalog Button:** Opens the [[Piper Neural TTS|Piper Model Catalog]] modal for downloading offline neural voices.
3. **Speed and Pitch Controls:**
   - Sliders adjusting speed (0.25x to 4x) and pitch (0x to 2x) for both engines.
4. **Browser Voice List:**
   - Displays local and online system voices. Includes search filters, language matching toggles, favorite stars to pin selections to the top, and instant preview speakers.

---

## Technical Features

- **Offline WASM Engine:** Piper voices are cached directly in browser storage via WebAssembly.
- **Language-Aware Preview:** The test playback button plays a custom, language-appropriate sample sentence depending on the target language.
- **Per-Language Memory:** Custom selected voices are saved automatically on a per-language basis to prevent resetting when switching documents.

---

## Relationships

- **Workflow:** Feeds voice metadata into the [[Translation to TTS Workflow]].
- **Key APIs:** [[Piper WASM Engine]], [[Web Speech API]].

---

_Part of [[MOC — Pages]]_
