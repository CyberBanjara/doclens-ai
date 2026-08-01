<p align="center">
  <img src="public/light_13746323.png" alt="Anuwad logo" width="80" />
</p>

<h1 align="center">Anuwad — Private PDF Reader, AI Translator & Neural Voice Reader</h1>

<p align="center">
  <em>Read it. Hear it. Own it — in the language that owns your heart.</em>
</p>

<p align="center">
  <a href="https://www.anuwad.com">Live App</a> ·
  <a href="#quick-start">Quick Start</a> ·
  <a href="#architecture">Architecture</a> ·
  <a href="#features">Features</a> ·
  <a href="#faq">FAQ</a>
</p>

---

## What Is Anuwad?

**Anuwad** (anuwad.com) is a browser-first document intelligence application that lets users upload PDF documents, translate or explain their content using AI, and listen to the results through neural text-to-speech — all without uploading data to external servers.

Unlike copy-paste translation workflows or cloud-dependent PDF editors, Anuwad provides a **single, integrated tool** where users can:

1. **Open any PDF** in a high-fidelity, memory-managed viewer
2. **Translate or explain** each page into **90+ languages** using state-of-the-art LLMs (GPT-4o, Claude 3.5 Sonnet, Gemini 1.5 Pro, Llama, and more)
3. **Listen** to the translated content with natural-sounding **neural text-to-speech** powered by Piper WASM — fully offline after first download
4. **Keep everything private** — PDF processing happens 100% in the browser; documents never leave the device

