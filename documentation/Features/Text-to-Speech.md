# Text-to-Speech Feature

> Orchestrates voice synthesis and text highlighting during audio playback.

---

## Capabilities

- Splits text into sentence chunks to handle browser synthesis limitations.
- Automatically highlights the active sentence and visually underlines buffered sentences.
- Supports seeking: clicking any sentence jumps audio playback to that position.
- Saves voice preferences per-language.

---

## Dual-Engine Orchestration

The system routes requests based on the selected engine preference:

1. **Neural (Piper):** WebAssembly-based local TTS engine. Used for high-quality, offline speech synthesis. Models are cached via the [[Voice Cache Layer]].
2. **Browser (Web Speech API):** Standard browser synthesis engine. Used as a fallback or for unsupported languages.

---

## Playback Stability

- **Voice Change Safeguard:** A `lastVoiceUriRef` mechanism prevents redundant model downloads and mid-playback restarts when rapidly switching voices.
- **Single-Thread WASM:** The ONNX runtime is configured with `numThreads = 1` to minimize memory usage and avoid concurrency issues.
- **Direct Synthesis:** Text chunks are synthesized directly (not buffered through an intermediate pipeline), reducing memory overhead and latency.

---

## UI Controls

- **Playback Bar:** Play (▶), Pause (❚❚), Stop (■), Forward (›), and Rewind (‹) buttons located in the workstation header.
- **Settings Sliders:** Voice Settings speed (0.25x to 4x) and pitch controls.

---

## Relationships

- **Engine detail:** [[Piper Neural TTS]], [[Web Speech API]].
- **Caching:** [[Voice Cache Layer]].
- **Workflow:** [[Translation to TTS Workflow]].

---

_Part of [[MOC — Features]]_
