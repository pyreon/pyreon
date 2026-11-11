---
'@pyreon/dnd': minor
---

The custom drag preview is now built by a separate import, `dragPreview({ render, offset })`, so a draggable without one no longer ships pdnd's preview utilities: a one-draggable + one-droppable app drops from 7.87 to 7.35 KB gz.

Migration: `useDraggable({ preview: { render, offset } })` → `useDraggable({ preview: dragPreview({ render, offset }) })`. The options and behaviour are unchanged. Dev builds throw an error with this pointer if you pass the old object.
