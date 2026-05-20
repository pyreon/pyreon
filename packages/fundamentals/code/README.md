# @pyreon/code

Reactive code editor — CodeMirror 6 wrapped in Pyreon signals.

A drop-in code editor for in-app editors (markdown previews, query builders, schema fields, REPLs, configuration files). Built on CodeMirror 6 — about ~250KB total compared to ~2.5MB for Monaco. Every editor field (`value`, `cursor`, `selection`, `lineCount`, `focused`) is a Pyreon signal so the editor composes natively with `effect` / `computed` / `<Show>` without manual change-event plumbing. Ships a single-pane editor, a side-by-side diff editor, a tabbed multi-file editor, lazy-loaded language grammars for 20 languages, a canvas-based minimap, and a two-way signal binding helper with format-on-input loop protection.

## Install

```bash
bun add @pyreon/code @pyreon/core @pyreon/reactivity @pyreon/runtime-dom
# CodeMirror 6 packages are runtime dependencies, installed automatically
```

`@pyreon/runtime-dom` is required because `<CodeEditor>` JSX emits `_tpl()` calls.

## Quick start

```tsx
import { createEditor, CodeEditor } from '@pyreon/code'

const editor = createEditor({
  value: 'const x = 1',
  language: 'typescript',
  theme: 'dark',
  minimap: true,
  lineNumbers: true,
  foldGutter: true,
})

editor.value() // reactive read
editor.value.set('const x = 2') // writes propagate into CodeMirror

const App = () => <CodeEditor instance={editor} style="height: 400px" />
```

## `createEditor(config)` → `EditorInstance`

| Config field | Default | Notes |
|---|---|---|
| `value` | `''` | Initial content |
| `language` | `'plain'` | Lazy-loaded grammar |
| `theme` | `'light'` | `'light'` / `'dark'` / a CodeMirror Extension |
| `lineNumbers` | `true` | |
| `readOnly` | `false` | |
| `foldGutter` | `true` | |
| `bracketMatching` | `true` | |
| `autocomplete` | `true` | |
| `search` | `true` | Cmd/Ctrl+F |
| `lint` | `false` | Pass diagnostics via `setDiagnostics` |
| `vim` / `emacs` | `false` | Keybindings |
| `tabSize` | `2` | |
| `placeholder` | — | Hint text when empty |
| `keybindings` | — | Custom keymap |

`EditorInstance` shape:

| Member | Type |
|---|---|
| `value` | `Signal<string>` — two-way synced with the editor |
| `language` | `Signal<EditorLanguage>` |
| `theme` | `Signal<EditorTheme>` |
| `readOnly` | `Signal<boolean>` |
| `cursor` | `Computed<{ line, col }>` |
| `selection` | `Computed<{ from, to, text }>` |
| `lineCount` | `Computed<number>` |
| `focused` | `Signal<boolean>` |
| `view` | `Signal<EditorView \| null>` (raw CodeMirror, null until mounted) |
| `focus()` / `insert(text)` / `replaceSelection(text)` | imperative |
| `select(from, to)` / `selectAll()` / `goToLine(line)` | imperative |
| `undo()` / `redo()` / `foldAll()` / `unfoldAll()` | imperative |
| `dispose()` | manual cleanup (auto on unmount when used via `<CodeEditor>`) |

## Languages — 20 supported, lazy-loaded

```ts
import { loadLanguage, getAvailableLanguages } from '@pyreon/code'

getAvailableLanguages()
// ['javascript', 'typescript', 'jsx', 'tsx', 'html', 'css', 'json',
//  'markdown', 'python', 'rust', 'sql', 'xml', 'yaml', 'cpp', 'java',
//  'go', 'php', 'ruby', 'shell', 'plain']

await loadLanguage('typescript') // returns a CodeMirror Extension
```

Setting `editor.language.set('python')` triggers the load + grammar swap; mid-load the editor stays usable in the previous grammar.

## Components

### `<CodeEditor instance={editor} style="...">`

Single-pane editor mounting the `EditorInstance` view.

