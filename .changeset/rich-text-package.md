---
'@pyreon/rich-text': minor
---

Add `@pyreon/rich-text` — a reactive WYSIWYG rich-text editor built as a thin
signal-backed layer over TipTap (MIT, framework-agnostic, ProseMirror-based),
the same adapter shape as `@pyreon/code` (CodeMirror) and `@pyreon/charts`
(ECharts).

- `createRichTextEditor(config?)` — reactive instance; `editor.json` is a
  writable `Signal<JSONContent>`, with computed `html` / `text` / `isEmpty` /
  `characterCount` / `canUndo` / `canRedo`.
- `<RichText instance={editor} />` — mount component; lazy-loads `@tiptap/*` on
  first render so the engine stays out of the initial bundle. The content area
  is a labeled `role="textbox"` multiline region (configurable `ariaLabel`).
- `bindRichTextToSignal({ editor, signal, format })` — two-way binding (`json`
  or `html`) with built-in loop prevention, mirroring
  `@pyreon/code`'s `bindEditorToSignal`.

MIT throughout (TipTap + ProseMirror). Real-time collaboration composes with
`@pyreon/sync` (bind to the same `Y.Doc` XML fragment) — no paid cloud.
