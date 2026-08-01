# 📄 MOC — Pages

> The primary user-facing views of the Anuwad application.

---

## Application Routes & Pages

| Page                      | Route                   | Source File                | Purpose                                                       |
| ------------------------- | ----------------------- | -------------------------- | ------------------------------------------------------------- |
| [[Library Page]]          | `/`                     | `index.tsx`                | Landing experience, document upload, storage browsing          |
| [[Workspace Page]]        | `/doc/$id`              | `doc.$id.tsx`              | Main split-panel reader, AI translation, TTS playback         |
| [[General Settings Page]] | `/settings`             | `settings.tsx`             | AI pipeline config, output language, voice cache, API & model |
| Appearance Settings       | `/settings/appearance`  | `settings_.appearance.tsx` | Visual theme and display preferences                          |

---

## Layout & Architecture

All pages (except the Workspace) are wrapped in the shared navigation shell:

- [[SidebarLayout]] — persistent navigation sidebar (Library, Settings) and mobile drawer.

```mermaid
graph TD
    App[Root Layout] --> SL[SidebarLayout]
    SL --> Library[Library Page]
    SL --> GenSet[General Settings Page]
    SL --> Appearance[Appearance Settings]
    App --> Workspace[Workspace Page]
```

---

## Related MOCs

- [[MOC — Features]] — Features embedded within these pages
- [[MOC — Components]] — Specific UI components rendering these pages
- [[MOC — User Flows]] — User journeys connecting these pages

---

_Part of [[00 — MOC — Project]]_
