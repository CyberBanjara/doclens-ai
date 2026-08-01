# API Key Management Feature

> Handles server connection verification and API keys.

---

## Capabilities

- Confirms server connection status.
- Displays key validation state in the UI.
- Never exposes API keys directly to the client browser.

---

## Security Model

The OpenRouter API key is configured as an environment variable (`OPENROUTER_API_KEY`) on the server. The client application makes requests to a local proxy worker, which attaches the key before forwarding the request to OpenRouter.

---

## UI Components

- **Status Badge:** Header badge showing key status (`connected`, `invalid`, `missing`, `unknown`).
- **Setup Banner:** Banner shown on the [[Library Page]] if the key is invalid or missing.
- **Verification Modal:** [[ApiKeyModal]] dialog for checking connection status.

---

## Relationships

- **Modal Component:** [[ApiKeyModal]].
- **API Integration:** [[OpenRouter API]].

---

_Part of [[MOC — Features]]_
