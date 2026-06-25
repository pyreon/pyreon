# @pyreon/rich-text

Reactive WYSIWYG rich-text editor for Pyreon — a thin, signal-backed layer over
[TipTap](https://tiptap.dev) (the MIT, framework-agnostic headless editor
framework built on [ProseMirror](https://prosemirror.net)). Same adapter shape
as `@pyreon/code` (CodeMirror) and `@pyreon/charts` (ECharts): a best-in-class
engine, wrapped in Pyreon's fine-grained reactivity.

- **Signal-backed document** — `editor.json` is a writable `Signal<JSONContent>`;
  `html` / `text` / `isEmpty` / `characterCount` / `canUndo` / `canRedo` are
  computed signals.
- **Lazy engine** — `@tiptap/*` is dynamically imported on mount, so it stays
  out of the initial bundle.
- **Accessible** — the content area is a labeled `role="textbox"` multiline
  region.
- **MIT throughout** — TipTap + ProseMirror are MIT; collaboration composes
  with `@pyreon/sync` (no paid cloud).

## Install

```sh
bun add @pyreon/rich-text
# peer: @pyreon/runtime-dom (the <RichText> JSX emits _tpl()/_bind())
```

## Usage

```tsx
import { createRichTextEditor, RichText, bindRichTextToSignal } from '@pyreon/rich-text'
import { signal } from '@pyreon/reactivity'

const editor = createRichTextEditor({
  content: '<p>Hello <strong>world</strong></p>',
  ariaLabel: 'Post body',
  onChange: (json) => console.log('user edit:', json),
})

// editor.json is a writable Signal<JSONContent>
editor.json()              // reactive read — tracks in effects/JSX
editor.json.set(draft)     // replace content (loop-safe)
editor.text()              // computed plain text
editor.characterCount()    // computed number
editor.canUndo()           // computed boolean

// Run a TipTap command:
editor.chain()?.toggleBold().run()

// Mount (lazy-loads TipTap):
<RichText instance={editor} style="min-height: 12rem" />

// Tear down (user-owned lifecycle):
// onCleanup(() => editor.dispose())
```

### Two-way binding

```ts
const draft = signal(editor.json())
const binding = bindRichTextToSignal({ editor, signal: draft })
// HTML form instead: bindRichTextToSignal({ editor, signal: htmlStr, format: 'html' })
// onCleanup(() => binding.dispose())
```

`bindRichTextToSignal` is the editor mirror of `@pyreon/code`'s
`bindEditorToSignal` — internal flags break the echo loop, and a value
compare short-circuits no-op writes.

## Collaboration (with `@pyreon/sync`)

Real-time collaboration composes with `@pyreon/sync` rather than a paid cloud:
bind the editor to the same `Y.Doc` XML fragment via TipTap's collaboration
extension, and reuse `@pyreon/sync` transports + `syncedAwareness` for live
cursors. See `docs/` for the full pattern.

## License

MIT. TipTap (`@tiptap/core`, `@tiptap/starter-kit`, `@tiptap/pm`) and
ProseMirror are MIT. The TipTap Pro modules (Cloud, Comments, Content AI,
document-conversion) are paid/commercially-licensed and are **not** used.
