---
"@pyreon/code": minor
---

`createEditor` now accepts an `ariaLabel` option. CodeMirror's content area is a `role="textbox"` but has no accessible name unless one is supplied — a screen reader otherwise announces just "edit text, multiline" with no indication it's a code editor. The editor now sets `aria-label` on its content DOM (via `EditorView.contentAttributes`), defaulting to `"Code editor"` and overridable (e.g. `ariaLabel: "TypeScript source"`). A consumer-supplied `contentAttributes` via `extensions` still wins (it's applied after). No behavior change beyond the added accessible name.
