---
'@pyreon/elements': minor
---

`<Overlay type="modal">` (via `useOverlay`) now traps focus — the WAI-ARIA dialog pattern, out of the box. On open, focus moves into the modal content (first focusable, falling back to the content container); while open, Tab / Shift+Tab cycle WITHIN the content instead of escaping to the inert background behind it; on close, focus restores to the opener (the existing behavior). All gated on `type === 'modal'` — non-modal overlays (dropdown / tooltip / popover) are unchanged (Tab moves through them naturally). SSR-safe (the trap registers only client-side; the focus-in is rAF-deferred and bails on the server).

Closes a real accessibility gap: a modal that doesn't trap focus lets keyboard and screen-reader users Tab straight out to the background, losing the dialog. No new API — existing `<Overlay type="modal">` / `useOverlay({ type: 'modal' })` consumers get it automatically.
