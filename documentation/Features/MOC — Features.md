# ⚙️ MOC — Features

> The core functional capabilities of the Anuwad application.

---

## Features Directory

### Reading & Ingestion

- [[PDF Viewer]] — Lazy-rendering PDF view engine, canvas rendering, memory manager.
- [[Document Management]] — Upload, metadata processing, thumbnails, storage, delete confirmation.
- [[Global Library]] — Shared R2-backed document vault with Supabase cross-device sync (opt-in).
- [[Text Selection Toolbar]] — Floating contextual menu providing Copy, Translate, and Speak actions.

### AI Processing

- [[AI Translation]] — Mode-separated processing with Translation styles (Native/Mixed) and Explanation styles (Standard/Simple/Story/Deep/AI Mode), SSE streaming.
- [[Prompt Engineering & Explanation Tones]] — Consolidated 5+2 style architecture, FORMAT_RULES, EXPLAIN_RULES, prompt pipeline, and legacy style mapping.
- [[AI Response Sanitization]] — Post-processing sanitizer (`cleanAiText`) stripping markdown artifacts before DB storage and TTS.
- [[Auto-Translate|Continuous Auto-Read]] — Translate-ahead + auto-advance while listening to a page.
- [[Per-Page Overrides]] — Custom configurations (model, tone, temperature, custom prompt payload editor) per page.
- [[API Key Management]] — Server key environment checks, client status badges, verification modal.

### Speech Synthesis

- [[Text-to-Speech]] — Dynamic TTS orchestration, sentence splitting, voice preferences.
- [[Piper Neural TTS]] — Local WASM-based neural engine, dual-storage voice caching, direct synthesis pipeline.

### Account & Monetization

- [[Authentication]] — Google Sign-In (Firebase Auth) and Firestore-backed reviews.
- [[Advertising & Sponsorship]] — Self-serve sponsored slots, local IndexedDB creative caching, and admin approval pipeline.
- [[Export System]] — Document and translation data exporter supporting Markdown and structured JSON.
- [[Memory & Storage Audit]] — Comprehensive audit of memory hotspots and optimization strategies.

---

## Technical Mapping

```mermaid
graph TD
    Pages[📄 Application Pages] --> Features[⚙️ Features]
    Features --> APIs[🔌 APIs & Libraries]
    Features --> Pipelines[⛓️ Data Pipelines]
```

---

_Part of [[00 — MOC — Project]]_
