# Web Speech API

> **Category:** Browser Native API  
> **W3C Standard:** [Web Speech API Specification](https://wicg.github.io/speech-api/)

---

## Purpose

The **Web Speech API** provides standard speech synthesis interfaces. Anuwad uses it as a fallback engine when offline models are not installed, or when the user prefers browser-native voices.

---

## Integration Details

- **Browser Dependency:** Voice availability depends on the host operating system (e.g., Microsoft voices on Windows, Apple voices on macOS).
- **Online vs. Local:** Synthesizes speech locally or using online browser services, depending on the selected voice.
- **Dynamic Initialization:** Listens to `onvoiceschanged` events to populate browser voice options when the page loads.

---

## Speech Controls

- Uses standard `window.speechSynthesis` methods (`speak()`, `pause()`, `resume()`, `cancel()`).
- Passes user configuration values (rate, pitch, volume) to the browser speech engine.

---

## Relationships

- **Page integration:** [[Voice Settings Page]].
- **Feature powered:** [[Text-to-Speech]].

---

_Part of [[MOC — APIs]]_
