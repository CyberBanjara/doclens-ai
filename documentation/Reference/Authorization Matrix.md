# Authorization Matrix

> Defines which user role can access or perform each function/action in the Anuwad system.
> Based on the current implementation in `AuthContext.tsx`, `auth-server.ts`, route guards, and server-side endpoint protections.

---

## User Roles

| Role          | Level | Description                                                   |
| :------------ | :---: | :------------------------------------------------------------ |
| `admin`       |   1   | Full administrative access, role assignment, directory view   |
| `editor`      |   2   | Curation and editorial permissions for global library         |
| `moderator`   |   3   | Content review and moderation of public library submissions   |
| `viewer`      |   4   | Read-only preview permissions                                 |
| `user`        |   5   | Standard authenticated user (default role on first sign-in)   |
| *(anonymous)* |   —   | Unauthenticated visitor, no session                           |

**Privilege groups defined in code:**
- `isAdmin`: `role === "admin"` — checked by both client and server.
- `isPrivileged`: `role ∈ ["admin", "editor", "moderator"]` — defined in `AuthContext.tsx` but not currently consumed by any UI guard.

---

## Authorization Matrix

### Application Pages & Routes

| Page / Route               | Anonymous | `user` | `viewer` | `moderator` | `editor` | `admin` | Enforcement |
| :------------------------- | :-------: | :----: | :------: | :---------: | :------: | :-----: | :---------- |
| Homepage (`/`)             |     ✅    |   ✅   |    ✅    |      ✅     |    ✅    |    ✅   | Public      |
| Library (`/library`)       |     ✅    |   ✅   |    ✅    |      ✅     |    ✅    |    ✅   | Public (local IndexedDB data) |
| Workspace (`/doc/:id`)     |     ✅    |   ✅   |    ✅    |      ✅     |    ✅    |    ✅   | Public (local IndexedDB data) |
| Settings (`/settings`)     |     ✅    |   ✅   |    ✅    |      ✅     |    ✅    |    ✅   | Public      |
| Global Library (`/global-library`) | ❌ |   ✅   |    ✅    |      ✅     |    ✅    |    ✅   | Sign-in wall (blurred popup) |
| Admin (`/admin`)           |     ❌    |   ❌   |    ❌    |      ❌     |    ❌    |    ✅   | Client-side `isAdmin` check + server-side session role check |
| Privacy Policy (`/privacy-policy`) |  ✅ |  ✅   |    ✅    |      ✅     |    ✅    |    ✅   | Public      |
| Terms of Service (`/terms-of-service`) | ✅ | ✅  |    ✅    |      ✅     |    ✅    |    ✅   | Public      |

### Server-Side API Endpoints

| Endpoint                         | Method | Anonymous | `user` | `viewer` | `moderator` | `editor` | `admin` | Enforcement |
| :------------------------------- | :----: | :-------: | :----: | :------: | :---------: | :------: | :-----: | :---------- |
| `/api/auth/google-login`         | POST   |     ✅    |   ✅   |    ✅    |      ✅     |    ✅    |    ✅   | Public      |
| `/api/auth/me`                   | GET    |     ❌    |   ✅   |    ✅    |      ✅     |    ✅    |    ✅   | HttpOnly cookie session |
| `/api/auth/logout`               | POST   |     ✅    |   ✅   |    ✅    |      ✅     |    ✅    |    ✅   | Public (clears cookie) |
| `/api/admin/users`               | GET    |     ❌    |   ❌   |    ❌    |      ❌     |    ❌    |    ✅   | `requireSessionFromEvent(event, ["admin"])` |
| `/api/admin/update-user-role`    | POST   |     ❌    |   ❌   |    ❌    |      ❌     |    ❌    |    ✅   | `requireSessionFromEvent(event, ["admin"])` |

### Client-Side Feature Actions

