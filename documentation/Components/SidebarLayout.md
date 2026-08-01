# SidebarLayout Component

> **File:** `src/components/SidebarLayout.tsx`  
> **Type:** React Layout Wrapper

---

## Purpose

Provides a persistent navigation shell for all pages except the workspace reader. It houses the application branding, navigation links, primary file picker trigger, and handles responsive layout changes for mobile devices.

---

## UI Structure & Elements

1. **Sidebar Column (`w-64` desktop):**
   - **Branded Header:** Shows the Anuwad logo image and wordmark. Links back to the index route.
   - **Navigation Links:** Vertically stacked list of links with emoji icons — Library, Global Library, Appearance, General Settings (`NAV_ITEMS` in `SidebarLayout.tsx`).
   - **Upload Button / Support / Profile:** `+ New Document` trigger (hidden file input), a Support modal trigger, and `ProfileDropdown` for sign-in/out.
2. **Mobile (below the `useIsMobile` breakpoint):**
   - A slim `h-12` top header (page title + `ProfileDropdown`, no hamburger/drawer) plus a **persistent bottom `MobileTabBar`** (`src/components/mobile/MobileTabBar.tsx`) for primary navigation.
   - A floating circular "+" FAB (bottom-right, above the tab bar) opens the file picker for uploading a new document.
   - There is no slide-out drawer — the old hamburger/drawer pattern was replaced by this bottom-tab layout in the mobile redesign.

---

## State & Props

- **`children` (ReactNode):** Inner content rendered in the layout container.
- **`pageTitle` (string):** Title shown in the mobile top bar.
- **`topBarRight` (ReactNode, optional):** Extra content for the right side of the top bar.
- **`onNewDocument` ((file: File) => void, optional):** Callback fired when a file is picked via the upload button/FAB.

---

## Relationships

- **Used By:** [[Library Page]], [[General Settings Page]], [[Voice Settings Page]].
- **Feature powered:** [[Document Management]].

---

_Part of [[MOC — Components]]_
