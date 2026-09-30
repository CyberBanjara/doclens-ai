# 🏛️ Changelog & Architecture Decisions

> **Comprehensive record of major architectural shifts, bug fixes, root-cause analyses, and feature designs implemented across the Anuwad codebase.**
> Each entry details the **Problem → Reason → Decision → Implementation → Outcome** chain.

---

## 1. Fix: PDF Viewer React Hook Ordering Violation Crash

### 🔴 Problem
Opening any document in the workspace immediately triggered a fatal React application crash with the error boundary message:
```text
Rendered more hooks than during the previous render.
```

### 🔍 Reason (Root Cause)
In [`src/components/PdfViewer.tsx`](file:///home/sanskar/Desktop/doclens-ai/src/components/PdfViewer.tsx), the `setPageContainerRef` `useCallback` hook was placed **after** the early return statements (`if (loading) return ...` and `if (error) return ...`).
- **Initial Render:** When a document opens, `loading` is `true`, causing `PdfViewer` to execute an early return before reaching `setPageContainerRef`.
- **Subsequent Render:** Once the PDF document finishes loading asynchronously (`loading = false`), the component renders further down and executes the `useCallback` hook for the first time.
- According to React's [Rules of Hooks](https://react.dev/reference/rules/rules-of-hooks), the number and sequence of hook calls must remain identical across every single render cycle. React detected that extra hooks were executed on the second render and halted the application.

### 💡 Decision
Relocate all React hooks (`useCallback`, `useEffect`, `useMemo`, `useState`, `useRef`) to the top of the component body, strictly preceding any conditional returns or guard clauses.

### 🛠️ Implementation
- Moved `setPageContainerRef` `useCallback` directly under `useTextSelectionToolbar` in [`src/components/PdfViewer.tsx`](file:///home/sanskar/Desktop/doclens-ai/src/components/PdfViewer.tsx) so it evaluates unconditionally on every render pass.

### ✅ Outcome
Opening any PDF in desktop or mobile views renders without hook mismatch crashes, preserving clean component lifecycles.

---

## 2. Architecture: Detached Global Translation Runner & Non-Destructive Union Sync

### 🔴 Problem
- When a user navigated across pages, toggled between the "Original Text" and "AI Assistant" tabs, or closed the mobile reader sheet during translation, the active translation was abruptly aborted, causing corrupted or lost page states.
- If background synchronization with Supabase triggered while a document language preference changed, local modifications and overrides were wiped out.

### 🔍 Reason (Root Cause)
- **Component-Bound Lifecycles:** The legacy `usePageTranslation` hook created and bound `AbortController` instances directly to the React component lifecycle. When components remounted during navigation or tab switching, unmount cleanup functions aborted the in-flight HTTP streams.
- **Destructive Remote Overwrites:** Supabase sync performed direct replacement operations on local tables without reconciling differences against existing local IndexedDB records.

### 💡 Decision
1. Decouple AI translation execution from React components into a singleton global background runner (`pageTranslationRunner.ts`).
2. Utilize a decoupled custom event bus (`docEvents.ts`) for streaming updates and completion signals.
3. Implement a **Non-Destructive Union Sync** strategy for remote cloud persistence.

### 🛠️ Implementation
- **Global Background Runner ([`src/lib/pageTranslationRunner.ts`](file:///home/sanskar/Desktop/doclens-ai/src/lib/pageTranslationRunner.ts)):** Manages in-flight HTTP streams, request deduplication (maximum 1 request per page), memory buffer aggregation, and direct IndexedDB storage writes outside of React.
- **Event-Driven UI ([`src/hooks/usePageTranslation.ts`](file:///home/sanskar/Desktop/doclens-ai/src/hooks/usePageTranslation.ts)):** Subscribes to `doclens:page-status-changed` and `doclens:page-ready`. Component remounts attach to the active stream buffer without resetting connection state.
- **Non-Destructive Union Sync ([`src/lib/sync.ts`](file:///home/sanskar/Desktop/doclens-ai/src/lib/sync.ts)):** Merges incoming Supabase records with local IndexedDB records without overwriting local custom translations.

### ✅ Outcome
Translations execute uninterrupted across tab switches, bottom sheet dismissals, and page navigation, providing resilient offline-first state synchronization.

---

## 3. Feature & Provider: Local LLM Support (Ollama & OmniRouter)

### 🔴 Problem
Users requiring 100% private, offline inference were restricted to cloud OpenRouter API keys or incomplete OmniRouter configurations, with no native support for Ollama endpoints (`http://localhost:11434`).

### 🔍 Reason (Root Cause)
Ollama uses distinct endpoints (`/api/tags`, `/api/chat`), NDJSON stream chunking, and custom options (`num_ctx`, `temperature`) compared to OpenAI/OpenRouter standards.

### 💡 Decision
Build a native, zero-dependency Ollama client (`ollama.ts`), connect it to the global translation runner, and add status detection and model pickers in Settings and the per-page Workstation.

### 🛠️ Implementation
- **Ollama Client ([`src/lib/ollama.ts`](file:///home/sanskar/Desktop/doclens-ai/src/lib/ollama.ts)):** Implemented model discovery via `/api/tags`, connection health probes, and streaming completions with fallback context window sizes.
- **Multi-Provider Pipeline ([`src/lib/openrouter.ts`](file:///home/sanskar/Desktop/doclens-ai/src/lib/openrouter.ts)):** Standardized provider switching (`openrouter` | `omnirouter` | `ollama`) across global defaults and per-page overrides.
- **Settings UI ([`src/components/settings/OllamaStatusSection.tsx`](file:///home/sanskar/Desktop/doclens-ai/src/components/settings/OllamaStatusSection.tsx), [`src/routes/settings.tsx`](file:///home/sanskar/Desktop/doclens-ai/src/routes/settings.tsx)):** Live status indicator and model selection dropdown.

### ✅ Outcome
Users can run private AI translations entirely on their local machine via Ollama (Llama 3, Qwen, Mistral, Gemma) or OmniRouter without any external network traffic or API keys.

---

## 4. Feature: Full Book Sequential Translation with Range & Cooldown Controls

### 🔴 Problem
Translating large multi-page books required clicking page-by-page. Automated bulk runs risked exhausting provider quotas or triggering HTTP 429 rate limits.

### 🔍 Reason (Root Cause)
There was no sequential execution orchestrator capable of pacing translation requests with deliberate cooldown intervals.

### 💡 Decision
Implement a sequential translation engine (`useFullBookTranslation.ts`) with page range selection, configurable rate-limit cooldown timers, and a floating progress dock.

### 🛠️ Implementation
- **Sequential Orchestrator ([`src/hooks/useFullBookTranslation.ts`](file:///home/sanskar/Desktop/doclens-ai/src/hooks/useFullBookTranslation.ts)):** Executes page-by-page translation loops, calculates ETA in seconds, tracks failed pages for one-click retries, and honors pause/resume/cancel commands.
- **Modal & Dock UI ([`src/components/FullBookTranslationModal.tsx`](file:///home/sanskar/Desktop/doclens-ai/src/components/FullBookTranslationModal.tsx)):** Provides start/end page selectors, overwrite toggles, cooldown sliders, and a persistent floating dock displaying live progress (`Page X of Y`).

### ✅ Outcome
Textbooks and long chapters can be translated unattended in the background with zero rate-limit throttling.

---

## 5. Feature & Fix: Multi-Script PDF Export with TrueType Font Embedding

### 🔴 Problem
Exported PDFs rendered missing glyphs ("tofu" squares) for non-Latin writing systems (Hindi, Bengali, Tamil, Telugu, Malayalam, Gujarati, Gurmukhi, Odia, Arabic) and suffered from coordinate overflow in multi-column layouts.

### 🔍 Reason (Root Cause)
Standard PDF generation engines rely on default Latin fonts (Helvetica) that lack Unicode glyph tables for Indic and Arabic scripts, and fail to calculate dynamic line heights for complex ligatures.

### 💡 Decision
Bundle 14 Unicode TrueType fonts directly in `public/fonts/`, integrate `@react-pdf/renderer`, and dynamically register the correct font family based on the document's target language.

### 🛠️ Implementation
- **Bundled Fonts ([`public/fonts/`](file:///home/sanskar/Desktop/doclens-ai/public/fonts)):** Added Noto Sans, Mukta, Hind Siliguri, Hind Vadodara, Manjari, etc.
- **PDF Export Generator ([`src/lib/pdfExport.tsx`](file:///home/sanskar/Desktop/doclens-ai/src/lib/pdfExport.tsx), [`src/lib/export.ts`](file:///home/sanskar/Desktop/doclens-ai/src/lib/export.ts)):** Implemented dynamic font family matching, header/footer pagination, coordinate sanitization, and clean page break math.

### ✅ Outcome
Crisp, publication-grade bilingual and translated PDF exports across 90+ languages with native font rendering.

---

## 6. Feature: Global Library Batch Downloads & Local Sync Badges

### 🔴 Problem
Users browsing the Global Cloud Library had to download documents one-by-one and could not determine if a cloud book was already saved locally or how many pages were translated.

### 🔍 Reason (Root Cause)
Global Library views were isolated from local IndexedDB state and lacked multi-select download queue mechanics.

### 💡 Decision
Sync Global Library cards with local IndexedDB records in real-time and introduce a multi-select batch download toolbar.

### 🛠️ Implementation
- **Status Badges ([`src/components/GlobalLibraryCard.tsx`](file:///home/sanskar/Desktop/doclens-ai/src/components/GlobalLibraryCard.tsx)):** Displays "In Library", "Translated X/Y Pages", and direct "Read Now" actions.
- **Batch Downloader ([`src/routes/global-library.tsx`](file:///home/sanskar/Desktop/doclens-ai/src/routes/global-library.tsx)):** Multi-select action bar with progress tracking and automatic local database indexing.

### ✅ Outcome
Users can discover, bulk-download, and track textbook translation progress effortlessly.

---

## 7. Optimization: TTS Lookahead Sentence Splitting & Neural Piper Onboarding

### 🔴 Problem
- Text-to-Speech audio cut off unnaturally at abbreviations (e.g., *Dr.*, *Fig. 1*) and decimal numbers.
- Selecting an offline Piper ONNX voice that was not yet downloaded caused playback to fail silently.

### 🔍 Reason (Root Cause)
- Basic regex split on periods without lookahead context.
- Playback was initiated before checking whether the voice model binary existed in IndexedDB/OPFS.

### 💡 Decision
Refine the sentence segmenter with regex lookahead patterns and introduce a pre-flight voice readiness gate in the TTS player.

### 🛠️ Implementation
- **Sentence Segmenter ([`src/lib/tts.ts`](file:///home/sanskar/Desktop/doclens-ai/src/lib/tts.ts)):** Handles abbreviations, numbers, and Indic danda (`।`).
- **Readiness Gate ([`src/components/TtsPlayer.tsx`](file:///home/sanskar/Desktop/doclens-ai/src/components/TtsPlayer.tsx), [`src/components/VoiceOnboardingDialog.tsx`](file:///home/sanskar/Desktop/doclens-ai/src/components/VoiceOnboardingDialog.tsx)):** Automatically prompts the voice download modal if the model is missing, then auto-starts playback upon completion.

### ✅ Outcome
Natural speech flow across all languages with zero silent audio failures.

---

## 8. UI Refactor: Quick Theme Modal & High-Converting Support Page

### 🔴 Problem
- Theme customization required navigating away to a separate sub-route.
- The community support/donation page lacked structured tiers and impact transparency.

### 🔍 Reason (Root Cause)
Theme switching is a lightweight action that belongs in an overlay modal, and the support page lacked interactive sponsorship tiers and social proof.

### 💡 Decision
Replace the nested appearance route with a Theme Selection Modal and redesign the Support page with interactive tiers and trust indicators.

### 🛠️ Implementation
- **Theme Modal ([`src/components/settings/ThemeSelectionModal.tsx`](file:///home/sanskar/Desktop/doclens-ai/src/components/settings/ThemeSelectionModal.tsx)):** 1-click theme switcher (Apple Dark, Ocean, Forest, Sunset, Sea, Mint, System).
- **Support Page Revamp ([`src/routes/support.tsx`](file:///home/sanskar/Desktop/doclens-ai/src/routes/support.tsx)):** Added preset donation pills, impact counters (compute hours, pages translated), and FAQ accordions.

### ✅ Outcome
Instant theme switching without page reloads and a transparent, high-converting community sponsorship flow.
