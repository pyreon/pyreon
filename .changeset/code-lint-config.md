---
'@pyreon/code': minor
---

feat(code): honor the `lint` config flag + drop the dead duplicate `indentGuides` field.

- `EditorConfig.lint` (documented "Enable lint/diagnostics", default false) was declared but never read — `lintKeymap` was added unconditionally and there was no lint gutter. Now `lint: true` installs `lintGutter()` so diagnostics set via `setDiagnostics()` render gutter markers, and the lint navigation keymap is gated on the same flag. (The diagnostic underlines already self-install through `cmSetDiagnostics` regardless; the flag controls the gutter affordance + keymap.)
- `EditorConfig.indentGuides` was a dead duplicate of `highlightIndentGuides` (the implemented field, which draws guides via a theme) — never destructured, never read. Removed so the type stops promising a no-op. Use `highlightIndentGuides`.
