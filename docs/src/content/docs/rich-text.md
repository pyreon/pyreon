---
title: Rich Text
description: Reactive WYSIWYG editor for Pyreon — a thin signal-backed layer over TipTap (ProseMirror). Signal document, toolbar primitives, two-way binding, and collaboration via @pyreon/sync.
---

`@pyreon/rich-text` is a reactive WYSIWYG editor built as a thin signal-backed layer over [TipTap](https://tiptap.dev) — the MIT, framework-agnostic headless editor framework built on [ProseMirror](https://prosemirror.net). It's the same adapter shape Pyreon uses for [`@pyreon/code`](/docs/code) (CodeMirror) and [`@pyreon/charts`](/docs/charts) (ECharts): wrap a best-in-class headless engine in Pyreon's fine-grained reactivity. The document is a `Signal<JSONContent>`, so the editor composes with the rest of your reactive app like any other signal.

<PackageBadge name="@pyreon/rich-text" href="/docs/rich-text" />

```tsx
import { createRichTextEditor, RichText } from '@pyreon/rich-text'

const editor = createRichTextEditor({ content: '<p>Hello <strong>world</strong></p>' })

editor.json()                       // reactive ProseMirror document
editor.text()                       // reactive plain text
editor.chain()?.toggleBold().run()  // run a command

<RichText instance={editor} style="min-height: 12rem" />
```

## Installation

:::code-group

```bash [npm]
npm install @pyreon/rich-text
```

```bash [bun]
bun add @pyreon/rich-text
```

```bash [pnpm]
pnpm add @pyreon/rich-text
```

```bash [yarn]
yarn add @pyreon/rich-text
```

:::

:::warning[Peer dependencies]
`@pyreon/rich-text` declares `@pyreon/core`, `@pyreon/reactivity`, **and `@pyreon/runtime-dom`** as peer dependencies. `<RichText>` emits compiled `_tpl()` / `_bind()` calls, which need the DOM runtime — declare all three in your app's dependencies or the editor won't mount.
:::

The TipTap engine (`@tiptap/core` + `@tiptap/starter-kit`) is **lazy-loaded on mount**, so `@tiptap/*` stays out of your initial bundle — the package's own footprint is ~1.1 KB gzipped. The editing engine downloads only when a `<RichText>` first renders.

## The editor instance

`createRichTextEditor(config?)` returns a framework-independent instance whose document state is exposed as signals. Create it once (e.g. at component setup), then mount it with `<RichText>`.

```tsx
const editor = createRichTextEditor({
  content: '<p>Initial content</p>',  // HTML string OR ProseMirror JSON
  editable: true,                     // false → read-only
  ariaLabel: 'Post body',             // accessible name for the textbox
  starterKit: true,                   // bold/italic/headings/lists/… (default)
  extensions: [],                     // extra TipTap extensions, appended
  autofocus: false,
  onChange: (json) => save(json),     // fires on every document change
  onError: (err) => report(err),      // mount failure → here, not an unhandled rejection
})
```

### Reactive state

| Accessor | Type | Description |
| --- | --- | --- |
| `editor.json` | `Signal<JSONContent>` | The ProseMirror document. **Writable** — `editor.json.set(next)` replaces the content (loop-safe). |
| `editor.html` | `Computed<string>` | Rendered HTML. |
| `editor.text` | `Computed<string>` | Plain-text content. |
| `editor.isEmpty` | `Computed<boolean>` | Whether the document has text — derived from the JSON, so accurate before mount. |
| `editor.characterCount` | `Computed<number>` | **Visible** character count — excludes `getText()`'s `\n\n` block separators; derived from the JSON, so it works before mount. |
| `editor.wordCount` | `Computed<number>` | Whitespace-delimited word count (derived from the JSON; works before mount). |
| `editor.canUndo` / `editor.canRedo` | `Computed<boolean>` | History availability — gate toolbar buttons on these. |
| `editor.focused` | `Signal<boolean>` | Focus state. |
| `editor.editable` | `Signal<boolean>` | **Writable** read-only toggle (see below). |
| `editor.view` | `Signal<Editor \| null>` | The underlying TipTap `Editor`, or `null` until mounted. |

:::warning[`editor.json` is a writable signal]
Read with `editor.json()` (reactive), write with `editor.json.set(next)`. Do **not** call `editor.json(newDoc)` — like any Pyreon signal, calling it with an argument reads and ignores it.
:::

### Methods

| Method | Description |
| --- | --- |
| `editor.isActive(name, attrs?)` | **Reactive** — whether a mark/node is active at the selection. The toolbar primitive (see below). |
| `editor.chain()` | The TipTap command chain (or `null` before mount). The escape hatch for every command. |
| `editor.undo()` / `editor.redo()` | History helpers. |
| `editor.focus()` / `editor.blur()` | Imperative focus control. |
| `editor.dispose()` | Tear down the editor + its DOM. Call from `onCleanup` / `onUnmount`. |

## The `<RichText>` component

`<RichText>` mounts an editor instance into a container `<div>`, lazy-loading TipTap on first render.

```tsx
<RichText instance={editor} class="prose" style="min-height: 12rem" />
```

:::note[Lifecycle is user-owned]
Like `@pyreon/code`, the editor instance is **yours** — `<RichText>` does not auto-dispose it, so the same instance can be re-mounted. Call `editor.dispose()` in `onCleanup` when it won't be reused:

```tsx
import { onCleanup } from '@pyreon/reactivity'

const editor = createRichTextEditor({ content })
onCleanup(() => editor.dispose())
```

A re-mount restores the **current** document (edits made before `dispose()` are preserved, not reverted to the initial `content`), and calling `dispose()` while the editor is still mounting — e.g. a fast navigate-away during the lazy `@tiptap` load — is safe: the in-flight mount is aborted and no editor leaks. A mount that fails (a broken extension set, a throwing extension, a failed import) routes the error to `onError` instead of surfacing only as an unhandled promise rejection.
:::

## Commands

Everything the editor can do runs through the TipTap command chain. `editor.chain()` returns `null` before mount, so use optional chaining:

```tsx
editor.chain()?.toggleBold().run()
editor.chain()?.toggleItalic().run()
editor.chain()?.toggleStrike().run()
editor.chain()?.toggleCode().run()
editor.chain()?.toggleHeading({ level: 2 }).run()
editor.chain()?.toggleBulletList().run()
editor.chain()?.toggleOrderedList().run()
editor.chain()?.toggleBlockquote().run()
editor.chain()?.toggleCodeBlock().run()
editor.chain()?.setHorizontalRule().run()
editor.chain()?.clearContent().run()
editor.chain()?.setContent('<p>New</p>').run()
editor.chain()?.selectAll().run()
```

`undo` / `redo` / `focus` / `blur` have dedicated helpers (`editor.undo()`, …) so the common cases read cleanly.

## Building a toolbar

`editor.isActive(name, attrs?)` is the reactive primitive for active-state highlighting. Pair it with `editor.chain()` for commands and `editor.canUndo()` / `editor.canRedo()` for history buttons.

```tsx
function Toolbar({ editor }: { editor: RichTextEditor }) {
  return (
    <div class="toolbar">
      <button
        type="button"
        class={() => (editor.isActive('bold') ? 'active' : '')}
        onClick={() => editor.chain()?.toggleBold().run()}
      >
        Bold
      </button>

      <button
        type="button"
        class={() => (editor.isActive('heading', { level: 2 }) ? 'active' : '')}
        onClick={() => editor.chain()?.toggleHeading({ level: 2 }).run()}
      >
        H2
      </button>

      <button type="button" disabled={() => !editor.canUndo()} onClick={() => editor.undo()}>
        Undo
      </button>
      <button type="button" disabled={() => !editor.canRedo()} onClick={() => editor.redo()}>
        Redo
      </button>
    </div>
  )
}
```

:::warning[Call `isActive` inside a reactive scope]
`isActive` re-derives on every edit and selection move, but only when **read inside a reactive scope**. Use `class={() => editor.isActive('bold') ? 'active' : ''}` (a thunk), not `class={editor.isActive('bold') ? …}` at component-body top level — the latter captures the value once and the highlight never updates.
:::

## Read-only toggle

`editor.editable` is a writable signal — flip it to switch the live editor between editable and read-only at runtime.

```tsx
editor.editable.set(false)   // read-only
editor.editable.set(true)    // editable again
editor.editable()            // reactive boolean — label a toggle button

<button onClick={() => editor.editable.set(!editor.editable())}>
  {() => (editor.editable() ? 'Lock' : 'Unlock')}
</button>
```

Pass `editable: false` to `createRichTextEditor` to start read-only.

## Character & word count

`characterCount` and `wordCount` are computed signals derived from the document JSON — no extra extension required:

```tsx
<span>{() => `${editor.wordCount()} words · ${editor.characterCount()} characters`}</span>
```

Because they read the **document** (not the mounted engine), they have three useful properties:

- **They work before mount.** A stored-ProseMirror-JSON draft reports its real character/word count and an accurate `isEmpty` without ever loading the (lazy) editor — perfect for a draft list where you never mount an editor per row. (An HTML _string_ needs the ProseMirror parser, so its counts populate on mount.)
- **`characterCount` counts visible characters.** Two paragraphs of `aaa` and `bbb` are **6** characters, not the 8 `getText()` reports (it inserts a `\n\n` between blocks).
- **They're selection-immune.** Moving the cursor never re-runs a count (or any content computed) — only `isActive` tracks the selection. A live word counter in your toolbar doesn't re-fire on every arrow-key.

:::note[Schema-less by design]
The counts walk the ProseMirror JSON directly (StarterKit-accurate). A custom node whose _rendered_ text differs from its concatenated text descendants may count differently than its live `getText()` — the 99% (StarterKit) case is exact.
:::

## Two-way binding

`bindRichTextToSignal` mirrors an external `Signal` to the editor's content with built-in loop prevention — the editor analog of `@pyreon/code`'s `bindEditorToSignal`.

```tsx
import { bindRichTextToSignal, type JSONContent } from '@pyreon/rich-text'
import { signal, onCleanup } from '@pyreon/reactivity'

const draft = signal<JSONContent>(editor.json())
const binding = bindRichTextToSignal({ editor, signal: draft })
onCleanup(() => binding.dispose())

// Editor edits flow into `draft`; `draft.set(doc)` flows into the editor.
```

Bind an HTML string instead of JSON with `format: 'html'`:

```tsx
const html = signal('<p>hello</p>')
bindRichTextToSignal({ editor, signal: html, format: 'html' })
```

:::note[Loop prevention]
Internal flags break the echo loop and a value compare short-circuits no-op writes. Use `bindRichTextToSignal` rather than hand-wiring `effect`s in both directions — that's the #1 source of feedback-loop bugs.
:::

## Extensions

`starterKit: true` (the default) bundles the common nodes and marks (paragraph, headings, bold, italic, strike, code, lists, blockquote, code block, horizontal rule, hard break, and history). Append any TipTap extension via `extensions`, or set `starterKit: false` to compose the schema yourself:

```tsx
import Placeholder from '@tiptap/extension-placeholder'

const editor = createRichTextEditor({
  extensions: [Placeholder.configure({ placeholder: 'Write something…' })],
})
```

## Accessibility

The content area is rendered as a `role="textbox"` `aria-multiline="true"` region. **Always supply `ariaLabel`** (defaults to `"Rich text editor"`) so screen readers announce a name:

```tsx
createRichTextEditor({ ariaLabel: 'Comment body' })
```

## Collaboration with `@pyreon/sync`

Real-time collaboration composes with [`@pyreon/sync`](/docs/sync) rather than a paid cloud. A TipTap [`Collaboration`](https://tiptap.dev/docs/editor/extensions/functionality/collaboration) extension binds the editor to a Yjs `XmlFragment`; `@pyreon/sync` owns the document and the transport. Because a synced value is just a signal, a remote edit becomes one fine-grained DOM update — the same surgical path local edits ride.

```tsx
import { createRichTextEditor } from '@pyreon/rich-text'
import { createYjsDoc, connectViaWebSocket } from '@pyreon/sync/yjs'
import StarterKit from '@tiptap/starter-kit'
import Collaboration from '@tiptap/extension-collaboration'

// One shared CRDT document (reuse @pyreon/sync's transports + persistence).
const doc = createYjsDoc()
connectViaWebSocket(doc, 'wss://your-relay.example/room-42')

const editor = createRichTextEditor({
  starterKit: false, // history is provided by Yjs — disable StarterKit's
  extensions: [
    StarterKit.configure({ undoRedo: false }),
    Collaboration.configure({ document: doc.yDoc, field: 'body' }),
  ],
})

<RichText instance={editor} />
```

:::warning[Disable the editor's own history under collaboration]
Yjs provides collaborative undo/redo, so the editor's local history must be turned off (`StarterKit.configure({ undoRedo: false })`) or the two fight. Likewise, **don't pass `content`** to a collaborative editor — the document seeds from the shared Yjs doc.
:::

Add live cursors with `@pyreon/sync`'s `syncedAwareness` + TipTap's `CollaborationCursor` extension; reuse `persistViaIndexedDB` for offline-first and `connectViaBroadcastChannel` for cross-tab. See the [Sync guide](/docs/sync) for the transport + presence details.

:::note[Collaboration deps]
`@tiptap/extension-collaboration` (and `CollaborationCursor`) plus `y-prosemirror` are opt-in peers you add when you want collaboration — they're not pulled in by the base package, so a non-collaborative editor pays nothing for them.
:::

## Server-side rendering

The base package targets the browser (TipTap/ProseMirror need a real DOM). For SSR pages, render the editor on the client — mount it in `onMount`, or render your content as plain HTML server-side and hydrate the editor over it. DOM-free server rendering of rich content (via `@tiptap/static-renderer`) is a tracked follow-up; until it lands, treat the editor as client-mounted.

## Bundle & lazy-loading

The package's own wrapper code is ~1.5 KB gzipped — TipTap is externalized and dynamically imported on mount. Nothing of `@tiptap/*` ships in your initial bundle until a `<RichText>` renders, mirroring how `@pyreon/charts` defers ECharts and `@pyreon/code` defers CodeMirror grammars.

### Wrapper overhead vs `@tiptap/react`

`@pyreon/rich-text` and [`@tiptap/react`](https://tiptap.dev) both wrap the **same** TipTap/ProseMirror engine, so the fair comparison measures the _wrapper_, not ProseMirror (`bun scripts/bench/rich-text.ts`, esbuild + gzip -9, `NODE_ENV=production`):

| Measured (gzipped) | `@pyreon/rich-text` | `@tiptap/react` |
| --- | --- | --- |
| **Wrapper glue** (engine + framework externalized) | **1.5 KB** | 8.5 KB |
| **Initial entry chunk** (before the editor loads) | **1.5 KB** (engine is a lazy chunk) | 88.9 KB (engine eagerly imported) |

The wrapper glue is ~5.7× smaller. The larger gap on the initial chunk is because `@pyreon/rich-text` lazy-imports the engine _by default_ (a dynamic `import()` in the mount path), whereas `@tiptap/react`'s `EditorContent` statically imports `@tiptap/core` — so the engine lands in the initial bundle unless you manually code-split it with `React.lazy` + `Suspense`.

This is a **bundle** measurement (Rung R1, measured in-repo). Typing-latency and mount-time — the other wrapper-overhead axes — need a real-browser + React harness and are **not** measured here; a noisy latency bench is worse than none, so they're deferred rather than estimated.

## License

MIT. TipTap (`@tiptap/core`, `@tiptap/starter-kit`, `@tiptap/pm`) and ProseMirror are MIT throughout. The TipTap **Pro** modules (Cloud, Comments, Content AI, document-conversion) are paid/commercially-licensed and are **not** used.

## API reference

See the generated [`@pyreon/rich-text` API reference](/docs/reference/rich-text) for the full typed surface.
