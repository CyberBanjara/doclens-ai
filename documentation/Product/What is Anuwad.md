# What is Anuwad

> **Anuwad** is a browser-first document intelligence application that lets users upload PDF documents, translate or explain their content using AI, and listen to the results through neural text-to-speech — all without uploading data to external servers.

---

## Tagline

**"Read it. Hear it. Own it — in the language that owns your heart."**

---

## Three Core Capabilities

| Capability  | Description                                                                            | Powered By                               |
| ----------- | -------------------------------------------------------------------------------------- | ---------------------------------------- |
| **Read it** | Render PDFs with selectable text, page navigation, and retina-quality canvas rendering | [[PDF.js]], [[PdfViewer]]                |
| **Hear it** | Convert translated text into natural speech with sentence-level highlighting           | [[Piper Neural TTS]], [[Web Speech API]] |
| **Own it**  | Translate or explain any page into 90+ languages using AI models                       | [[OpenRouter API]], [[AI Translation]]   |

---

## Key Differentiators

1. **Privacy-first** — PDF processing happens entirely in the browser. Documents never leave the user's device.
2. **Offline TTS** — Piper neural voices are downloaded once and cached locally via the [[Voice Cache Layer]] (OPFS + IndexedDB dual storage). No internet needed for playback.
3. **Multi-language focus** — First-class support for Indian languages (Hindi, Bengali, Telugu, Malayalam) alongside global languages.
4. **Per-page control** — Users can override AI settings (model, language, temperature, tone) on individual pages without changing global defaults.
5. **Continuous auto-read** — While listening, the next page is translated ahead of time and playback auto-advances page-to-page for a seamless ebook-like reading experience.
6. **Real-time streaming** — AI translations stream to the UI token-by-token via SSE, reducing perceived latency.

---

## Who Uses It

| Persona                 | Use Case                                                                            |
| ----------------------- | ----------------------------------------------------------------------------------- |
| **Language learners**   | Read academic PDFs explained in their native language                               |
| **Researchers**         | Quickly translate foreign-language papers                                           |
| **Students**            | Get simplified explanations of complex textbook pages                               |
| **Developers**          | Process technical documentation with full AI control (JSON editor, model selection) |
| **Accessibility users** | Listen to translated content via neural TTS                                         |

---

## Application Structure

Anuwad has three main pages plus a settings sub-route:

1. [[Library Page]] — Upload and manage documents
2. [[Workspace Page]] — View PDFs, translate, and listen
3. [[General Settings Page]] — Configure AI pipeline defaults, output language, voice cache, API keys, and model selection

---

## Related

- [[Why Anuwad Exists]] — The problem it solves
- [[Tech Stack]] — How it's built
- [[Design System]] — How it looks
- [[End-to-End Pipeline]] — How data flows through it
- [[MOC — Product]]

---

_Part of [[MOC — Product]]_
