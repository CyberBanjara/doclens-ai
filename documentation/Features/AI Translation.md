# AI Translation & Explanation Feature

> Stream translation and explanation capabilities with mode-separated style profiles and post-processing sanitization.

---

## Capabilities

- **Translation Mode (`translate`):** Direct language-to-language translation preserving original text structure and formatting into 90+ languages. Supports **2 Translation Styles:**
  - **Native** — Fluent, natural translation preserving meaning and tone.
  - **Mixed** — Bilingual blend (e.g., Hinglish) keeping technical terms and proper nouns in English.

- **Explanation Mode (`explain`):** Deep conceptual explanations powered by **5 Explanation Styles:**
  - **Standard**, **Simple**, **Story**, **Deep**, and **AI Mode**.
  - These are consolidated from the original 13 tones (legacy IDs like ELI5, Socratic, etc. are automatically mapped to their new equivalents).

- **TTS-Friendly Output:** System prompts enforce clean plain text (FORMAT_RULES). Additionally, a post-processing sanitizer (`cleanAiText`) strips any residual markdown artifacts (hashes, asterisks, code fences, bold/italic markers, blockquotes) before saving to IndexedDB and feeding to the TTS engine.

- **Mode-Separated Styles:** Translation and Explanation modes have completely independent style sets. The UI dynamically updates the style selector when the user switches modes.

---

## Technical Integration

- Calls server functions that proxy requests to [[OpenRouter API]] models as live SSE streams.
- Uses `AbortController` bound to client request lifecycle to stop streaming on cancellation or page navigation.
- Computes a `settingsHash` covering `(modelId, mode, language, style, temperature)` to validate IndexedDB cache entries.
- Default model: **Liquid LFM 2.5** (`liquid/lfm-2.5-2.6b:free`) — configurable via `VITE_OPENROUTER_DEFAULT_MODEL` env variable.

---

## Code References

- **Prompt Construction & Styles:** [openrouter.ts](file:///home/sanskar/Desktop/doclens-ai/src/lib/openrouter.ts#L669-L834)
- **AI Response Sanitizer:** [cleanAiText.ts](file:///home/sanskar/Desktop/doclens-ai/src/lib/cleanAiText.ts)
- **Settings Hash Calculation:** [storage/types.ts](file:///home/sanskar/Desktop/doclens-ai/src/lib/storage/types.ts)
- **UI Style Selector:** [AiPipelineDefaultsSection.tsx](file:///home/sanskar/Desktop/doclens-ai/src/components/settings/AiPipelineDefaultsSection.tsx)

---

## Relationships

- **Detailed Documentation:** See [[Prompt Engineering & Explanation Tones]].
- **Post-Processing:** See [[AI Response Sanitization]].
- **Component:** [[PageWorkstation]], [[ExplainSetupDialog]].
- **Dependencies:** [[OpenRouter API]].

---

_Part of [[MOC — Features]]_
