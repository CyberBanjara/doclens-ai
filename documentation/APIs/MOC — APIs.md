# 🔌 MOC — APIs

> External APIs, libraries, and browser interfaces integrated into Anuwad.

---

## API Registry

| API / Library             | Category           | Description                                                               | Used By                 |
| ------------------------- | ------------------ | ------------------------------------------------------------------------- | ----------------------- |
| [[OpenRouter API]]        | External Cloud     | Aggregated LLM provider for translation, summary, and explanation prompts | [[AI Translation]]      |
| [[Piper WASM Engine]]     | WebAssembly        | Local client-side neural speech synthesis (TTS) generator                 | [[Piper Neural TTS]]    |
| [[Web Speech API]]        | Browser Native     | Standard native speech synthesis engine used as a fallback                | [[Text-to-Speech]]      |
| [[IndexedDB Storage]]     | Browser Native     | High-capacity local storage for document blobs, metadata, and voice files | [[Document Management]] |
| [[Voice Cache Layer]]     | Browser Native     | Dual-storage (OPFS/IDB) cache for Piper neural voice models              | [[Piper Neural TTS]]    |
| [[PDF.js]]                | Core Library       | PDF text parsing, coordinates positioning, and rendering canvas generator | [[PDF Viewer]]          |

---

## Technical Architecture

```mermaid
graph TD
    Features[⚙️ Features] --> APIs[🔌 APIs & Libraries]
    APIs --> Local[💻 Local / Browser-Native]
    APIs --> Cloud[☁️ External Cloud APIs]

    Local --> IDB[IndexedDB Storage]
    Local --> VoiceCache[Voice Cache Layer]
    Local --> WS[Web Speech API]
    Local --> Piper[Piper WASM Engine]
    Local --> PDFJS[PDF.js]

    Cloud --> OR[OpenRouter API]

    VoiceCache -.->|fallback| IDB
```

---

_Part of [[00 — MOC — Project]]_
