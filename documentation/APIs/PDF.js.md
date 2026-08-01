# PDF.js

> **Category:** Open-Source Parsing Library  
> **Project Page:** [mozilla.github.io/pdf.js](https://mozilla.github.io/pdf.js/)

---

## Purpose

**PDF.js** is a PDF viewer library developed by Mozilla. Anuwad uses it to parse PDF files, extract text content, and render pages as high-resolution images in the UI.

---

## Integration Details

- **WASM worker thread:** Runs heavy text extraction and page parsing tasks inside worker threads to prevent main execution thread lag.
- **Canvas Rendering:** Draws PDF pages onto HTML5 canvas elements inside the [[PdfViewer]].
- **Text Layer Overlay:** Reconstructs the document's text layout as transparent text blocks overlaying the page canvas, enabling selection and copy operations.

---

## Core Operations

- **`getDocument()`:** Loads raw binary data from local storage and initializes the PDF document.
- **`getTextContent()`:** Extracts character strings and positioning coordinates from pages.
- **`render()`:** Draws page graphics onto canvas elements.

---

## Relationships

- **Component:** [[PdfViewer]].
- **Feature powered:** [[PDF Viewer]], [[Document Management]].
- **Pipeline:** [[PDF Extraction Pipeline]].

---

_Part of [[MOC — APIs]]_