The application is deployed at [anuwad.com](https://www.anuwad.com) and is built with React 19, TanStack Router, PDF.js, Piper TTS (WebAssembly), and Tailwind CSS, with server functions running on Vercel via Nitro.

---

## The Problem Anuwad Solves

Millions of PDF documents — textbooks, research papers, legal contracts, government forms — are published in languages the reader doesn't speak. According to UNESCO, over 50% of online content is in English, yet only 16% of the world's population speaks it. Existing solutions have critical gaps:

| Existing Approach    | Limitation                                                            |
| -------------------- | --------------------------------------------------------------------- |
| **Google Translate** | Copy-paste workflow, loses document structure, no offline capability  |
| **Adobe Acrobat**    | No AI translation, expensive subscription, cloud-dependent            |
| **ChatGPT / Claude** | Manual copy-paste per page, no document-native UX, data leaves device |
| **DeepL**            | No PDF viewer, no text-to-speech, no per-page control                 |
| **Speechify**        | Cloud-based TTS, subscription model, no local processing              |

Anuwad eliminates these gaps by combining **PDF viewing**, **AI translation**, and **neural TTS** into a single, privacy-first browser application. According to the Anuwad architecture, all PDF processing is performed client-side using pdf.js, AI translation is proxied through a secure server function (so the API key never touches the browser), and speech synthesis runs entirely in WebAssembly via Piper — ensuring complete data sovereignty.

---

## Who Is It Built For?

| Persona                 | Use Case                                                                             |
| ----------------------- | ------------------------------------------------------------------------------------ |
| **Language learners**   | Read academic PDFs explained in their native language                                |
| **Researchers**         | Quickly translate foreign-language papers with full context preservation             |
| **Students**            | Get simplified, style-configurable explanations of complex textbook pages            |
| **Developers**          | Process technical documentation with full AI control (JSON editor, model selection)  |
| **Accessibility users** | Listen to translated content via offline neural TTS with sentence-level highlighting |

**Primary audience:** Indian-language speakers processing English-language PDFs — Hindi, Bengali, Telugu, Malayalam, and 25+ other Indian languages appear in native scripts, not romanized.

**Secondary audience:** Multilingual researchers, students, and professionals worldwide who need document translation with context and privacy.

---

## Features

### 📄 Privacy-First PDF Viewer

- **Lazy canvas rendering** with `IntersectionObserver` — only visible pages are drawn, with a +200px viewport margin for smooth scrolling
- **GPU memory management** — maximum 5 concurrent canvas layers; oldest canvases are evicted automatically to prevent browser crashes on 500+ page documents
- **Transparent text selection layer** over structural canvases with a floating contextual toolbar (Copy, Translate, Speak)
- **Dimension virtualization** — PDF layout parameters are loaded on mount, creating virtual page placeholders without rendering every page upfront
- Documents are stored locally in **IndexedDB** by default — no server uploads, no cloud storage. (The optional [[Global Library]] feature, off by default, uploads PDFs to Cloudflare R2 and syncs extraction data via Supabase when explicitly enabled — see [Is my data private?](#is-my-data-private-when-using-anuwad))

### 🌍 AI Translation & Explanation (90+ Languages)

- **Translate mode** — direct language-to-language translation preserving document structure, headings, lists, and hierarchy
- **Explain mode** — AI-powered conceptual explanations with **13 explanation styles**: Standard, ELI5, Storytelling, Socratic, Step-by-Step, Visual Thinking, Analogical, Practical, Expert Deep-Dive, Debate, Historical Context, Motivational, and Critical Thinking
- **Per-page overrides** — configure model, mode, tone, and temperature individually per page without changing global defaults
- **JSON payload editor** — developers can directly modify the raw API payload sent to the LLM
- **Smart caching** — translations are stored in IndexedDB with a settings hash (model + mode + language + style + temperature); cache is invalidated only when settings change
- Powered by **OpenRouter API** with access to GPT-4o, Claude 3.5 Sonnet, Gemini 1.5 Pro, Llama, and 200+ other models

### 🔊 Dual-Engine Text-to-Speech

Anuwad provides two TTS engines, selectable per language:

| Engine               | Technology       | Quality  | Offline | Latency          |
| -------------------- | ---------------- | -------- | ------- | ---------------- |
| **Piper Neural TTS** | WebAssembly ONNX | High     | ✅ Yes  | ~2-4s first load |
| **Web Speech API**   | Browser native   | Variable | ✅ Yes  | Instant          |

**Piper Neural TTS** highlights:

- Runs **entirely in the browser** via WebAssembly — no audio data is sent to any server
- ONNX voice models (20–60 MB each) are downloaded once and cached in IndexedDB for offline use
- Inference runs in a **dedicated Web Worker** to keep the UI thread responsive
- Voice catalog with multiple quality levels (low, medium, high) across 25+ languages
- **LRU audio buffer cache** (5 entries) for instant replay of recently synthesized sentences

**Playback features:**

- **Sentence-level highlighting** — the active sentence is visually highlighted; buffered sentences are underlined
- **Click-to-seek** — clicking any sentence jumps playback to that position
- **Speed control** — adjustable from 0.25x to 4x
- **Continuous reading** — automatically advances through pages, triggering translation of the next page if needed
- **Seamless AI-tab auto-read** — switching to or navigating within the "AI Assistant" tab automatically generates (if needed) and reads each page aloud; while a page is playing with continuous reading on, the next page is pre-translated in the background so playback never stalls waiting on the LLM
- **First-time voice onboarding** — the first time auto-read or the play button needs a voice, a one-time dialog walks the user through picking a language and voice (downloading it if it's a neural voice) before playback starts
- **Offline-aware errors** — translation, model list, and voice download failures caused by a dropped connection surface a clear "No internet connection" message instead of a raw fetch error

**Playback engine internals** (for contributors):

- `TtsContext` tracks the active page/text-source in refs (not just React state) so the pre-synthesis and auto-advance logic always reads the current values, even mid-callback
- In-flight sentence pre-synthesis is de-duplicated — if playback catches up to a sentence that's still being synthesized in the background, it awaits the same `predict()` call instead of starting a duplicate one
- `PageWorkstation` de-dupes concurrent generation requests for the same page number (manual "Run", background pre-translate, and auto-read "ensure ready" can all target the same page) so they share one in-flight request

### 📤 Export System

- **Markdown export** — clean text files with page numbers, original text, and AI translation results
- **JSON export** — structured payloads with translation settings, token counts, and page data
- One-click browser download via temporary object URLs

### 👤 Optional Google Sign-In

- Sign in with Google (Firebase Auth) to leave a star rating + comment review — entirely optional, the app is fully usable signed out
- No document content or translation data is tied to your account; sign-in is only used for the review flow and analytics

### 🎨 Deep Ocean Design System

The UI uses a custom **"Deep Ocean"** dark theme built with glassmorphism and micro-animations:

- **Color palette:** Dark navy background (`#0b1326`), green primary accent (`#4edea3`), lavender secondary (`#c0c1ff`)
- **Typography:** Inter (Google Fonts) for body text, JetBrains Mono for technical labels — with HUD-style uppercase section headers
- **Glassmorphism cards:** `backdrop-filter: blur(12px)` with translucent backgrounds and subtle borders
- **Micro-animations:** Card hover lifts (4px translate-y), 250ms fade-in page transitions, pulse-border active page indicators, 0.97x scale button press feedback

### 🔧 Developer & Power User Features

- **Per-page JSON editor** — edit the exact API payload sent to OpenRouter for full control
- **API key management** — use a server-managed key (default) or bring your own OpenRouter key
- **Model selection** — choose from 200+ LLMs via OpenRouter with context length and pricing info
- **Temperature control** — fine-tune LLM creativity from 0.0 (deterministic) to 2.0 (creative)

---

## Architecture

```
Browser (Client-Side)
├── React 19 SPA (Vite 7 + TanStack Router)
│   ├── PDF.js v5 + tesseract.js ── Canvas rendering, text extraction, OCR fallback
│   ├── Piper WASM ──────────────── Neural TTS in Web Worker (ONNX Runtime)
│   ├── Firebase Auth SDK ───────── Google Sign-In (optional)
│   ├── IndexedDB ───────────────── Documents, AI results, voice models, thumbnails
│   └── localStorage ────────────── User preferences, voice settings, per-doc state
│
Server Functions (Vercel / Nitro, via TanStack Start `createServerFn`)
├── OpenRouter API proxy ── API key secured server-side, never exposed to client
├── Model list endpoint ─── Filtered LLM catalog
└── Global Library (optional, opt-in via ENABLE_GLOBAL_SYNC)
    ├── Cloudflare R2 ── shared PDF vault (upload/list/delete)
    └── Supabase ─────── shared extraction/translation cache
```

### Data Flow: PDF → Translation → Speech

```
┌──────────────┐     ┌───────────────────────┐     ┌───────────────────────┐
│  PDF Upload   │────▶│  Text Extraction      │────▶│  AI Translation       │
│  (IndexedDB)  │     │  (pdf.js per-page)    │     │  (OpenRouter stream)  │
└──────────────┘     │  Column detection      │     │  Settings hash cache  │
                      │  OCR fallback          │     └───────┬───────────────┘
                      └───────────────────────┘             │
                                                              │
                                                              ▼
                                                     ┌───────────────────────┐
                                                     │  Text-to-Speech       │
                                                     │  Sentence splitting   │
                                                     │  Piper WASM / Web API │
                                                     │  Audio + highlighting │
                                                     └───────────────────────┘
```

### Tech Stack

| Layer              | Technology                          | Purpose                                                |
| ------------------ | ----------------------------------- | ------------------------------------------------------ |
| **UI Framework**   | React 19 + TypeScript               | Component rendering with latest React features         |
| **Routing**        | TanStack Router + TanStack Start    | File-based routing with URL-synced state               |
| **Styling**        | Tailwind CSS 4 + shadcn/ui + Radix  | Utility-first CSS with accessible component primitives |
| **Bundler**        | Vite 7                              | Dev server and optimized production builds             |
| **PDF Engine**     | pdf.js v5 (pdfjs-dist)              | Canvas rendering, text extraction, text layer          |
| **AI Gateway**     | OpenRouter API                      | Unified access to GPT-4o, Claude, Gemini, Llama        |
| **Neural TTS**     | Piper TTS (piper-tts-web)           | Offline WASM speech synthesis with ONNX models         |
| **Browser TTS**    | Web Speech API                      | Native browser speech synthesis fallback               |
| **OCR**             | tesseract.js                        | Client-side OCR fallback for scanned/garbled pages      |
| **Storage**        | IndexedDB (idb) + localStorage      | Document persistence, model caching, preferences        |
| **Auth**           | Firebase Auth + Firestore           | Optional Google Sign-In and user review storage          |
| **Global Library**  | Cloudflare R2 (`@aws-sdk/client-s3`) + Supabase | Optional shared document vault + cross-device cache |
| **Deployment**     | Vercel + Nitro                      | Server functions for API proxying                       |
| **Analytics**      | Vercel Analytics + Speed Insights   | Performance monitoring                                  |
| **UI Components**  | Radix UI + shadcn/ui + Lucide Icons | Accessible dialogs, dropdowns, tooltips, etc.            |

---

## Quick Start

### Prerequisites

- **Node.js** ≥ 18 (Node 22 recommended)
- **npm** or **bun** package manager
- An **OpenRouter API key** ([get one free at openrouter.ai](https://openrouter.ai/))

### 1. Clone the Repository

```bash
git clone https://github.com/CyberBanjara/doclens-ai.git
cd doclens-ai
```

### 2. Install Dependencies

```bash
npm install
# or
bun install
```

### 3. Configure Environment

```bash
cp .env.example .env
```

Edit `.env` with your credentials:

```env
OPENROUTER_API_KEY=your-openrouter-api-key
OPENROUTER_DEFAULT_MODEL=openai/gpt-oss-20b:free
```

> **Note:** The `OPENROUTER_API_KEY` is used **server-side only** via Nitro server functions. It is never exposed to the browser client. Users can also bring their own key via the in-app API Key modal.

### 4. Run the Development Server

```bash
npm run dev
```

The app will be available at `http://localhost:5173`.

### 5. Build for Production

```bash
npm run build
npm run preview
```

The build uses `NODE_OPTIONS='--max-old-space-size=4096'` to handle the large dependency graph.

---

## Project Structure

```
doclens-ai/
├── src/
│   ├── components/          # React components
│   │   ├── PageWorkstation.tsx   # Core workspace — translation, TTS, per-page overrides
│   │   ├── PdfViewer.tsx         # PDF rendering engine with lazy loading
│   │   ├── SidebarLayout.tsx     # Primary app shell — desktop sidebar / mobile tab bar
│   │   ├── RightPanel.tsx        # Translation output, extracted text, export actions
│   │   ├── Dropzone.tsx          # PDF file upload area
│   │   ├── DocumentCard.tsx      # Library document thumbnails
│   │   ├── ProfileDropdown.tsx / ReviewModal.tsx  # Google Sign-In + reviews
│   │   ├── VoiceOnboardingDialog.tsx  # First-time language/voice picker before auto-read
│   │   ├── mobile/                # Mobile-only chrome (tab bar, sheets, mini player)
│   │   └── ui/                   # shadcn/ui primitives
│   ├── routes/              # TanStack Router file-based routes
│   │   ├── index.tsx             # Library page — document management
│   │   ├── doc.$id.tsx           # Workspace page — PDF + translation + TTS
│   │   ├── global-library.tsx    # Optional shared R2-backed document vault
│   │   ├── settings.tsx          # General AI + voice/TTS settings
│   │   └── settings_.appearance.tsx  # Theme settings
│   ├── context/              # AuthContext (Firebase), TtsContext (playback engine)
│   ├── lib/                 # Core logic & services
│   │   ├── openrouter.ts         # OpenRouter API client, payload builder, SSE streaming
│   │   ├── pdf.ts                # PDF text extraction, column detection, OCR fallback
│   │   ├── tts.ts / ttsEngine.ts # Sentence splitting, browser voices, ONNX session cache
│   │   ├── storage/              # IndexedDB schema, CRUD operations (barrel module)
│   │   ├── theme.ts              # Theme system (Deep Ocean + custom themes)
│   │   ├── network.ts            # Online/offline detection, friendly error messages
│   │   ├── voiceCache.ts         # OPFS/IndexedDB neural voice model caching
│   │   ├── firebase.ts           # Firebase Auth + Firestore client
│   │   ├── r2.ts / r2-cache.ts   # Cloudflare R2 server functions + listing cache
│   │   └── supabase.ts / sync.ts # Shared extraction cache + IndexedDB sync
│   └── hooks/               # Custom React hooks (`use-mobile`, `useThumbnail`)
├── public/                  # Static assets, ONNX runtime, Piper/Tesseract workers
├── documentation/           # Obsidian knowledge base — see [[Architecture]], [[Folder Structure]]
├── vite.config.ts           # Vite + TanStack Start + Tailwind + Nitro
├── nitro.config.ts          # Nitro server configuration
└── wrangler.jsonc           # Cloudflare Workers config (alternative deployment)
```

See [documentation/Product/Folder Structure.md](<documentation/Product/Folder Structure.md>) for the fully annotated version.

---

## Performance Optimizations

Anuwad is engineered to handle large PDF documents (500+ pages) in the browser without crashes or excessive memory usage:

| Optimization                         | Technique                                                                    | Impact                              |
| ------------------------------------ | ---------------------------------------------------------------------------- | ----------------------------------- |
| **Lazy canvas rendering**            | `IntersectionObserver` with +200px margin; only visible pages are drawn      | Keeps GPU memory bounded            |
| **Canvas eviction (MAX_RENDERED=5)** | Oldest rendered canvas is cleared when a 6th page enters viewport            | Prevents GPU memory exhaustion      |
| **Per-page IndexedDB storage**       | Pages stored individually, not as a giant array; loaded on demand            | Fast document open, low heap        |
| **TTS Web Worker isolation**         | Piper ONNX inference runs in a dedicated Web Worker                          | UI thread stays responsive          |
| **Audio buffer LRU cache**           | 5-entry cache for recently synthesized audio; ~4.4 MB peak                   | Instant replay without re-synthesis |
| **ONNX model caching**               | Voice models downloaded once, cached in IndexedDB                            | Offline TTS after first install     |
| **Translation result caching**       | Results stored with settings hash; cache invalidated only on settings change | No redundant API calls              |
| **AbortController on navigation**    | Active translation streams are cancelled when user navigates away            | No orphaned network requests        |
| **Write mutex (writeLocks Map)**     | Prevents concurrent IDB write corruption                                     | Data integrity under concurrency    |
| **PDF.js dedicated worker**          | PDF parsing runs in a separate web worker with Blob URL cleanup              | Non-blocking document load          |

---

## Deployment

### Vercel (Recommended)

The application is configured for Vercel deployment with Nitro server functions:

1. Connect the repository to Vercel
2. Set environment variables: `OPENROUTER_API_KEY`, `OPENROUTER_DEFAULT_MODEL`, and optionally the Firebase (`VITE_FIREBASE_*`), R2, and Supabase variables from `.env.example` if enabling sign-in / Global Library
3. Build command: `npm run build`
4. Output directory: auto-detected by the Nitro adapter
5. Node.js runtime: 22.x

### Cloudflare Workers (Alternative)

The project includes `wrangler.jsonc` for Cloudflare Workers deployment. Set `cloudflare: true` in `vite.config.ts` and configure Wrangler secrets for the API key.

---

## Supported Languages

Anuwad supports **90+ output languages** for AI translation via OpenRouter, including first-class support for Indian languages displayed in native scripts:

**Indian languages:** Hindi (हिंदी), Bengali (বাংলা), Telugu (తెలుగు), Malayalam (മലയാളം), Tamil (தமிழ்), Kannada (ಕನ್ನಡ), Marathi (मराठी), Gujarati (ગુજરાતી), Punjabi (ਪੰਜਾਬੀ), Odia (ଓଡ଼ିଆ), Urdu (اردو), Assamese (অসমীয়া), and more.

**Global languages:** Spanish, French, German, Portuguese, Japanese, Korean, Chinese (Simplified & Traditional), Arabic, Russian, Italian, Dutch, Turkish, Vietnamese, Thai, Indonesian, and 60+ others.

**Neural TTS voices** are available for **25+ languages** via the Piper voice catalog, with quality levels (low, medium, high) per language.

---

## Roadmap

- [ ] **Terminology glossaries** — Custom glossary matching and translation memory for domain-specific documents
- [ ] **OG image generation** — Dynamic Open Graph images for social sharing
- [ ] **Content clusters** — Blog / documentation pages for topical authority and SEO
- [ ] **Mobile-optimized workspace** — Enhanced responsive layout for tablet and phone reading
- [ ] **PDF annotation layer** — Highlight and annotate original PDF pages alongside translations
- [ ] **Multi-document projects** — Group related documents into translation projects
- [ ] **Export to EPUB** — Convert translated documents to EPUB format for e-readers

---

## FAQ

### What is Anuwad and how does it work?

Anuwad is a free, open-source, browser-only PDF reader that combines AI translation and neural text-to-speech in a single privacy-first application. It works by processing PDF documents entirely in the browser using pdf.js for rendering, routing translation requests through a secure server proxy to OpenRouter (which provides access to GPT-4o, Claude, Gemini, and 200+ other LLMs), and synthesizing speech locally using Piper WASM — a WebAssembly-based neural TTS engine. According to the Anuwad architecture, 100% of document data stays on the user's device; only the extracted text is sent to the AI model for translation, through a server-side proxy that ensures API keys are never exposed to the client.

### Is my data private when using Anuwad?

By default, yes. PDF files are stored in the browser's IndexedDB — they are never uploaded to any server. The only data that leaves the device is the extracted text sent for AI translation, which is routed through a secure server-side proxy (Vercel/Nitro) that adds the API key before forwarding to OpenRouter. The PDF binary, thumbnails, translation results, and TTS audio all remain 100% local. Neural voice models are downloaded once and cached in IndexedDB for fully offline speech synthesis.

The one exception is the **optional Global Library** feature (off unless explicitly enabled via `ENABLE_GLOBAL_SYNC`), which lets you upload PDFs to a shared Cloudflare R2 vault and sync extracted text/translations to Supabase for cross-device access. If you don't use Global Library, none of your documents or translations ever leave your device. Signing in with Google is also entirely optional and only used for the review flow.

### How is Anuwad different from Google Translate or ChatGPT for PDF translation?

Google Translate requires a manual copy-paste workflow, destroys document structure, and has no offline capability. ChatGPT requires page-by-page copy-paste with no document viewer, no TTS, and sends your data to external servers. Anuwad provides an integrated experience: a high-fidelity PDF viewer with lazy rendering, one-click AI translation with 13 explanation styles, continuous auto-read that translates ahead and advances pages automatically, sentence-level highlighted neural TTS, per-page AI configuration, and full offline capability for TTS — all in a single browser tab.

### What AI models does Anuwad support?

Anuwad supports **200+ language models** through the OpenRouter API, including GPT-4o (OpenAI), Claude 3.5 Sonnet (Anthropic), Gemini 1.5 Pro (Google), Llama (Meta), and many open-source alternatives. Users can select models based on context length, pricing, and capabilities. The default free model is `openai/gpt-oss-20b`. Per-page overrides allow using different models for different pages within the same document.

### Does the text-to-speech work offline?

Yes. Anuwad uses Piper, an open-source neural text-to-speech system that runs entirely in the browser via WebAssembly. Voice models (ONNX format, 20–60 MB each) are downloaded once from the Piper catalog and cached in IndexedDB. After the initial download, speech synthesis works completely offline with no internet connection required. The inference runs in a dedicated Web Worker to keep the UI responsive during audio generation. If a voice hasn't been downloaded yet and the device is offline, Anuwad fails fast with a clear "No internet connection" message rather than hanging on a doomed request.

---

## Contributing

Contributions are welcome. The `documentation/` folder contains an Obsidian knowledge base with detailed notes on every feature, component, pipeline, and API integration. Start with [00 — Index.md](documentation/00%20—%20Index.md) for a complete project map.

Key areas for contribution:

- **Additional Piper voice models** for underrepresented languages
- **Mobile UI improvements** for the workspace view
- **Terminology glossaries** for domain-specific documents

---

## License

This project is part of the [CyberBanjara](https://github.com/CyberBanjara) organization.

---

<p align="center">
  <sub>Built with ❤️ for multilingual readers everywhere.</sub>
</p>