### `<DiffEditor>` — side-by-side diff

```tsx
;<DiffEditor
  original="const a = 1"
  modified="const a = 2"
  language="typescript"
  style="height: 300px"
/>
```

### `<TabbedEditor>` — multi-file editor

```tsx
import { TabbedEditor } from '@pyreon/code'

;<TabbedEditor
  tabs={[
    { id: 'main', label: 'main.ts', value: 'export {}', language: 'typescript' },
    { id: 'style', label: 'style.css', value: 'body {}', language: 'css' },
  ]}
  style="height: 500px"
/>
```

The exported `TabbedEditorInstance` (when accessed via lower-level APIs) exposes `editor`, `tabs: Signal<Tab[]>`, `activeTab: Computed<Tab | null>`, `activeTabId: Signal<string>`, plus `openTab` / `closeTab` / `switchTab` actions.

## Two-way binding to an external signal

`bindEditorToSignal` replaces the loop-prevention flag-pair boilerplate that recurs in every consumer trying to sync `editor.value` with their app state.

```ts
import { signal } from '@pyreon/reactivity'
import { bindEditorToSignal } from '@pyreon/code'

const code = signal('export const x = 1')

const { dispose } = bindEditorToSignal({
  editor,
  signal: code, // Signal<string> or any SignalLike<T>
  serialize: (v) => v, // T → string (default identity for string T)
  parse: (s) => s, // string → T (default identity)
  onParseError: (err, source) => console.warn('parse failed:', err),
})

// External writes flow into the editor; user edits flow back into `code`.
// Internal flag-pair breaks the format-on-input race; parse failures call
// `onParseError` and leave external state at its last valid value.

onUnmount(dispose)
```

Accepts a generic `T` — use `serialize` / `parse` to round-trip JSON, YAML, or any custom format. Both directions are loop-safe.

For the simple Pyreon-signal-only case, `useEditorSignal(signal)` is a one-line wrapper that returns a configured `EditorInstance`.

## Minimap

```ts
import { minimapExtension } from '@pyreon/code'

const editor = createEditor({
  language: 'typescript',
  // Pass via a custom extension:
  // minimap: true   — built-in shortcut
})
```

Or compose the extension directly into your own editor instance via `EditorView`. Canvas-based, click-to-scroll, viewport indicator, auto-hides when content fits in view.

## Themes

```ts
import { darkTheme, lightTheme, resolveTheme } from '@pyreon/code'

resolveTheme('dark') // darkTheme Extension
resolveTheme('light') // lightTheme Extension

createEditor({ theme: customCodeMirrorTheme }) // or pass a raw Extension
```

## Gotchas

- **`@pyreon/runtime-dom` is a required peer** — `<CodeEditor>` JSX emits `_tpl()` calls.
- **`editor.value.set(...)` mutates the CodeMirror document**; subscribing to `editor.value()` re-fires on every keystroke. For derived state, layer `computed`/`useDebouncedValue` on top instead of reading raw `value` on every effect tick.
- **`editor.view()` is `null` until the editor is mounted** — wait for `<CodeEditor>` to render before reaching for raw CodeMirror APIs, or use `effect(() => { if (editor.view()) { … } })`.
- **`bindEditorToSignal` requires `parse` for non-string T** — otherwise parse failures crash silently. Always supply `onParseError` if `parse` can throw.
- **Languages are lazy-loaded** — first switch to a new language triggers a chunk fetch. Pre-load via `await loadLanguage('typescript')` if you need synchronous availability.
- **`dispose()` on a `createEditor` instance is manual when NOT used via `<CodeEditor>`** — call it from `onUnmount` to release the CodeMirror view.
- **Reading `.peek()` of `editor.value` inside an effect** bypasses tracking deliberately — used by `bindEditorToSignal`'s loop guard. Annotate with the `pyreon/no-peek-in-tracked` suppression where you genuinely need a non-tracking read.

## Documentation

Full docs: [docs.pyreon.dev/docs/code](https://docs.pyreon.dev/docs/code) (or `docs/docs/code.md` in this repo).

## License

MIT
