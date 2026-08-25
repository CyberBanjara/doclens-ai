# AI Response Sanitization

> Post-processing pipeline that strips markdown artifacts from AI outputs before storage and TTS consumption.
> **Source:** `src/lib/cleanAiText.ts`

---

## Problem

Despite system prompts explicitly forbidding markdown syntax (FORMAT_RULES), many LLM models still emit markdown artifacts in their responses — heading hashes (`### Title`), bold/italic markers (`**text**`, `*text*`), code fences (`` ``` ``), blockquotes (`> quote`), and bullet asterisks (`* item`). These artifacts cause two problems:

1. **TTS mispronunciation:** The neural TTS engine reads markdown symbols aloud ("hashtag", "asterisk", "star"), producing jarring audio.
2. **Dirty saved records:** IndexedDB and Supabase cache entries contain formatting noise rather than clean text.

---

## Solution: `cleanAiText()`

A deterministic regex-based sanitizer (`cleanAiText`) is applied at three points in the pipeline to ensure all AI text is clean before reaching the user:

### Sanitization Steps (in order)

1. Remove markdown code fences (`` ```lang `` and standalone `` ``` ``)
2. Remove heading hashes at line start (`### Heading` → `Heading`)
3. Remove bullet asterisks at line start (`* Item` → `Item`)
4. Unwrap bold/italic/bold-italic markdown (`***text***`, `**text**`, `*text*` → `text`)
5. Remove any remaining standalone `*` and `#` characters
6. Clean blockquotes (`> Quote` → `Quote`)
7. Remove horizontal rules (`---`, `___`)
8. Unwrap inline backticks (`` `code` `` → `code`)
9. Collapse excessive whitespace and blank lines

### Integration Points

| Point | File | When Applied |
| :---- | :--- | :----------- |
| **Streaming UI flush** | `usePageTranslation.ts` | Every 60fps UI flush during SSE streaming |
| **Final IDB write** | `usePageTranslation.ts` | Before `upsertPageAi()` writes the completed result to IndexedDB |
| **IDB write guard** | `storage/pages.ts` | Double-check sanitization inside `upsertPageAi()` before persisting |
| **TTS sentence split** | `tts.ts` | Before `splitSentences()` processes text for audio playback |

The function is re-exported through `pageAi.ts` for convenient import across the codebase.

---

## Relationships

- **Feature powered by:** [[AI Translation]], [[Prompt Engineering & Explanation Tones]].
- **Consumed by:** [[PageWorkstation]], `tts.ts`, `storage/pages.ts`.
- **Dependencies:** None (pure function, no external imports).

---

_Part of [[MOC — Features]]_
