# Piper Neural TTS Feature

> WebAssembly-based offline neural speech synthesis system.

---

## Capabilities

- Performs neural speech synthesis locally in the browser using WebAssembly.
- Works offline once voice models are installed.
- Offers a catalog of different voice qualities (medium, high, low) across multiple languages.
- Language-based voice filtering — the catalog shows voices matching the current output language.

---

## Installation & Caching

1. The **Natural Voice Cache Manager** on the [[General Settings Page]] shows available voices for the current language.
2. Installing a voice downloads its ONNX model file (~20–60 MB) via the [[Voice Cache Layer]].
3. The cache layer uses a **dual-storage strategy**: OPFS (primary) with IndexedDB fallback, ensuring models persist across sessions.
4. A transparent `fetch` interceptor ensures that the Piper engine loads cached models automatically without any code changes to the engine itself.
5. On playback, the system uses `onnxruntime-web` with a single WASM thread (`numThreads = 1`) to reduce memory usage.

---

## Synthesis Pipeline

The Piper engine uses a **direct synthesis workflow** (not a buffered pipeline):

1. Text is split into sentence chunks.
2. Each chunk is synthesized directly by the WASM engine.
3. Raw audio data is converted to Blob URLs for playback via standard browser `<audio>` elements.
4. A synchronization safeguard (`lastVoiceUriRef`) prevents redundant model downloads and mid-playback restarts when the user switches voices rapidly.

---

## Relationships

- **Feature parent:** [[Text-to-Speech]].
- **API integration:** [[Piper WASM Engine]], [[Voice Cache Layer]].
- **Management UI:** [[General Settings Page]] (Natural Voice Cache Manager).

---

_Part of [[MOC — Features]]_
