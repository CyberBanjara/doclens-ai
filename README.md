<p align="center">
  <img src="public/light_13746323.png" alt="Anuwad logo" width="80" />
</p>

<h1 align="center">Anuwad</h1>

<p align="center">
  <em>Private PDF Reader, AI Translator & Neural Voice Reader</em>
</p>

<p align="center">
  <a href="https://www.anuwad.com"><strong>Live Demo (anuwad.com)</strong></a> ·
  <a href="#quick-start">Quick Start</a> ·
  <a href="#tech-stack">Tech Stack</a> ·
  <a href="LICENSE">License</a>
</p>

---

## 💡 What Is Anuwad?

**Anuwad** is a browser-first document intelligence app that lets you upload PDFs, translate or explain their content using modern AI models, and listen to the text with natural-sounding neural text-to-speech — all while keeping your data **100% private** on your device.

---

## ✨ Key Highlights

- **🔒 100% Private & Browser-First:** PDF documents are processed entirely in your browser and saved locally in IndexedDB. Your files never leave your device.
- **🌍 AI Translation & Explanations:** Translate pages into **90+ languages** or get AI-powered explanations using leading LLMs (GPT-4o, Claude 3.5 Sonnet, Gemini 1.5 Pro, Llama) via OpenRouter.
- **🔊 Neural Text-to-Speech (TTS):** Read documents aloud with natural AI voice engines powered by Piper WebAssembly — fully functional offline after initial download.
- **⚡ High-Performance PDF Viewer:** Fast canvas rendering with lazy loading and memory management engineered for large documents (500+ pages).

---

## 🚀 Quick Start

### 1. Prerequisites

- **Node.js** ≥ 18
- **npm** or **bun**

### 2. Installation & Setup

```bash
# Clone the repository
git clone https://github.com/CyberBanjara/doclens-ai.git
cd doclens-ai

# Install dependencies
npm install

# Copy environment template
cp .env.example .env
```

Add your OpenRouter API key in `.env` (or bring your own key directly in the app UI):

```env
OPENROUTER_API_KEY=your-openrouter-api-key
```

### 3. Run Development Server

```bash
npm run dev
```

Open `http://localhost:5173` in your browser.

---

## 🛠️ Tech Stack

- **Framework:** React 19 + TypeScript
- **Routing:** TanStack Router & TanStack Start
- **PDF Engine:** PDF.js
- **AI Gateway:** OpenRouter API
- **Speech Engine:** Piper TTS (WebAssembly / ONNX)
- **Styling:** Tailwind CSS + Radix UI
- **Storage:** Local IndexedDB

---

## 📜 License

This project is licensed under the **GNU General Public License v3.0** — see the [LICENSE](LICENSE) file for details.

---

<p align="center">
  <sub>Built with ❤️ by <a href="https://github.com/CyberBanjara">CyberBanjara</a></sub>
</p>
