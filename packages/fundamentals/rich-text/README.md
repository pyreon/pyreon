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

`@pyreon/rich-text` wraps TipTap/ProseMirror, a DOM editor that can't compile to SwiftUI/Compose. To ship the editor on iOS and Android too, `<RichTextWebView>` hosts the SAME TipTap inside a native `<WebView>` — one component, the same JSX on every target:

```tsx
import { RichTextWebView } from '@pyreon/rich-text/webview'

<RichTextWebView
  state={() => ({ content: doc(), editable: !locked() })}
  onChange={(json) => doc.set(json)}          // the document as TipTap JSON TEXT
  onError={(message) => failure.set(message)}
/>
```

On native the component lowers (through this package's `./native-plugin`) to a `<WebView src="pyreon-richtext-host.html">`. The page is **built for you**: `pyreon-native assets` bundles it from the TipTap installed in your app (StarterKit), using the `esbuild` or `rolldown` your app already has, and only when your source imports `@pyreon/rich-text`. On the web the same component loads the same page (`pyreon-native assets --target=web --out=public`), or hosts your own engine inline (`tiptapScript`) or a whole page you built (`html`).

- **The document crosses as TEXT in both directions.** `onChange` receives the TipTap JSON serialized to a string, and `state.content` accepts that string — or HTML — back. A native handler cannot hold a JSON object, so the string is the one shape identical on every target. `JSON.parse(text)` on web if you want the object. *(Changed from an object: `onChange` used to receive the parsed document.)*
- **Reverse** — a user edit → `window.pyreonPostMessage('c:' + json)` → `onChange`; a host failure → `'e:' + message` → `onError`. A pushed value is never echoed back as an edit.
- **It is a hosted web editor, not a native text view.** WebView startup cost, no native text-field semantics, StarterKit only (custom extensions need your own `html` page). Every other export of this package (`createRichTextEditor`, `RichText`, …) is a DOM API and warns by name on native.

Lower-level: `buildRichTextHostHtml({ tiptapScript })` builds a page by hand around your own `window.TT = { createEditor(el, opts) }` factory.

Proven against REAL TipTap in `src/webview.browser.test.tsx` (Chromium), the built page in `src/tests/native-plugin-host.test.ts`, and on an iOS simulator and Android emulator by `examples/native-tasks`.
