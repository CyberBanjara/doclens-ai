# Document Management Feature

> Handles the storage lifecycle of documents and their metadata.

---

## Capabilities

- **Ingestion:** Validates files and saves PDF binary data.
- **Metadata Extraction:** Extracts and saves basic document info (filename, size, hash, page count).
- **Thumbnail Generation:** Dynamically generates page thumbnails.
- **Deletion:** Safely deletes documents and their cached AI results.

---

## Storage Architecture

All document files are stored locally in the browser using [[IndexedDB Storage]] (`doclens` database). The relevant object stores are:

- `blobs` → Raw PDF binary data.
- `documents` → File metadata (`DocRecord`: filename, page count, timestamps).
- `thumbnails` → Generated first-page thumbnail images.
- `pageData` → Per-page extracted text + AI results (deleted alongside the document).

---

## Relationships

- **Pages:** Integrated on the [[Library Page]].
- **Storage integration:** [[IndexedDB Storage]].

---

_Part of [[MOC — Features]]_
