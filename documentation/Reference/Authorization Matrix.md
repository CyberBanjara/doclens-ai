# Authorization Matrix

> Defines which user role can access or perform each function/action in the Anuwad system.
> Based on the current implementation in `AuthContext.tsx`, `auth-server.ts`, route guards, and server-side endpoint protections.

---

## User Roles

| Role          | Level | Description                                                 |
| :------------ | :---: | :---------------------------------------------------------- |
| `admin`       |   1   | Full administrative access, role assignment, directory view |
| `editor`      |   2   | Curation and editorial permissions for global library       |
| `moderator`   |   3   | Content review and moderation of public library submissions |
| `viewer`      |   4   | Read-only preview permissions                               |
| `user`        |   5   | Standard authenticated user (default role on first sign-in) |
| _(anonymous)_ |   —   | Unauthenticated visitor, no session                         |

**Privilege groups defined in code:**

- `isAdmin`: `role === "admin"` — checked by both client and server.
- `isPrivileged`: `role ∈ ["admin", "editor", "moderator"]` — defined in `AuthContext.tsx` but not currently consumed by any UI guard.

---

## Authorization Matrix

### Application Pages & Routes

| Page / Route                           | Anonymous | `user` | `viewer` | `moderator` | `editor` | `admin` | Enforcement                                                  |
| :------------------------------------- | :-------: | :----: | :------: | :---------: | :------: | :-----: | :----------------------------------------------------------- |
| Homepage (`/`)                         |    ✅     |   ✅   |    ✅    |     ✅      |    ✅    |   ✅    | Public                                                       |
| Library (`/library`)                   |    ✅     |   ✅   |    ✅    |     ✅      |    ✅    |   ✅    | Public (local IndexedDB data)                                |
| Workspace (`/doc/:id`)                 |    ✅     |   ✅   |    ✅    |     ✅      |    ✅    |   ✅    | Public (local IndexedDB data)                                |
| Settings (`/settings`)                 |    ✅     |   ✅   |    ✅    |     ✅      |    ✅    |   ✅    | Public                                                       |
| Global Library (`/global-library`)     |    ❌     |   ✅   |    ✅    |     ✅      |    ✅    |   ✅    | Sign-in wall (blurred popup)                                 |
| Admin (`/admin`)                       |    ❌     |   ❌   |    ❌    |     ❌      |    ❌    |   ✅    | Client-side `isAdmin` check + server-side session role check |
| Privacy Policy (`/privacy-policy`)     |    ✅     |   ✅   |    ✅    |     ✅      |    ✅    |   ✅    | Public                                                       |
| Terms of Service (`/terms-of-service`) |    ✅     |   ✅   |    ✅    |     ✅      |    ✅    |   ✅    | Public                                                       |

### Server-Side API Endpoints

| Endpoint                      | Method | Anonymous | `user` | `viewer` | `moderator` | `editor` | `admin` | Enforcement                                                                                              |
| :---------------------------- | :----: | :-------: | :----: | :------: | :---------: | :------: | :-----: | :------------------------------------------------------------------------------------------------------- |
| `/api/auth/google-login`      |  POST  |    ✅     |   ✅   |    ✅    |     ✅      |    ✅    |   ✅    | Public (verifies Google token, creates session JWT & HttpOnly cookie)                                     |
| `/api/auth/me`                |  GET   |    ❌     |   ✅   |    ✅    |     ✅      |    ✅    |   ✅    | HttpOnly cookie session (`verifySessionJwt`)                                                             |
| `/api/auth/update-profile`    |  POST  |    ❌     |   ✅   |    ✅    |     ✅      |    ✅    |   ✅    | Valid session (`getSessionUserFromEvent`); syncs Firestore & issues updated JWT in HttpOnly cookie       |
| `/api/auth/logout`            |  POST  |    ✅     |   ✅   |    ✅    |     ✅      |    ✅    |   ✅    | Public (clears cookie)                                                                                   |
| `/api/admin/users`            |  GET   |    ❌     |   ❌   |    ❌    |     ❌      |    ❌    |   ✅    | `requireSessionFromEvent(event, ["admin"])`                                                              |
| `/api/admin/update-user-role` |  POST  |    ❌     |   ❌   |    ❌    |     ❌      |    ❌    |   ✅    | `requireSessionFromEvent(event, ["admin"])`                                                              |

### Client-Side Feature Actions

