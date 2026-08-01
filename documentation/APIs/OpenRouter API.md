# OpenRouter API

> **Category:** External Cloud Service  
> **Documentation:** [openrouter.ai](https://openrouter.ai/)

---

## Purpose

**OpenRouter** provides access to a wide range of LLMs (such as GPT-4, Claude, Gemini, and Llama) through a single API interface. Anuwad uses it to handle translations, explanations, and summarization tasks.

---

## Integration Details

- **Server-Side Security Proxy:** To protect user keys, the client browser never contacts OpenRouter directly. Instead, requests go through `completeWithServerOpenRouter()` — a TanStack Start server function (`createServerFn` in `src/lib/openrouter.ts`) — which attaches the `OPENROUTER_API_KEY` credential server-side before forwarding the payload.
- **Real-Time SSE Streaming:** Translation tasks use Server-Sent Events (SSE) via `streamCompletion()` to pipe text tokens to the UI in real-time, reducing perceived latency. The client reads the SSE stream using a chunk reader that parses `data:` lines and accumulates partial tokens into the streaming buffer.
- **Model List Caching:** Fetches available models from `https://openrouter.ai/api/v1/models`. Models are filtered on the client to exclude non-text modalities (e.g., image generators) using the `isTextToText()` filter.
- **Global Quota Handling:** When using server-managed API keys, the system detects and gracefully handles global quota exhaustion errors, displaying appropriate user-facing messages.

---

## Core Configurations

- **Request Formatting (`buildPagePayload`):** Assembles system prompt instructions, text blocks, temperature settings, and target languages.
- **Response Error Handling:** Checks for key issues (missing worker variables, invalid configurations, quota limits) and displays descriptive error states to the user.
- **Custom API Keys:** Users may optionally provide their own OpenRouter API key via the [[General Settings Page]], bypassing the server-managed key.

---

## Relationships

- **Page integrations:** [[General Settings Page]] (connection check, model selection), [[Workspace Page]] (execution card).
- **Feature powered:** [[AI Translation]].

---

_Part of [[MOC — APIs]]_
