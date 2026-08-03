# AI Translation & Explanation Feature

> Stream translation and explanation capabilities powered by 13 specialized explanation tone profiles.

---

## Capabilities

- **Translation Mode (`translate`):** Direct language-to-language translation preserving original text structure and formatting into 90+ languages.
- **Explanation Mode (`explain`):** Deep conceptual explanations powered by **13 Explanation Tones (Styles)** including:
  - **Standard**, **ELI5**, **Storytelling**, **Socratic**, **Step-by-Step**, **Visual Thinking**, **Analogical**, **Practical**, **Expert Deep-Dive**, **Debate**, **Historical Context**, **Motivational**, and **Critical Thinking**.
- **TTS-Friendly Native Prompting:** Applies negative generation rules natively in system prompts to prevent markdown, emojis, code fences, and decorative symbols, ensuring output is immediately ready for neural Text-to-Speech narration.

---

## Technical Integration

- Calls server functions that proxy requests to [[OpenRouter API]] models as live SSE streams.
- Uses `AbortController` bound to client request lifecycle to stop streaming on cancellation or page navigation.
- Computes a `settingsHash` covering `(modelId, mode, language, style, temperature)` to validate IndexedDB cache entries.

---

## Code References

- **Prompt Construction & Tones:** [openrouter.ts](file:///home/sanskar/Desktop/doclens-ai/src/lib/openrouter.ts#L614-L783)
- **Settings Hash Calculation:** [storage/types.ts](file:///home/sanskar/Desktop/doclens-ai/src/lib/storage/types.ts#L64-L78)
- **UI Tone Selector:** [ExplainSetupDialog.tsx](file:///home/sanskar/Desktop/doclens-ai/src/components/ExplainSetupDialog.tsx#L85-L107)

---

## Relationships

- **Detailed Documentation:** See [[Prompt Engineering & Explanation Tones]].
- **Component:** [[PageWorkstation]], [[ExplainSetupDialog]].
- **Dependencies:** [[OpenRouter API]].

---

_Part of [[MOC — Features]]_