| Action                                            | Anonymous | `user` | `viewer` | `moderator` | `editor` | `admin` | Enforcement & Credential Layer                                                                                   |
| :------------------------------------------------ | :-------: | :----: | :------: | :---------: | :------: | :-----: | :--------------------------------------------------------------------------------------------------------------- |
| Upload PDF to local library                       |    ✅     |   ✅   |    ✅    |     ✅      |    ✅    |   ✅    | Local IndexedDB (`docStore`, `docBlobs`) — zero auth needed                                                     |
| Read/open local documents                         |    ✅     |   ✅   |    ✅    |     ✅      |    ✅    |   ✅    | Local IndexedDB                                                                                                  |
| AI translate/explain pages                        |    ✅     |   ✅   |    ✅    |     ✅      |    ✅    |   ✅    | Requires valid API key (server env or user-provided in settings)                                                 |
| TTS playback (native + neural)                    |    ✅     |   ✅   |    ✅    |     ✅      |    ✅    |   ✅    | Client-side Web Speech / Kokoro — no auth needed                                                                 |
| Export (Markdown/JSON)                            |    ✅     |   ✅   |    ✅    |     ✅      |    ✅    |   ✅    | Local IndexedDB data export                                                                                      |
| Browse Global Library                             |    ❌     |   ✅   |    ✅    |     ✅      |    ✅    |   ✅    | Client sign-in wall (`!user` blurred overlay) + Server `listR2Files` (read-only R2 keys)                         |
| Import from Global Library (PDF + translations)   |    ❌     |   ✅   |    ✅    |     ✅      |    ✅    |   ✅    | Requires sign-in; downloads R2 PDF + pulls Supabase translations via `VITE_SUPABASE_PUBLISHABLE_KEY`             |
| **Sync to workspace from Supabase** (Read cache)  |    ✅     |   ✅   |    ✅    |     ✅      |    ✅    |   ✅    | **Universal read:** `syncFromSupabase` uses `VITE_SUPABASE_PUBLISHABLE_KEY` (public read-only key)              |
| **Sync to Supabase from workspace** (Write cache) |    ❌     |   ❌   |    ❌    |     ✅      |    ✅    |   ✅    | **Restricted write:** `syncToSupabase` requires write secret (`PIPELINE_CATALOG_SYNC_TOKEN` / `SUPABASE_SECRET`) |
| Update profile & translation preferences          |    ❌     |   ✅   |    ✅    |     ✅      |    ✅    |   ✅    | `apiUpdateUserProfile` (`POST /api/auth/update-profile`) -> updates Firestore + refreshed session JWT           |
| Upload PDF to Cloudflare R2 (Global Lib)          |    ❌     |   ❌   |    ❌    |     ✅      |    ✅    |   ✅    | Layer 1: `assertRoleSession(["admin", "moderator", "editor"])` + Layer 2: `STORAGE_DISPATCH_TOKEN_*`            |
| Sync R2 thumbnails                                |    ❌     |   ❌   |    ❌    |     ✅      |    ✅    |   ✅    | Layer 1: `assertRoleSession(["admin", "moderator", "editor"])` + Layer 2: `STORAGE_DISPATCH_TOKEN_*`            |
| Delete from Global Library                        |    ❌     |   ❌   |    ❌    |     ✅      |    ❌    |   ✅    | Layer 1: `assertRoleSession(["admin", "moderator"])` + Layer 2: `STORAGE_DISPATCH_TOKEN_*`                      |
| Upload to R2 from workspace                       |    ❌     |   ❌   |    ❌    |     ✅      |    ✅    |   ✅    | Client: `isAdmin \|\| moderator \|\| editor \|\| syncEnabled` + Server Layer 1 role check                        |
| View admin dashboard                              |    ❌     |   ❌   |    ❌    |     ❌      |    ❌    |   ✅    | Client `isAdmin` check + Server session verification                                                             |
| List all users                                    |    ❌     |   ❌   |    ❌    |     ❌      |    ❌    |   ✅    | Server: `requireSessionFromEvent(["admin"])`                                                                     |
| Change user roles                                 |    ❌     |   ❌   |    ❌    |     ❌      |    ❌    |   ✅    | Server: `requireSessionFromEvent(["admin"])`                                                                     |

---

## Credential Separation & Two-Layer Security Model

The system enforces strict directional credential isolation:

### Supabase Synchronizations (Read vs Write Separation)

1. **Sync to Workspace from Supabase (`syncFromSupabase` / Read):**
   - **Direction:** Supabase Cloud -> Local Workspace / IndexedDB
   - **Scope:** **Universal.** Any user reading a document or selecting a language can fetch public pre-translated pages.
   - **Environment Variables Used:**
     - `VITE_SUPABASE_PUBLISHABLE_KEY` or `SUPABASE_PUBLISHABLE_KEY` (Public Read-Only Anonymous Key)
     - `SUPABASE_URL` / `VITE_SUPABASE_URL`
   - **Enforcement:** No server-side session or write key required. Fails gracefully if disabled via `ENABLE_GLOBAL_SYNC=false`.

2. **Sync to Supabase from Workspace (`syncToSupabase` / Write):**
   - **Direction:** Local Workspace / IndexedDB -> Supabase Cloud
   - **Scope:** **Restricted.** Only permitted environments/roles with server-side write authorization can persist translations.
   - **Environment Variables Used:**
     - `PIPELINE_CATALOG_SYNC_TOKEN` (Primary Write Key)
     - Fallback Write Keys: `SUPABASE_WRITE_KEY`, `SUPABASE_SECRET_KEY`, `SUPABASE_SERVICE_ROLE_KEY`
     - *Note: `VITE_SUPABASE_PUBLISHABLE_KEY` will strictly fail with `Unauthorized [Layer 2 Failed]` if write key is missing.*
   - **Enforcement:** Validated in `saveSupabaseLanguagePage` and `batchSaveSupabaseLanguagePages`. Data is strictly isolated to the specific language table (`translations_<slug>`) and `book_languages`.

