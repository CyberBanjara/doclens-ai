# Per-Page Overrides Feature

> Fine-grained AI configuration adjustments for individual pages.

---

## Capabilities

- Allows configuring custom AI parameters for specific pages.
- Overrides global settings without changing application defaults.
- Includes a JSON editor for direct API payload modification.

---

## Override Parameters

- **AI Model:** Select alternative LLM models for specific pages.
- **Mode:** Switch between `translate` and `explain` (the only two `GlobalMode` values in `src/lib/openrouter.ts`; legacy "summarize"/"keypoints" values collapse into `explain`).
- **Tone Style:** Adjust the explanation output tone.
- **Temperature:** Configure LLM creativity level.

All four fields feed `computeSettingsHash()` (`src/lib/storage.ts`), which the app uses to detect whether a page's cached AI result is stale relative to its current settings.

---

## UI Workflows

- Toggled via the gear icon (⚙) in the page workstation card.
- Opens a collapsible panel containing parameter selectors.
- Includes an "Edit JSON" mode that opens a textarea editor for modifying the raw API payload.

---

## Relationships

- **Component:** [[PageWorkstation]].

---

_Part of [[MOC — Features]]_
