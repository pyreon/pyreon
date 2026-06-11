---
'@pyreon/code': patch
---

`editor.insert(...)` / `editor.replaceSelection(...)` now emit a dev-mode warning instead of silently dropping the call when the editor view doesn't exist yet.

These are cursor-relative document mutations — they act on `view.state.selection`, so they require a live `EditorView`. The view is created by `mount()` _after_ an async grammar load, so calling them before the editor mounts (or on a cold-mounting editor whose view isn't ready) has no cursor to act on and the call was dropped with no signal — losing the text the caller meant to add.

The production behavior is unchanged (you genuinely cannot insert-at-cursor with no cursor), but a dev build now warns and points at the view-independent API: `editor.value.set(...)` feeds the value signal, which seeds the document whenever the view is created — the correct way to set content before/regardless of mount timing. Documented the cursor-relative contract in the code editor reference.
