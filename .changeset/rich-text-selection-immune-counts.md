---
"@pyreon/rich-text": patch
---

Content computeds are now selection-immune, character/word counts are document-derived, and `characterCount` counts visible characters.

- **Selection moves no longer re-run content computeds.** The editor's single transaction counter was bumped by both content (`onUpdate`) and selection (`onSelectionUpdate`) events, so a pure cursor move re-ran every content computed (`text`/`html`/`characterCount`/`wordCount`/`canUndo`/`canRedo`) — a live word-counter effect re-fired on every arrow-key. The counter is now split (`docVersion` for content, `selectionVersion` for selection); content computeds subscribe to content only, while `isActive` still tracks the selection.
- **`characterCount`/`wordCount`/`isEmpty` derive from the document JSON**, so they report accurately before the (lazy) engine mounts — a stored-ProseMirror-JSON draft has a real count without loading an editor — and after dispose.
- **`characterCount` counts visible characters**, excluding the `\n\n` block separators `getText()` inserts between blocks (two paragraphs of `aaa`/`bbb` is 6, not 8).

No API changes. Pre-mount count/text/isEmpty semantics for stored-JSON content are the only behavior change (previously 0/""/true).
