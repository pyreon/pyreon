# @pyreon/rich-text

Reactive WYSIWYG rich-text editor for Pyreon — a thin, signal-backed layer over
[TipTap](https://tiptap.dev) (the MIT, framework-agnostic headless editor
framework built on [ProseMirror](https://prosemirror.net)). Same adapter shape
as `@pyreon/code` (CodeMirror) and `@pyreon/charts` (ECharts): a best-in-class
engine, wrapped in Pyreon's fine-grained reactivity.

- **Signal-backed document** — `editor.json` is a writable `Signal<JSONContent>`;
  `html` / `text` / `isEmpty` / `characterCount` / `wordCount` / `canUndo` /
  `canRedo` are computed signals; `editable` is a writable read-only toggle.
  `characterCount` / `wordCount` / `isEmpty` derive from the document JSON, so
  they report accurately **before the engine mounts** (stored-JSON draft lists),
  count visible characters, and — like every content computed — never re-run on
  a pure cursor move (only `isActive` tracks the selection).
- **Toolbar-ready** — `editor.isActive('bold')` is a reactive accessor for
  active-state highlighting; commands run through `editor.chain()` plus
  `undo` / `redo` / `focus` / `blur` helpers.
- **Lazy engine** — `@tiptap/*` is dynamically imported on mount, so it stays
  out of the initial bundle (a ~1.5 KB gz wrapper; the engine is a lazy chunk).
  A re-mount keeps the current document, disposing mid-load is leak-safe, and a
  mount failure routes to `onError`.
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

### Toolbar

```tsx
// Command + reactive active-state (call isActive inside a reactive scope):
<button
  type="button"
  class={() => (editor.isActive('bold') ? 'active' : '')}
  onClick={() => editor.chain()?.toggleBold().run()}
>
  Bold
</button>

<button disabled={() => !editor.canUndo()} onClick={() => editor.undo()}>Undo</button>

// Runtime read-only toggle:
editor.editable.set(false)   // read-only
editor.editable()            // reactive boolean
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

## Multiplatform — `@pyreon/rich-text/webview`

`@pyreon/rich-text` is web-only (it wraps TipTap/ProseMirror, which can't compile to SwiftUI/Compose). To ship the editor on iOS/Android too, host the real engine inside a native `<WebView>` — the sanctioned Pyreon multiplatform mechanism, with a bidirectional data bridge.

TipTap is modular ESM with app-chosen extensions (no single UMD like ECharts), so — exactly like `buildChartHostHtml({ echartsScript })` — the app bundles its own `@tiptap/*` and exposes it as a `window.TT` factory the host drives:

```ts
// window.TT = { createEditor(el, { content, editable, onUpdate }) => { setContent, setEditable, destroy } }
// — a ~10-line factory wrapping `new Editor({ element: el, extensions, content, editable,
//   onUpdate: ({ editor }) => onUpdate(editor.getJSON()) })`.
import { buildRichTextHostHtml } from '@pyreon/rich-text/webview'

// Inline your bundled TipTap for an offline, App-Store-safe page; or `tiptapSrc` an asset.
const RICHTEXT_HOST = buildRichTextHostHtml({ tiptapScript: BUNDLED_TT })
```

Use it with the `<WebView>` primitive (compiles to WKWebView / Android WebView / an `<iframe srcdoc>` on web — same bridge everywhere):

```tsx
import { WebView } from '@pyreon/primitives'

<WebView
  html={RICHTEXT_HOST}
  data={{ content: doc(), editable: !locked() }}
  onMessage={(m) => doc.set(JSON.parse(m).content)}   // reverse: user edits post back
/>
```

- **Forward** — `data={{ content, editable? }}` → `window.__pyreonData` + a `pyreondata` event → the document/editability update in place (no reload). `content` is TipTap JSON or HTML.
- **Reverse** — a user edit → `window.pyreonPostMessage(JSON {content})` → your `onMessage` (loop-guarded against the echo of content you pushed).
- **`<RichTextWebView state onChange>`** is the web-side ergonomic wrapper (builds the host + emits `<WebView>` for you); on native, use `<WebView html={RICHTEXT_HOST} …>` directly (the component body can't be PMTC-lowered — the host string + `<WebView>` can).

Proven end-to-end against REAL TipTap in `src/webview.browser.test.tsx`. See `examples/native-viz` for a one-source app hosting this editor across web/iOS/Android.

## License

MIT. TipTap (`@tiptap/core`, `@tiptap/starter-kit`, `@tiptap/pm`) and
ProseMirror are MIT. The TipTap Pro modules (Cloud, Comments, Content AI,
document-conversion) are paid/commercially-licensed and are **not** used.
