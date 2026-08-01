# Why Anuwad Exists

> The vision and problem statement behind Anuwad.

---

## The Problem

Millions of PDF documents — textbooks, research papers, legal contracts, government forms — are published in languages the reader doesn't speak. Existing solutions have critical gaps:

| Existing Approach      | Limitation                                                            |
| ---------------------- | --------------------------------------------------------------------- |
| Google Translate (web) | Copy-paste workflow, loses document structure, no offline             |
| Adobe Acrobat          | No AI translation, expensive, cloud-dependent                         |
| ChatGPT / Claude       | Manual copy-paste per page, no document-native UX, data leaves device |
| DeepL                  | No PDF viewer, no TTS, no per-page control                            |

---

## The Vision

A **single tool** where users can:

1. Open a PDF document
2. See the original alongside an AI translation or explanation
3. Listen to the result in a natural-sounding voice
4. Do all of this **privately, in their browser**, with no data leaving their device

---

## Design Principles

1. **Privacy by default** — All PDF processing is local. The AI key lives on the server; documents never leave the browser.
2. **Offline-capable** — PDF viewing and TTS work without internet once voices are cached.
3. **Language-first** — The UI prioritizes language selection. Indian languages appear in native scripts, not romanized.
4. **Progressive complexity** — Simple for first-time users (auto-detect model, one-click translate), powerful for developers (JSON editor, per-page overrides, memory diagnostics).
5. **Ebook-like reading** — Auto-translate and sentence-level TTS highlighting create an immersive reading experience, not a translation utility.

---

## Target Audience

- **Primary:** Indian-language speakers processing English-language PDFs
- **Secondary:** Multilingual researchers, students, and professionals worldwide
- **Tertiary:** Developers building AI-powered document workflows who need fine-grained control

---

## Related

- [[What is Anuwad]] — Product overview
- [[End-to-End Pipeline]] — How the vision is realized technically
- [[Architecture]] — How the system is built
- [[Design System]] — Visual expression of the brand

---

_Part of [[MOC — Product]]_
