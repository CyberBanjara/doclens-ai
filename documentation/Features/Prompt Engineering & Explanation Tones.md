# Prompt Engineering & Processing Styles

> Architecture of system prompts, output formatting rules, and mode-specific style profiles in Anuwad.

---

## 1. Overview

Anuwad provides two fully separated AI processing modes for document pages:

- **Translation Mode (`translate`):** Direct language-to-language translation with **2 Translation Styles** (Native, Mixed).
- **Explanation Mode (`explain`):** Conceptual explanations tailored by **5 Explanation Styles** (Standard, Simple, Story, Deep, AI Mode).

Translation and Explanation modes have entirely independent prompt pipelines — no shared style definitions or overlapping rules. The style selector in the UI dynamically changes its options based on the active mode.

All outputs are additionally sanitized by a post-processing pipeline (`cleanAiText`) that strips any residual markdown artifacts before storage and TTS consumption (see [[AI Response Sanitization]]).

---

## 2. Translation Styles

| Style ID | Label     | Directive Summary                                                                                 |
| :------- | :-------- | :------------------------------------------------------------------------------------------------ |
| `Native` | **Native** | Translate naturally and fluently. Preserve meaning, tone, and nuance. No added explanations.     |
| `Mixed`  | **Mixed**  | Blend the target language with English as bilingual speakers naturally do (e.g., Hinglish). Keep technical terms, acronyms, proper nouns in English. |

---

## 3. Explanation Styles

The original 13 explanation tones were consolidated into 5 core styles. Legacy IDs are automatically mapped to their new equivalents:

| Style ID   | Label          | Directive Summary                                                                                                      | Consolidated From (Legacy)                                                         |
| :--------- | :------------- | :--------------------------------------------------------------------------------------------------------------------- | :--------------------------------------------------------------------------------- |
| `Standard` | **Standard**   | Clear, balanced, well-organized explanations accessible to a general audience.                                         | —                                                                                  |
| `Simple`   | **Simple**     | Beginner-friendly. Avoids jargon, uses real-world analogies, sequential steps, practical examples, encouraging tone.  | ELI5, Step-by-Step, Visual Thinking, Analogical, Practical, Motivational           |
| `Story`    | **Story**      | Teaches through narratives, scenarios, or story-like progression. Emotionally engaging and memorable.                  | Storytelling, Socratic                                                             |
| `Deep`     | **Deep**       | Advanced technical depth with nuance, edge cases, multiple viewpoints, and critical analysis.                          | Expert Deep-Dive, Debate, Historical Context, Critical Thinking                    |
| `AI`       | **AI Mode**    | Holistic synthesis using structured reasoning — not word-by-word translation. Highlights contrasts and relationships.  | —                                                                                  |

---

## 4. Prompt Architecture

### System Prompt Structure (Current)

The `buildPagePayload()` function assembles prompts with a clean, unified structure:

**Translation Mode:**
```
[Role]       You are an expert document translator in a PDF reader.
[Context]    The content below is extracted from a PDF page.
[Task+Style] TASK: Translate into {language}.
             STYLE: {style.label} — {style.instruction}
[Rules]      Preserve the original structure, headings, lists, and logical flow.
             Output only the translated text — no explanations, preamble, or commentary.
[Format]     {FORMAT_RULES}
```

**Explanation Mode:**
```
[Role]       You are an AI reading assistant in a PDF reader.
[Context]    The content below is extracted from a PDF page.
[Task+Style] TASK: Explain in {language}.
             STYLE: {style.label} — {style.instruction}
[Rules]      {EXPLAIN_RULES}
[Format]     {FORMAT_RULES}
```

### Shared Format Rules (`FORMAT_RULES`)
- Output clean plain text only. No markdown, asterisks, hashtags, code fences, backticks, emojis, decorative symbols, bullet characters, or rich formatting.
- Write smooth, natural sentences suitable for reading and text-to-speech. Avoid robotic phrasing and repetition.

### Explanation Rules (`EXPLAIN_RULES`)
- Preserve factual accuracy — never invent information not in the source. Preserve technical terms, explaining them as appropriate for the style.
- Output only the final content. No preamble, meta commentary, or closing remarks.

---

## 5. Source Code References

### Core Prompt & Style Engine
- **Format rules & style definitions:** [openrouter.ts](file:///home/sanskar/Desktop/doclens-ai/src/lib/openrouter.ts#L669-L775)
  - `FORMAT_RULES` (L669–673): Clean plain text constraints for TTS.
  - `EXPLAIN_RULES` (L675–678): Factual accuracy & no-preamble enforcement.
  - `TRANSLATION_STYLES` (L689–702): Native and Mixed translation style specs.
  - `EXPLANATION_STYLES` (L737–775): 5 consolidated explanation style specs.
  - `LEGACY_STYLE_MAP` (L720–735): Maps the original 13 tone IDs to the 5 consolidated styles.
  - `MODE_LABELS` (L777–781): UI-facing labels for Translate vs Explain.
  - `getStylesForMode()` (L715–717): Returns the appropriate style list based on active mode.
  - `buildPagePayload()` (L794–834): Assembles system and user prompts into OpenRouter request format.

### AI Response Sanitization
- **Post-processing sanitizer:** [cleanAiText.ts](file:///home/sanskar/Desktop/doclens-ai/src/lib/cleanAiText.ts) — Strips markdown artifacts, code fences, bold/italic markers, blockquotes, and horizontal rules from AI output before saving to IndexedDB and feeding to TTS.

### Streaming & Server Proxy
- **Server-side SSE Proxy:** [openrouter.ts](file:///home/sanskar/Desktop/doclens-ai/src/lib/openrouter.ts#L294-L334) — Proxies LLM responses via Server-Sent Events while keeping API keys secure on the server.
- **Client SSE Stream Handler:** [openrouter.ts](file:///home/sanskar/Desktop/doclens-ai/src/lib/openrouter.ts#L550-L667) — Parses `data:` SSE chunks in real-time with automatic retry and error handling.

### Caching & Settings Hash
- **Settings Hash Calculation:** [storage/types.ts](file:///home/sanskar/Desktop/doclens-ai/src/lib/storage/types.ts) (`computeSettingsHash`) — Hashes `(modelId, mode, language, style, temperature)` to invalidate IndexedDB cache when user changes style or model.

### User Interface & Style Selection
- **Style selector in workspace:** [AiPipelineDefaultsSection.tsx](file:///home/sanskar/Desktop/doclens-ai/src/components/settings/AiPipelineDefaultsSection.tsx) — Mode-aware style dropdown that switches between translation and explanation styles.
- **Explanation setup dialog:** [ExplainSetupDialog.tsx](file:///home/sanskar/Desktop/doclens-ai/src/components/ExplainSetupDialog.tsx) — Interactive grid allowing selection of language and explanation styles.
- **Page override controls:** [PageWorkstation.tsx](file:///home/sanskar/Desktop/doclens-ai/src/components/PageWorkstation.tsx) — Per-page mode/style/temperature overrides.

---

_Part of [[MOC — Features]] and [[MOC — Pipelines]]_
