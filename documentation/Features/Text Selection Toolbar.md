# Text Selection Toolbar Feature

> Contextual popup menu offering actions for selected text.

---

## Capabilities

- Appears automatically above selected text in the [[PdfViewer]].
- Offers three contextual actions:
  - **Copy:** Copies the highlighted text to the clipboard.
  - **Translate:** Sends the selection to the right panel for immediate AI translation.
  - **Speak:** Reads the selected text aloud using the configured TTS engine.

---

## Implementation Details

- Tracks active selection changes using the browser's `selectionchange` event.
- Positioned absolutely above the selection midpoint.
- Disappears automatically when the selection is cleared.

---

## Relationships

- **Component:** [[PdfViewer]] (parent render container).

---

_Part of [[MOC — Features]]_
