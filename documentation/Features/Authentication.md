# Authentication Feature

> Google Sign-In via Firebase Auth, plus a Firestore-backed review flow.
> **Source:** `src/lib/firebase.ts`, `src/context/AuthContext.tsx`, `src/components/ProfileDropdown.tsx`, `src/components/ReviewModal.tsx`

---

## Capabilities

- **Google Sign-In:** Popup-based OAuth via Firebase Auth (`signInWithPopup` + `GoogleAuthProvider`), configured to always show the account picker (`prompt: "select_account"`).
- **Session State:** Auth state is observed globally via `onAuthStateChanged`, exposed app-wide through `AuthContext`.
- **Leave a Review:** Signed-in users can submit a star rating + comment, written to a Firestore `reviews` collection.
- **Analytics:** Firebase Analytics logs page views (`logPageView()`), initialized only when `isSupported()` (guards against unsupported/SSR environments).

---

## Architecture

- `src/lib/firebase.ts` initializes the Firebase app (config from `VITE_FIREBASE_*` env vars) and exports `auth`, `googleProvider`, `db` (Firestore), `signInWithGoogle()`, `logOut()`, `submitReviewToFirestore()`, and `logPageView()`.
- `AuthContext` (`src/context/AuthContext.tsx`) wraps the app (mounted in `routes/__root.tsx`) and exposes `{ user, loading, signInWithGoogle, signOut }` via `useAuth()`. Sign-in/out both toast success or failure.
- `ProfileDropdown` (header/sidebar avatar popover) is the primary entry point: shows the user's photo/name when signed in, a "Sign in with Google" action when not, and opens `ReviewModal` for the review flow.
- `ReviewModal` collects a 1–5 star rating and optional comment, then calls `submitReviewToFirestore()`; requires the user to already be signed in.

---

## Relationships

- **Components:** [[ProfileDropdown]] *(doc not yet written)*, [[ReviewModal]] *(doc not yet written)*.
- **Used In:** `routes/__root.tsx` (global), [[SidebarLayout]].

---

_Part of [[MOC — Features]]_
