---
"@pyreon/code": minor
---

Fix two browser-only bugs, add real ruby/shell grammars, and an objective bundle-size benchmark.

- **fix: `editor.foldAll()` / `unfoldAll()` crashed in the browser** — they used `require('@codemirror/language')`, which throws `require is not defined` in this ESM (`type: module`) package. Now statically imported. (Invisible to node/happy-dom tests; the no-view unit path never reached the `require`.)
- **fix: the minimap always rendered a light background** — dark-mode detection read a `cm-dark` DOM class that CodeMirror 6 never adds (it uses hashed style-mod classes). Now reads `view.state.facet(EditorView.darkTheme)`, and repaints on a theme swap.
- **feat: `ruby` and `shell` now ship real grammars** via `@codemirror/legacy-modes` (a new optionalDependency). Previously both resolved to an empty extension (plain text) despite being advertised — 19 of the 20 language identifiers now highlight; only `plain` is intentionally empty.
- **docs: corrected bundle-size claims with measured numbers** — the core editor is ~138 KB gzipped (~416 KB minified), at parity with `@uiw/react-codemirror`, and ~7x smaller than Monaco's ~940 KB gz core. Added a reproducible `bun run --filter=@pyreon/code bench`.
- **docs: fixed several README/manifest inaccuracies** — the `<TabbedEditor>` example (takes `instance`, not `tabs`/`label`), the `useEditorSignal` description, the `onParseError` signature, and a non-existent `keybindings` config field.