| Action                                    | Anonymous | `user` | `viewer` | `moderator` | `editor` | `admin` | Enforcement |
| :---------------------------------------- | :-------: | :----: | :------: | :---------: | :------: | :-----: | :---------- |
| Upload PDF to local library               |     ✅    |   ✅   |    ✅    |      ✅     |    ✅    |    ✅   | Local IndexedDB — no auth needed |
| Read/open local documents                 |     ✅    |   ✅   |    ✅    |      ✅     |    ✅    |    ✅   | Local IndexedDB |
| AI translate/explain pages                |     ✅    |   ✅   |    ✅    |      ✅     |    ✅    |    ✅   | Requires valid API key (server env or user-provided) |
| TTS playback (native + neural)            |     ✅    |   ✅   |    ✅    |      ✅     |    ✅    |    ✅   | Client-side, no auth |
| Export (Markdown/JSON)                     |     ✅    |   ✅   |    ✅    |      ✅     |    ✅    |    ✅   | Local IndexedDB data |
| Browse Global Library                     |     ❌    |   ✅   |    ✅    |      ✅     |    ✅    |    ✅   | Requires authenticated session |
| Import from Global Library                |     ❌    |   ✅   |    ✅    |      ✅     |    ✅    |    ✅   | Requires authenticated session |
| Upload PDF to Cloudflare R2 (Global Lib)  |     ❌    |   ❌   |    ❌    |      ❌     |    ❌    |    ✅   | Client: `isAdmin` gate on UI button |
| Sync R2 thumbnails                        |     ❌    |   ❌   |    ❌    |      ❌     |    ❌    |    ✅   | Client: `isAdmin` gate on UI button |
| Delete from Global Library                |     ❌    |   ❌   |    ❌    |      ❌     |    ❌    |    ✅   | Client: `isAdmin` gate on UI action |
| Upload to R2 from workspace               |     ❌    |   ❌   |    ❌    |      ❌     |    ❌    |    ✅   | Client: `isAdmin \|\| syncEnabled` |
| Sync to Supabase from workspace           |     ❌    |   ❌   |    ❌    |      ❌     |    ❌    |    ✅   | Client: `isAdmin \|\| syncEnabled` |
| View admin dashboard                      |     ❌    |   ❌   |    ❌    |      ❌     |    ❌    |    ✅   | Client + server `isAdmin` |
| List all users                            |     ❌    |   ❌   |    ❌    |      ❌     |    ❌    |    ✅   | Server: `requireSessionFromEvent(["admin"])` |
| Change user roles                         |     ❌    |   ❌   |    ❌    |      ❌     |    ❌    |    ✅   | Server: `requireSessionFromEvent(["admin"])` |

---

## Pending Confirmation

> [!NOTE]
> The following items are defined in the codebase but not yet enforced by any UI or server logic. They exist as infrastructure for future feature development.

| Item | Notes |
| :--- | :---- |
| `editor` role enforcement | The `editor` role is assignable via the admin dashboard and has a defined description ("Can publish, edit, and curate global content"), but no server endpoint or UI action currently checks for `editor` specifically. |
| `moderator` role enforcement | Similarly defined and assignable, but no moderation-specific UI or API guard exists yet. |
| `viewer` role restrictions | The `viewer` role is described as "Read-only preview permissions" but is currently treated identically to `user` — no read-only restrictions are enforced. |
| `isPrivileged` usage | Defined in `AuthContext.tsx` as `["admin", "editor", "moderator"]`, but never consumed by any component or route guard. Available for future privilege-gated features. |

---

## Implementation References

- **Client auth context:** [AuthContext.tsx](file:///home/sanskar/Desktop/doclens-ai/src/context/AuthContext.tsx) — `isAdmin`, `isPrivileged`, `role`
- **Server session guard:** [auth-server.ts](file:///home/sanskar/Desktop/doclens-ai/server/lib/auth-server.ts) — `requireSessionFromEvent(event, allowedRoles)`
- **Admin route guard:** [admin.tsx](file:///home/sanskar/Desktop/doclens-ai/src/routes/admin.tsx) — Client-side `isAdmin` check
- **Global Library auth wall:** [global-library.tsx](file:///home/sanskar/Desktop/doclens-ai/src/routes/global-library.tsx) — Sign-in popup for unauthenticated users
- **Role definitions:** [admin.tsx](file:///home/sanskar/Desktop/doclens-ai/src/routes/admin.tsx#L38-L79) — `ALL_ROLES` and `ROLE_CONFIG`
- **Firestore user schema:** `users/{uid}` — `{ name, email, photoURL, role, lastLoginAt, createdAt }`

---

_Part of [[MOC — Features]]_
