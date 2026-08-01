# Upload and Manage Documents

> How users get PDF documents into Anuwad and manage their library.

---

## Upload Methods

### 1. Dropzone (Main)

- Located on the [[Library Page]], a large `h-56` dashed-border area
- Supports **drag-and-drop** and **click-to-browse**
- Component: [[Dropzone]]

### 2. Sidebar Button

- "+ New Document" button in the [[SidebarLayout]]
- Available from any page using the sidebar (Library, Settings, Voice Settings)
- Triggers the native file picker

---

## Validation Rules

| Rule                 | Behavior                                    |
| -------------------- | ------------------------------------------- |
| File type ≠ PDF      | Toast error: "Only PDF files are supported" |
| File size > 50 MB    | Toast error: rejected                       |
| File size 25–50 MB   | Toast warning, accepted                     |
| Empty file (0 bytes) | Toast error: rejected                       |

---

## Post-Upload Flow

1. Document binary stored in [[IndexedDB Storage]]
2. Metadata recorded: filename, page count, file size, hash
3. Auto-navigate to [[Workspace Page]] at `/doc/$id`
4. Document appears as a [[DocumentCard]] in the library grid

---

## Document Management

### Browsing

- Documents shown in a responsive grid: 1 → 2 → 3 → 4 columns
- Each card shows: thumbnail, filename, page count, file size, status badges
- Component: [[DocumentCard]]

### Deletion

- Hover on card → click delete icon (⋮)
- Confirmation dialog: "This will permanently delete **{filename}** and all its AI results."
- On confirm: removed from [[IndexedDB Storage]], grid updates, success toast

### Session Continuity

- On cold launch, the app checks for the last-opened document ID
- If found, auto-redirects to that document's [[Workspace Page]]
- Subsequent "/" visits always show the Library

---

## Related

- [[Library Page]] — Where this flow lives
- [[Dropzone]] — Upload component
- [[DocumentCard]] — Card component
- [[Document Management]] — Feature detail
- [[First Time Setup]] — Prerequisite flow
- [[PDF to Translation Workflow]] — Next step after upload

---

_Part of [[MOC — User Flows]]_
