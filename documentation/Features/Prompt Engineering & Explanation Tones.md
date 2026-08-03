# Prompt Engineering & Explanation Tones

> Comprehensive documentation of prompt engineering techniques, system prompts, negative generation rules, and explanation tone profiles implemented in Anuwad.

---

## 1. Overview

Anuwad provides two primary AI processing modes for document pages:
- **Translation Mode (`translate`):** Direct language-to-language translation preserving exact page structure and formatting without added commentary.
- **Explanation Mode (`explain`):** Deep conceptual explanations tailored by **13 Explanation Tones (Styles)** ranging from ELI5 to Storytelling and Expert Deep-Dive.

All prompts are engineered to produce **clean, TTS-friendly plain text** directly natively via system instructions without relying on expensive post-filtering regex.

---

## 2. Explanation Tones (Styles) Breakdown

In **Explanation Mode**, the user can choose from 13 distinct explanation tones. Each tone modifies the AI system directive to adjust the depth, vocabulary, narrative structure, and framing of the page content:

| Tone ID              | Display Label                 | Description & System Directive                                                                                                                              |
| :------------------- | :---------------------------- | :---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Standard`           | **Standard**                  | Balanced, neutral, clear, and easy-to-understand explanations with structured flow.                                                                         |
| `ELI5`               | **ELI5 (Explain Like I'm 5)** | Explains as if teaching a complete beginner or young learner. Avoids jargon; defines necessary technical terms in simple language using intuitive examples. |
| `Storytelling`       | **Storytelling**              | Teaches concepts using narratives, real-world scenarios, characters, or story-like progression for an emotionally engaging experience.                      |
| `Socratic`           | **Socratic**                  | Teaches through guided questions and progressive reasoning to encourage critical thinking rather than revealing conclusions immediately.                    |
| `Step-by-Step`       | **Step-by-Step**              | Breaks explanations into sequential logical stages where each step builds naturally on the previous one.                                                    |
| `Visual Thinking`    | **Visual Thinking**           | Uses mental imagery, hierarchy, spatial relationships, and diagram-like descriptions to help visualize complex systems.                                     |
| `Analogical`         | **Analogical**                | Uses comparisons and analogies with familiar real-world systems to simplify abstract concepts.                                                              |
| `Practical`          | **Practical**                 | Focuses on real-world applications, implementation methods, use cases, and concrete outcomes.                                                               |
| `Expert Deep-Dive`   | **Expert Deep-Dive**          | Provides advanced technical depth, nuances, edge cases, and detailed reasoning, assuming prerequisite domain knowledge.                                     |
| `Debate`             | **Debate**                    | Presents multiple viewpoints, trade-offs, arguments, strengths, weaknesses, and counterarguments without oversimplifying.                                   |
| `Historical Context` | **Historical Context**        | Explains historical background, evolution, key discoveries, timeline, and major contributors behind the concepts.                                           |
| `Motivational`       | **Motivational**              | Uses encouraging, confidence-building, and supportive language to reduce intimidation around complex subjects.                                              |
| `Critical Thinking`  | **Critical Thinking**         | Analyzes underlying assumptions, evaluates evidence, identifies limitations, and promotes analytical understanding.                                         |

---

## 3. Prompt Engineering Architecture

The prompt pipeline in Anuwad relies on strict native generation rules to ensure optimal rendering, high factual accuracy, and instant compatibility with text-to-speech engines.

### System Prompt Structure

```
[Assistant Role Definition]
You are an advanced AI reading and teaching assistant integrated into a PDF.js-based document reader.

[Task Specification]
EXPLANATION MODE / TRANSLATION MODE
Target/Response Language: {language}
Selected Explanation Style: {style.label}
Style directive: {style.instruction}

[Global Rules]
- Preserve factual accuracy.
- Preserve important technical terminology.
- Process one page at a time. Output only final processed content (no preamble/commentary).

[Negative Generation Rules]
- Do not produce markdown syntax, asterisks, hashtags, code fences, or backticks.
- Do not produce emojis, decorative symbols, decorative Unicode, ASCII art, or visual separators.
- Do not produce bullet decoration characters, rich-text formatting, or UI styling patterns.
- Do not use excessive or decorative punctuation, decorative quotation styling, or heading markers.
- Output must be clean plain text with natural readable structure suitable for reading & TTS.
- Write smooth, natural, human-like sentences.
```

---

## 4. Source Code & Codebase References

Below are direct clickable links to the files and code locations implementing prompt engineering, tone management, and streaming in this workspace:

### Core Prompt & Tone Engine
- **Prompt definitions & Explanation Tones:** [openrouter.ts](file:///home/sanskar/Desktop/doclens-ai/src/lib/openrouter.ts#L614-L783)
  - `EXPLANATION_STYLES` array (Lines 650–730): Contains all 13 tone specs & instructions.
  - `MODE_INSTRUCTIONS` (Lines 731–741): Defines strict task boundaries for `translate` vs `explain`.
  - `NEGATIVE_RULES` (Lines 614–622): Plain-text constraints for TTS compatibility.
  - `GLOBAL_RULES` (Lines 623–627): Factual accuracy & no-preamble enforcement.
  - `buildPagePayload()` (Lines 754–783): Assembles system and user prompts into OpenRouter request format.

### Streaming & Server Proxy
- **Server-side SSE Proxy:** [openrouter.ts](file:///home/sanskar/Desktop/doclens-ai/src/lib/openrouter.ts#L294-L334) (`completeWithServerOpenRouter`) — Proxies LLM responses via Server-Sent Events while keeping API keys secure on the server.
- **Client SSE Stream Handler:** [openrouter.ts](file:///home/sanskar/Desktop/doclens-ai/src/lib/openrouter.ts#L550-L608) (`streamCompletion`) — Parses `data:` SSE chunks in real-time with automatic retry and error handling.

### Caching & Settings Hash
- **Settings Hash Calculation:** [storage/types.ts](file:///home/sanskar/Desktop/doclens-ai/src/lib/storage/types.ts#L64-L78) (`computeSettingsHash`) — Hashes `(modelId, mode, language, style, temperature)` to invalidate IndexedDB cache when user changes tone or model.
- **Effective Page Overrides:** [pageAi.ts](file:///home/sanskar/Desktop/doclens-ai/src/lib/pageAi.ts#L1-L25) (`getEffectiveSettings`) — Merges document-level defaults with per-page overrides.

### User Interface & Tone Selection
- **Explanation Tone Grid UI:** [ExplainSetupDialog.tsx](file:///home/sanskar/Desktop/doclens-ai/src/components/ExplainSetupDialog.tsx#L85-L107) — Interactive grid allowing selection of language and explanation styles.
- **Workstation Sidebar Controls:** [PageWorkstation.tsx](file:///home/sanskar/Desktop/doclens-ai/src/components/PageWorkstation.tsx#L18-L35) — Sidebar UI hosting tone dropdowns, mode toggles, and temperature sliders.
- **Global Preferences Modal:** [GlobalSettingsModal.tsx](file:///home/sanskar/Desktop/doclens-ai/src/components/GlobalSettingsModal.tsx) — Configures default global AI options.

---

_Part of [[MOC — Features]] and [[MOC — Pipelines]]_
