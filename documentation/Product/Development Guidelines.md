# Development Guidelines

> Local setup, scripts, and coding conventions actually observed in this codebase.

---

## Local Setup

1. Install dependencies: `bun install` (repo ships a `bun.lockb`) or `npm install` (a `package-lock.json` is also present).
2. Copy `.env.example` → `.env` and fill in at minimum `OPENROUTER_API_KEY`. The Firebase, R2, and Supabase variables are only required if you're working on [[Authentication]] or [[Global Library]] — the app runs without them, those features just won't be usable.
3. `npm run dev` — starts the Vite dev server.

## Scripts (`package.json`)

| Script                  | Purpose                                                                                                                     |
| ----------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| `npm run dev`           | Vite dev server                                                                                                             |
| `npm run build`         | Production build (`NODE_OPTIONS='--max-old-space-size=4096'` — the dependency graph is large enough to need the extra heap) |
| `npm run build:dev`     | Development-mode build                                                                                                      |
| `npm run preview`       | Preview a production build locally                                                                                          |
| `npm run lint`          | ESLint over the whole repo                                                                                                  |
| `npm run format`        | Prettier, write mode                                                                                                        |
| `npm run reorganize-r2` | Runs `scripts/reorganize-r2.mjs`, a CLI wrapper around the `reorganizeR2Files` server function                              |

## Formatting & Linting

- Prettier config (`.prettierrc`): 100-char print width, double quotes off (`singleQuote: false` → double quotes), trailing commas everywhere, semicolons on.
- ESLint (`eslint.config.js`, flat config): `typescript-eslint` recommended rules, `eslint-plugin-react-hooks` recommended rules, `eslint-plugin-prettier` (formatting issues surface as lint errors), and `react-refresh/only-export-components` as a warning. Notably, `@typescript-eslint/no-unused-vars` is turned **off** — don't rely on lint to catch dead code; check manually or via `tsc`.
- `tsconfig.json`: `strict: true`, but `noUnusedLocals`/`noUnusedParameters` are off. Path alias `@/*` maps to `src/*`.

## Coding Conventions Observed in This Codebase

- **Function components + hooks only** — no class components anywhere in `src/`.
- **`cn()` for conditional classes** (`src/lib/utils.ts`, `clsx` + `tailwind-merge`) — the standard way to combine Tailwind classes conditionally; don't hand-roll template-string class concatenation.
- **shadcn/ui pattern for primitives** — `src/components/ui/*` are locally-owned, copy-in Radix-based components (see `components.json`), not an installed component library. Extend them in place rather than wrapping.
- **`lib/` is framework-agnostic** — modules in `src/lib/` avoid React imports where possible (exceptions: `voiceLanguageMap.ts` imports a type from a context). Business logic belongs here, not inline in components, so it stays testable/reusable even though there's no test suite yet.
- **Server functions via `createServerFn`** — any code that needs a secret (API keys, R2/Supabase credentials) is a TanStack Start server function in `src/lib/*.ts`, not a client-side fetch. Follow this pattern for any new secret-requiring integration.
- **`localStorage` for preferences, IndexedDB for data** — user preferences (AI defaults, TTS settings, theme) go in `localStorage` with a `doclens:`-prefixed key; documents, page text, and AI results go in IndexedDB via `src/lib/storage.ts`. Don't mix the two.
- **Cross-component coordination via typed-by-convention `CustomEvent`s** — components without a direct relationship (e.g. `PdfViewer` and `PageWorkstation`) talk via `window.dispatchEvent`/`addEventListener` on `doclens:*`-prefixed events rather than prop-drilling or a global store. See [[Architecture]] for the current event list. These are not yet centralized/typed — if you add a new one, keep the naming convention consistent so it stays easy to grep.
- **Settings-hash cache invalidation** — anywhere a cached AI result needs to be checked for staleness, use `computeSettingsHash()` (`src/lib/storage.ts`) rather than comparing individual fields.

## No Automated Test Suite

There is currently no test runner configured in this repo. Verify changes via:

1. `npx tsc --noEmit` — type checking.
2. `npm run lint` — lint checking.
3. `npm run build` — confirms the production build succeeds.
4. Manual smoke testing in the dev server for anything touching PDF extraction, translation, or TTS — these are the areas most likely to have subtle runtime-only failures (WASM loading, IndexedDB migrations, streaming) that a type checker won't catch.

---

## Related

- [[Architecture]] — System architecture and module dependency graph.
- [[Folder Structure]] — Annotated repository layout.
- [[Dependencies]] — Every package dependency, grouped by concern.

---

_Part of [[MOC — Product]]_
