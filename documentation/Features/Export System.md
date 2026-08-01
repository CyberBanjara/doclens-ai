# Export System Feature

> Handles data extraction and exporting in the workspace.

---

## Capabilities

- Exports document data in two formats:
  - **Markdown (.md):** Clean text files listing page numbers, original text, and AI translation results.
  - **JSON (.json):** Detailed structured payloads containing translation settings, token counts, and page data.

---

## Workflow Details

1. Users click the export dropdown in the [[RightPanel]] header.
2. The export utility retrieves all document pages and AI results from [[IndexedDB Storage]].
3. The utility compiles the data into the selected format.
4. Generates a temporary object URL and triggers a browser download.

---

## Relationships

- **Component:** [[RightPanel]].

---

_Part of [[MOC — Features]]_