### Cloudflare R2 Vault (Read vs Write Separation)

1. **Read Operations (Browse, Download, Read Thumbnails):**
   - **Environment Variables:** `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_ACCOUNT_ID`, `R2_BUCKET_NAME`, `R2_PUBLIC_BASE_URL`
   - **Enforcement:** Validated read client; Global Library route is protected by client-side auth wall (`!user` blur).

2. **Write Operations (Upload PDF, Upload Thumbnail, Delete, Reorganize):**
   - **Layer 1 (Identity & Role):** Validates HttpOnly cookie JWT session via `assertRoleSession(["admin", "moderator", "editor"])` (or `["admin", "moderator"]` for destructive actions like delete/reorganize).
   - **Layer 2 (API Credentials):** Requires dedicated write credentials `STORAGE_DISPATCH_TOKEN_ID` and `STORAGE_DISPATCH_TOKEN_SECRET` (or `R2_WRITE_ACCESS_KEY_ID`).

---

## Pending Confirmation

> [!NOTE]
> The following items are defined in the codebase but not yet enforced by any UI or server logic. They exist as infrastructure for future feature development.

| Item                         | Notes                                                                                                                                                                                                                   |
| :--------------------------- | :---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `editor` role enforcement    | The `editor` role is assignable via the admin dashboard and has a defined description ("Can publish, edit, and curate global content"), but no server endpoint or UI action currently checks for `editor` specifically. |
| `moderator` role enforcement | Similarly defined and assignable, but no moderation-specific UI or API guard exists yet.                                                                                                                                |
| `viewer` role restrictions   | The `viewer` role is described as "Read-only preview permissions" but is currently treated identically to `user` — no read-only restrictions are enforced.                                                              |
| `isPrivileged` usage         | Defined in `AuthContext.tsx` as `["admin", "editor", "moderator"]`, but never consumed by any component or route guard. Available for future privilege-gated features.                                                  |

---

## Implementation References

- **Client auth context:** [AuthContext.tsx](file:///home/sanskar/Desktop/doclens-ai/src/context/AuthContext.tsx) — `isAdmin`, `isPrivileged`, `role`, `userPreferences`
- **Client auth helpers:** [auth-client.ts](file:///home/sanskar/Desktop/doclens-ai/src/lib/auth-client.ts) — `apiLoginWithGoogle`, `apiFetchCurrentUser`, `apiUpdateUserProfile`, `apiLogout`
- **Server session guard:** [auth-server.ts](file:///home/sanskar/Desktop/doclens-ai/server/lib/auth-server.ts) — `requireSessionFromEvent(event, allowedRoles)`, `getSessionUserFromEvent`, `createSessionJwt`, `setSessionCookieOnEvent`
- **Profile update & JWT refresh endpoint:** [update-profile.post.ts](file:///home/sanskar/Desktop/doclens-ai/server/api/auth/update-profile.post.ts) — Updates user profile claims (`nativeLanguage`, `style`, `educationLevel`, `name`, `photoURL`), syncs Firestore, and issues updated JWT session cookie
- **Supabase Server Functions & Credential Isolation:** [supabase.ts](file:///home/sanskar/Desktop/doclens-ai/src/lib/supabase.ts) — `getSupabaseClient({ writeAccess })`, `fetchAvailableLanguagesForBook`, `fetchSupabaseLanguagePage`, `fetchSupabaseLanguageBook`, `saveSupabaseLanguagePage`, `batchSaveSupabaseLanguagePages`
- **Sync Orchestration:** [sync.ts](file:///home/sanskar/Desktop/doclens-ai/src/lib/sync.ts) — `syncFromSupabase` (Read), `syncToSupabase` (Write)
- **R2 Two-Layer Protected Operations:** [r2.ts](file:///home/sanskar/Desktop/doclens-ai/src/lib/r2.ts) — `assertRoleSession`, `getS3Client({ writeAccess })`, `uploadToR2`, `deleteFromR2`, `uploadThumbnailToR2`, `downloadFromR2`
- **Admin route guard:** [admin.tsx](file:///home/sanskar/Desktop/doclens-ai/src/routes/admin.tsx) — Client-side `isAdmin` check
- **Global Library auth wall:** [global-library.tsx](file:///home/sanskar/Desktop/doclens-ai/src/routes/global-library.tsx) — Sign-in popup for unauthenticated users
- **Firestore user schema:** `users/{uid}` — `{ name, email, photoURL, role, nativeLanguage, style, educationLevel, lastLoginAt, createdAt, updatedAt }`

---

_Part of [[MOC — Features]]_

