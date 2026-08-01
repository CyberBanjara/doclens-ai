# Memory Diagnostics Feature

> Real-time client-side resource monitoring system.

---

## Capabilities

- Monitors resource usage to prevent browser crashes during long reading sessions.
- Visualizes allocation sizes for memory-heavy resources.
- Provides a cache clear option to free up storage space.

---

## Monitored Resources

- **JS Heap:** Dynamic memory usage of the JavaScript runtime.
- **Canvas Buffers:** Memory occupied by active PDF canvases.
- **Data URL Images:** Memory occupied by base64 page thumbnails.
- **DOM Nodes:** Total active elements in the document tree.
- **LocalStorage:** Total size of saved settings keys.

---

## UI Component

- **Diagnostics Panel:** Located on the [[General Settings Page]]. Updates every 3 seconds and can be paused or refreshed manually.

---

## Relationships

- **Page:** [[General Settings Page]].

---

_Part of [[MOC — Features]]_
