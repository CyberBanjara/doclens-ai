# AI Translation Feature

> Stream translation, summarization, and explanation capabilities.

---

## Capabilities

- Streams translations into 90+ languages.
- Supports alternative pipeline configurations:
  - **Translate:** Direct language-to-language translation.
  - **Explain:** Detailed conceptual explanations of page content.
  - **Summarize:** Highlights core takeaways.
  - **Custom Prompt:** Users can edit the system prompt template.
- Implements sequential memory passing to maintain context between pages.

---

## Technical Integration

- Calls edge endpoints that route queries to [[OpenRouter API]] models.
- Uses an `AbortController` to stop active streaming requests when the user stops processing.
- Stores output in [[IndexedDB Storage]] along with a hash of settings (model, tone, prompts) to verify cache validity if defaults change.

---

## UI Bindings

- **Output Language Card:** Preset selections on the [[General Settings Page]].
- **Workstation Sidebar:** Hosts the execution button and streaming view inside the [[Workspace Page]].

---

## Relationships

- **Component:** [[PageWorkstation]].
- **Dependencies:** [[OpenRouter API]].

---

_Part of [[MOC — Features]]_
