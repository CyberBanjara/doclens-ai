# End-to-End Pipeline

> The complete data flow from PDF file input to translated audio output.

---

## Pipeline Overview

```mermaid
flowchart LR
    subgraph INPUT
        A[PDF File]
    end

    subgraph EXTRACTION["[[PDF Extraction Pipeline]]"]
        B[PDF.js parsing]
        C[Text + structure extraction]
        D[Column detection & cleanup]
    end

    subgraph TRANSLATION["[[Translation Pipeline]]"]
        E[Build API payload]
        F[SSE Stream to OpenRouter]
        G[Receive AI result tokens]
    end

    subgraph TTS["[[TTS Pipeline]]"]
        H[Split into sentences]
        I[Piper WASM synthesis]
        J[Audio playback + highlighting]
    end

    A --> B --> C --> D
    D -->|"extraction stored in IDB"| E --> F --> G
    G -->|"translation stored in IDB"| H --> I --> J
```

---

## Stage Details

### Stage 1: PDF Extraction

- **Input:** PDF binary from [[IndexedDB Storage]]
- **Process:** [[PDF.js]] renders each page, extracts text content with position data
- **Enhancements:** Column detection (single vs multi-column), garbage ratio filtering
- **Output:** Per-page text + metadata stored in IndexedDB

### Stage 2: AI Translation

- **Input:** Extracted page text + user settings (mode, language, style, temperature)
- **Process:** Payload built via `buildPagePayload()`, streamed via [[OpenRouter API]] using SSE
- **Output:** Translated/explained text stored in IndexedDB with settings hash

### Stage 3: Text-to-Speech

- **Input:** Translated text from Stage 2
- **Process:** Text split into sentence chunks, each synthesized by [[Piper WASM Engine]] or [[Web Speech API]]
- **Caching:** Voice models served from [[Voice Cache Layer]] (OPFS/IDB dual storage)
- **Output:** Real-time audio playback with sentence-level highlighting

---

## Data Contracts

| Handoff                  | Format                   | Key Fields                                                      |
| ------------------------ | ------------------------ | --------------------------------------------------------------- |
| Upload → Extraction      | PDF binary (ArrayBuffer) | Stored as blob in IDB                                           |
| Extraction → Translation | `PageData` record        | `text`, `columns`, `pageNumber`                                 |
| Translation → TTS        | `PageAi` record          | `result` (string), `status`, `settingsHash`                     |
| Translation → Storage    | Settings hash            | `modelId`, `mode`, `language`, `style`, `temperature`            |

---

## Cross-References

### Feature Mapping

- Stage 1: [[PDF Viewer]], [[Document Management]]
- Stage 2: [[AI Translation]], [[Auto-Translate]], [[Per-Page Overrides]]
- Stage 3: [[Text-to-Speech]], [[Piper Neural TTS]]

---

## Related

- [[PDF to Translation Workflow]] — User perspective of Stage 1→2
- [[Translation to TTS Workflow]] — User perspective of Stage 2→3
- [[MOC — Pipelines]] — Pipeline details
- [[What is Anuwad]] — Product context

---

_Part of [[MOC — User Flows]]_
