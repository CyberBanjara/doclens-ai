# DocLens AI — Product & Feature Updates Summary

> **Scope**: All functional changes introduced since commit `88cba4ce` (including recent commits and currently working uncommitted enhancements).  
> **Target Audience**: Non-technical stakeholders, product managers, and clients.

---

## Executive Summary
Since the baseline update, the platform has evolved from a single-provider translation viewer into an **enterprise-ready, multi-provider AI document translation system**. Key milestones include:
1. **Subscription & Quota Management**: Flexible user plans, automatic credit tracking, and plan upgrades.
2. **Multi-AI Provider Choice**: Seamless switching between out-of-the-box Managed AI, Personal OpenRouter, Enterprise OmniRouter, and offline Ollama.
3. **Faster & More Intuitive Page Controls**: Modern inline mode switches and real-time model pricing estimates.
4. **Self-Healing & Zero-Friction Setup**: Automatic testing of API keys and server connections with safe fallbacks so translation never gets blocked.
5. **Crash-Free Read Aloud (TTS)**: Solved browser memory bottlenecks and voice playback stuttering.

---

## 1. Subscription, Billing & Translation Credits
*Introduced in commit `0d2711d`*

* **Account Translation Quotas**:
  * Users now have dedicated translation credits tracked cleanly per account (e.g. Free Tier allowance vs. Paid Tier credits).
  * Prevents double-charging or quota deductions on failed translations through atomic credit reservations.
* **In-App Subscription & Upgrade Modal**:
  * Added a pricing and plan selection window inside the app.
  * Users can compare plan tiers (Free, Starter, Pro), see monthly page limits, and subscribe directly.
* **Dedicated User Profile & Dashboard (`/user`)**:
  * Added a clean personal account screen showing current subscription status, remaining page quota, renewal date, and billing history.
* **Secure Cloud Translation Pipeline**:
  * Core translation requests now pass through a secure server pipeline so enterprise keys and payment transactions are never exposed to the public browser.

---

## 2. Flexible AI Provider Options (Bring-Your-Own-AI)
*Introduced in commit `5a75544`*

* **One-Click Provider Switching**:
  * Users are no longer locked into a single AI provider. In **Settings**, users can switch between:
    * **Managed AI (Default)**: Ready to use immediately with zero configuration or keys needed.
    * **Personal OpenRouter**: Allows power users to connect their personal OpenRouter account.
    * **OmniRouter**: Allows enterprises to connect their own private or self-hosted AI gateway.
    * **Ollama**: Allows users to run 100% offline, local AI models on their personal computers without internet data transmission.
* **Visual AI Model Catalog**:
  * Added a searchable model library window grouping models by brand (OpenAI, Anthropic, Google Gemini, Meta Llama, DeepSeek).
  * Displays model capabilities, context window sizes, and recommended tasks.
* **Built-in OmniRouter Setup Guide**:
  * Integrated a downloadable PDF setup walkthrough directly into the platform so users can configure internal gateways easily.
* **Smart Rate-Limit Recovery**:
  * If a third-party AI provider is temporarily busy or hits traffic limits, the system presents polite, clear status notifications and retry strategies instead of crashing.

---

## 3. Simplified Page Translation Controls & Cost Transparency
*Introduced in commit `7cdd17e`*

* **Modern Inline Action Bar**:
  * Replaced hidden popup menus on document pages with a clean, one-click inline bar right above each page.
  * Allows switching instantly between translation modes (e.g., *Full Translation*, *Proofread*, *Summary*, *Key Vocabulary*).
* **Transparent Model Pricing Badges**:
  * The model selector now displays real-time pricing indicators (e.g., cost per 1 Million tokens, Free tier badges, Ultra-low-cost tags).
  * Helps users make cost-effective choices without guessing token prices.
* **Automatic "Cheapest Provider" Routing (`:floor`)**:
  * For open-source models available through multiple cloud hosts, the system automatically routes requests through the lowest-priced provider, saving users money automatically.
* **Direct Translation Editor with Safety Checks**:
  * Restored the ability for translators and editors to review and tweak structured JSON translations with instant live error validation to prevent broken formatting.
* **Server-Protected Managed Models**:
  * Ensures users on Managed AI automatically get the optimal model matched with their plan without needing to tweak technical parameters.

---

## 4. Seamless User Experience & Self-Healing Settings
*Introduced in uncommitted working updates*

* **Zero-Friction Default Experience (No API Key Warnings)**:
  * Users using the default **Managed AI** will never see annoying "API Key Missing" warnings on the Library or Document pages.
  * API key prompts only appear if a user specifically decides to activate their personal OpenRouter key.
* **Self-Healing Toggle with 5-Second Safe Verification**:
  * When a user turns ON their personal OpenRouter key or an OmniRouter endpoint, the app tests the connection in the background for 5 seconds.
  * **Safe Fallback**: If the key is expired, mistyped, or the server is down, the system alerts the user and smoothly switches back to **Managed AI (Default)**.
  * Prevents the app from getting stuck in a broken or unresponsive state.
* **No Endless Background Checking**:
  * Eliminated background validation loops that previously caused slow loading and network chatter.

---

## 5. Smooth, Crash-Free Read Aloud (Text-to-Speech)
*Introduced in uncommitted working updates*

* **Eliminated Browser Slowdowns & Memory Bloat**:
  * High-quality neural AI voices now automatically clean up browser memory as soon as audio playback finishes or when the user changes pages.
* **Seamless Audio Transitions**:
  * Optimized audio pre-loading so sentences transition naturally without buffering pauses or consuming excessive computer memory.
* **Instant Voice Switching**:
  * Changing between different language speakers or voices instantly frees previous voice models, preventing computer lag and audio overlapping.
* **Clean Stop & Pause Controls**:
  * Pressing pause or stop immediately cuts audio and releases browser audio channels cleanly without background echo.

---

## 6. Data Management & Storage Reset Safety
*Introduced in uncommitted working updates*

* **Protected Configuration Resets**:
  * When cleaning local browser cache or resetting document storage in Settings, users are given granular choices so they do not accidentally lose their saved API keys or custom server configurations.

---

## Status Overview Table

| Feature Area | What it Does for the User | Release Status |
| :--- | :--- | :--- |
| **Subscription & Quota Layer** | Track translation credits, subscription tiers, and plan renewal | Committed (`0d2711d`) |
| **Multi-Provider AI Switcher** | Freedom to choose Managed AI, OpenRouter, OmniRouter, or Ollama | Committed (`5a75544`) |
| **Visual Model Selector** | Browse models with filters, context sizes, and developer tags | Committed (`5a75544`) |
| **Inline Page Translation Bar** | 1-click mode switching directly above each document page | Committed (`7cdd17e`) |
| **Model Cost Transparency** | Displays price badges and automatically picks the cheapest host | Committed (`7cdd17e`) |
| **Direct JSON Translation Editor** | Edit translated outputs with real-time format validation | Committed (`7cdd17e`) |
| **Zero-Friction Managed Experience** | No API key setup needed for standard users | Active / Uncommitted |
| **Self-Healing Connection Check** | Auto-tests keys on toggle; safely falls back if invalid | Active / Uncommitted |
| **High-Performance Read Aloud** | Fixes audio lag, memory leaks, and browser crashes during TTS | Active / Uncommitted |
| **Safe Storage Reset** | Clear documents and cache without losing custom AI settings | Active / Uncommitted |

