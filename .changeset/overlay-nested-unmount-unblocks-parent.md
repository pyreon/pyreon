---
'@pyreon/elements': patch
---

A nested `<Overlay>` / `useOverlay` that unmounts while open now releases the block it holds on its parent overlay. Before, the parent stayed blocked and never closed on outside click or Escape again. Each overlay also holds at most one block on its parent, so showing it twice no longer double-counts and hiding one that never opened no longer releases another child's block.
