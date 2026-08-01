# Piper WASM Engine

> **Category:** WebAssembly Engine  
> **Source Repository:** [rhasspy/piper](https://github.com/rhasspy/piper)

---

## Purpose

**Piper** is a local neural text-to-speech system. Running inside WebAssembly, it enables high-quality, offline speech synthesis directly within the browser, eliminating the need to upload text to external TTS services.

---

## Integration Details

- **WASM Run Environment:** The ONNX engine is initialized via `onnxruntime-web` with a single WASM thread (`env.wasm.numThreads = 1`) to minimize memory footprint. This isolates heavy calculations from the main execution thread, preventing the UI from freezing.
- **Transparent Caching via Fetch Interceptor:** The [[Voice Cache Layer]] hooks into `window.fetch` so the Piper engine loads models from local cache (OPFS or IndexedDB) transparently. Models are downloaded on first use and served from cache subsequently.
- **Direct Synthesis Workflow:** Text chunks are synthesized directly to raw audio data, converted to Blob URLs, and played back through standard browser audio elements. The previous buffered pipeline approach was reverted in favor of this simpler, more memory-efficient method.
- **Voice Change Safeguard:** A `lastVoiceUriRef` synchronization mechanism prevents redundant model downloads and mid-playback restarts when the user rapidly switches between voices.

---

## Key Configurations

- **Voice Profiles:** Supports multiple language models with varying qualities (medium, high, low).
- **Audio Tuning:** Adjusts speed settings via the WASM runtime before speech generation.
- **Voice Catalog:** A comprehensive catalog (~900+ voice entries) with metadata including language, quality level, file sizes, and MD5 digests.

---

## Relationships

- **Page integration:** [[General Settings Page]] (Natural Voice Cache Manager).
- **Feature powered:** [[Piper Neural TTS]], [[Text-to-Speech]].
- **Caching:** [[Voice Cache Layer]].

---

_Part of [[MOC — APIs]]_
