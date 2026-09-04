# Serverless Authentication & Authorization Architecture

## Overview

Anuwad implements a **serverless-only, zero-refresh-token authentication & authorization architecture** designed for high security, speed, and privacy.

---

## Key Principles & Security Model

1. **Single-Use Google Login:**
   - Client triggers Google authentication once during sign-in to obtain a Google ID token.
   - Client Firebase Auth instance is immediately signed out so no persistent client-side token or session remains in browser memory.

2. **Server-Side Identity Verification & Firestore Role Synchronization:**
   - Serverless endpoint `POST /api/auth/google-login` verifies the token with Google/Firebase Identity Toolkit.
   - The user's role is synchronized from Google to Firestore (`users/{uid}` collection) server-side (defaulting to `'user'`).

3. **HttpOnly Cookie JWT Sessions:**
   - The server signs a short-lived JWT session (4-hour expiration) with `{ uid, email, name, photoURL, role, nativeLanguage, style, educationLevel }` using `jose` with server secret `ADMIN_JWT_SECRET`.
   - The JWT is stored exclusively in a **Secure, HttpOnly, SameSite=Lax** cookie (`session_token`).
   - No auth tokens or secrets are ever returned in API response bodies or exposed to client JavaScript.

4. **Filtered Client Profile & JWT Refresh:**
   - The client receives the profile and preference fields required for the UI: `{ uid, name, email, photoURL, role, nativeLanguage, style, educationLevel }`.
   - On page load, `GET /api/auth/me` verifies the HttpOnly cookie server-side and returns the filtered profile.
   - `POST /api/auth/update-profile` saves preference updates to Firestore and seamlessly re-issues a refreshed HttpOnly JWT session cookie with the new claims.

5. **Protected Admin Management:**
   - `GET /api/admin/users`: Protected by server-side session check requiring role `'admin'`.
   - `POST /api/admin/update-user-role`: Updates a user's role directly in Firestore after verifying administrator authorization.

---

## Serverless Endpoints

| Endpoint                      | Method |     Access     | Description                                                                         |
| :---------------------------- | :----: | :------------: | :---------------------------------------------------------------------------------- |
| `/api/auth/google-login`      | `POST` |     Public     | Verifies Google token, syncs role in Firestore, sets HttpOnly cookie                |
| `/api/auth/me`                | `GET`  | Session Cookie | Validates session cookie and returns filtered client user                           |
| `/api/auth/update-profile`    | `POST` | Session Cookie | Updates profile/preferences in Firestore and re-issues updated HttpOnly JWT session |
| `/api/auth/logout`            | `POST` |     Public     | Clears HttpOnly session cookie                                                      |
| `/api/admin/users`            | `GET`  |   Admin Only   | Lists all registered users from Firestore                                           |
| `/api/admin/update-user-role` | `POST` |   Admin Only   | Modifies user roles in Firestore (`admin`, `editor`, `moderator`, `viewer`, `user`) |

---

## User Roles & Hierarchy

- **`admin`**: Full administrative access, role assignment, directory view.
- **`editor`**: Curation and editorial permissions for global library.
- **`moderator`**: Content review and moderation.
- **`viewer`**: Read-only preview permissions.
- **`user`**: Standard authenticated user.

---

_Part of [[MOC — Features]]_
