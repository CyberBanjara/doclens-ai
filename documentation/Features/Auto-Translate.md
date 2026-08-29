# Continuous Auto-Read

> Seamless page-to-page playback: translate-ahead + auto-advance, driven by the AI tab and TTS engine working together.

> **Note:** an earlier "Auto-Translate" feature (a background pre-translation queue with a floating progress pill) was removed. This doc describes the feature that replaced it.

---

## Capabilities

- While a user listens to a translated/explained page via TTS, the app translates the _next_ page ahead of time so playback can continue without a pause.
- When playback finishes the current page and **Continuous Play** is enabled, the reader automatically advances to the next page and starts reading it.
- The "Continuous Play" toggle is a TTS setting, persisted in `localStorage` (`doclens:tts-continuous`) via [[TtsContext|Piper Neural TTS]] (`src/context/TtsContext.tsx`).

---

## Workflow Details

1. [[RightPanel]] dispatches `doclens:ensure-page-ready` for the active page (and, once playback is under way with Continuous Play on, for the _next_ page too) — see `src/components/RightPanel.tsx`.
2. [[PageWorkstation]] listens for `doclens:ensure-page-ready`; if that page isn't already translated with matching settings, it runs the AI pipeline for it. On success it dispatches `doclens:page-ready`.
3. `RightPanel` listens for `doclens:page-ready`; if the ready page is the one the user is currently on (and hasn't auto-played yet), it calls `play()` from `TtsContext`.
4. When `TtsContext` finishes the last sentence of a page and `continuousPlay` is `true`, it dispatches `doclens:tts-next-page`. `RightPanel` listens for this and advances `activePage`, restarting the loop from step 1.

---

## Relationships

- **Components:** [[PageWorkstation]], [[RightPanel]].
- **Context:** `TtsContext` (`src/context/TtsContext.tsx`).
- **Events:** `doclens:ensure-page-ready`, `doclens:page-ready`, `doclens:tts-next-page`.
- **Workflow:** [[Translation to TTS Workflow]].

---

_Part of [[MOC — Features]]_
