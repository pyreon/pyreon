---
'@pyreon/rich-text': minor
---

`@pyreon/rich-text`: toolbar-completeness API + exhaustive docs & demo.

- `editor.isActive(name, attrs?)` — reactive toolbar primitive for active-state
  highlighting (`isActive('bold')`, `isActive('heading', { level: 2 })`).
- `editor.editable` — writable `Signal<boolean>` for a runtime read-only toggle.
- `editor.wordCount` computed; `editor.undo()` / `editor.redo()` / `editor.blur()`
  helpers alongside the existing `chain()` escape hatch.
- Exhaustive conceptual guide at `docs/rich-text` (editor API, toolbars,
  read-only, counts, two-way binding, extensions, a11y, collaboration via
  `@pyreon/sync`, SSR note) + a full-featured `fundamentals-playground` demo.
