# Voice Cache Layer

> **Category:** Browser-Native Dual-Storage Cache  
> **Source File:** `src/lib/voiceCache.ts`

---

## Purpose

The **Voice Cache Layer** provides persistent offline caching for Piper neural TTS model files (ONNX models and JSON configs). It ensures that voice models are downloaded only once and served from local storage on subsequent uses, enabling instant offline playback.

---

## Dual-Storage Strategy

The cache uses a tiered storage approach:

1. **Primary — OPFS (Origin Private File System):** Fast, filesystem-like access. Preferred when available.
2. **Fallback — IndexedDB (`doclens-voice-cache`):** Used automatically when OPFS is not supported (e.g., in private/incognito windows).

---

## Fetch Interceptor

The voice cache hooks into `window.fetch` via a transparent interceptor (`initVoiceCache()`). When a fetch request targets a Piper model URL:

1. Check OPFS for a cached copy → serve immediately if found.
2. Check IndexedDB for a cached copy → serve immediately if found.
3. Download from the network, cache the response in the active storage backend, and return.

This makes caching completely transparent to the Piper WASM engine — it simply calls `fetch()` as normal.

---

## Manual Download API

The module also exports a `downloadVoice()` function for the Settings page to download voices proactively with real-time percentage progress reporting.

---

## URL Redirect Logic

Handles voice model URL redirects for different voice sources:

- **Rhasspy** Hindi voices → custom CDN path mapping.
- **Diffusionstudio** English voices → appropriate model endpoints.

---

## Management UI

The [[General Settings Page]] hosts the **Natural Voice Cache Manager** section, where users can:

- View all available neural voices filtered by their current language.
- Pre-download voices for offline use with download progress indicators.
- Delete individual cached voices to reclaim storage space.

---

## Relationships

- **Feature powered:** [[Piper Neural TTS]], [[Text-to-Speech]].
- **APIs used:** [[IndexedDB Storage]].
- **Page integration:** [[General Settings Page]].

---

_Part of [[MOC — APIs]]_
