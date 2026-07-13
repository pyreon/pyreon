---
title: Code Editor
description: Reactive code editor for Pyreon — CodeMirror 6 with signal-backed state, minimap, diff editor, tabs, and lazy-loaded languages.
---

`@pyreon/code` is a reactive code editor built on [CodeMirror 6](https://codemirror.net). Every piece of editor state — content, language, theme, cursor, selection — is a Pyreon signal, so the editor composes with the rest of your reactive app the same way any other signal does. It ships a canvas-based minimap, a side-by-side diff editor, lazy-loaded language grammars, and a two-way signal binding helper. The core editor measures ~138 KB gzipped (~416 KB minified) — about 7x lighter than Monaco's ~940 KB gzipped core, with each language grammar streaming as a ~40 KB gzipped lazy chunk (reproduce: `bun run --filter=@pyreon/code bench`).

<PackageBadge name="@pyreon/code" href="/docs/code" />

## Installation

:::code-group

```bash [npm]
npm install @pyreon/code
```

```bash [bun]
bun add @pyreon/code
```

```bash [pnpm]
pnpm add @pyreon/code
```

```bash [yarn]
yarn add @pyreon/code
```

:::

:::warning[Peer dependencies]
`@pyreon/code` declares `@pyreon/core`, `@pyreon/reactivity`, **and `@pyreon/runtime-dom`** as peer dependencies. `<CodeEditor>` (and the other components) emit compiled `_tpl()` / `_bind()` calls, which need the DOM runtime — declare all three in your app's dependencies or the editor won't mount.
:::

The core editor (CodeMirror state, view, search, history, lint underlines, diff) ships as regular dependencies. The **language grammars** are `optionalDependencies` — pulled in on demand by [`loadLanguage`](#languages) — so a JSON-only editor never downloads the Rust or C++ grammar.

## Quick Start

```tsx
import { createEditor, CodeEditor } from '@pyreon/code'

const editor = createEditor({
  value: 'const greeting = "Hello, Pyreon!"',
  language: 'typescript',
  theme: 'dark',
})

<CodeEditor instance={editor} style="height: 400px" />
```

`createEditor` builds a framework-independent `EditorInstance`; the `<CodeEditor>` component mounts the CodeMirror view into a container `<div>` and cleans it up on unmount. The two are split so the instance (and all its signals) can live in a store, a parent component, or a hook — independent of when it's actually mounted.

## Signal-Backed State

Four pieces of editor state are **writable signals**, and three are **computed signals** derived from the live view:

```tsx
// Writable signals — read reactively, write to drive the editor
editor.value() // current content (string)
editor.language() // current language
editor.theme() // current theme
editor.readOnly() // read-only state
editor.focused() // has focus (read; the editor writes it on focus/blur)

// Computed signals — derived from the live view, read-only
editor.cursor() // { line: number, col: number }  (1-based)
editor.selection() // { from: number, to: number, text: string }
editor.lineCount() // number of lines

// The underlying view, null until mounted
editor.view() // EditorView | null
```

Writing a writable signal pushes the change into CodeMirror through a compartment, with no remount:

```tsx
editor.value.set('new content') // replaces the document
editor.language.set('python') // lazy-loads + swaps the grammar
editor.theme.set('dark') // reconfigures the theme extension
editor.readOnly.set(true) // toggles read-only
```

:::warning[`editor.value` is a signal — `.set()` to write]
`editor.value` is a `Signal<string>`. Read it with `editor.value()` (reactive — tracks in effects, computeds, and JSX) and write it with `editor.value.set(next)`. Do **not** call `editor.value(newText)` — like any Pyreon signal, calling it with an argument _reads_ and silently ignores the value. The dev build warns on this.
:::

Because everything is a signal, the editor drives the rest of your UI for free:

```tsx
function EditorWithStatus() {
  const editor = createEditor({ value: 'hello', language: 'markdown' })

  return (
    <>
      <CodeEditor instance={editor} style="height: 300px" />
      <footer>
        Line {() => editor.cursor().line}, Col {() => editor.cursor().col}
        {' · '}
        {() => editor.lineCount()} lines
        {() => (editor.selection().text ? ` · ${editor.selection().text.length} selected` : '')}
      </footer>
    </>
  )
}
```

## Configuration

`createEditor(config?)` accepts the full options set below. Every field is optional; the defaults below are the actual runtime defaults.

```tsx
const editor = createEditor({
  value: '', // initial content                       (default: '')
  language: 'plain', // syntax highlighting language          (default: 'plain')
  theme: 'light', // 'light' | 'dark' | Extension          (default: 'light')
  lineNumbers: true, // show the line-number gutter            (default: true)
  readOnly: false, // read-only mode                         (default: false)
  foldGutter: true, // code folding gutter                    (default: true)
  bracketMatching: true, // bracket matching + auto-close          (default: true)
  autocomplete: true, // completion popups                      (default: true)
  search: true, // find & replace keymap (Cmd/Ctrl+F)     (default: true)
  lint: false, // lint gutter + lint-nav keymap          (default: false)
  highlightIndentGuides: true, // indent guide lines                     (default: true)
  vim: false, // vim keybinding mode (optional dep)     (default: false)
  emacs: false, // emacs keybinding mode (optional dep)   (default: false)
  tabSize: 2, // indent width in spaces                 (default: 2)
  lineWrapping: false, // soft-wrap long lines                   (default: false)
  placeholder: 'Type here...', // placeholder shown when empty           (default: none)
  minimap: false, // canvas code-overview sidebar           (default: false)
  extensions: [], // extra raw CodeMirror extensions        (default: [])
  onChange: (value) => {}, // called on every content change         (default: none)
  onError: (err) => {}, // mount failure → here, not unhandled    (default: none)
})
```

A few options that behave non-obviously:

- **`tabSize`** sets both the indent width _and_ the spacing of the indent guides. The editor indents with spaces (`indentUnit` is `' '.repeat(tabSize)`).
- **`lint: true`** adds the lint gutter affordance and the lint-navigation keymap. Diagnostic underlines from [`setDiagnostics`](#diagnostics-lint-integration) render regardless of this flag — `lint` only controls the gutter + keymap.
- **`extensions`** is an escape hatch: any array of raw CodeMirror 6 `Extension`s is appended to the built-in set, so you can drop in any third-party CM extension.
- **`onError`** receives a mount failure (a throwing extension or a failed language-grammar import) instead of leaving it as an unhandled promise rejection. Disposing the editor while it is still mounting — a fast navigate-away during the async grammar load — is leak-safe (the in-flight mount is aborted).

:::note[`onChange` vs. the `value` signal]
`onChange` is called on every document change with the new text — handy for one-off side effects. But for most cases you don't need it: just read `editor.value()` reactively. The signal is the source of truth; `onChange` is a convenience hook layered on top of it.
:::

## Languages

20 language identifiers are supported. **19 ship a real grammar** (lazy-loaded as an optional dependency); only `plain` resolves to an empty extension (plain-text editing, no syntax highlighting). 17 come from the modern `@codemirror/lang-*` packages; `ruby` and `shell` come from `@codemirror/legacy-modes` (CodeMirror-5-era StreamLanguage grammars).

```text
javascript  typescript  jsx   tsx    html   css    json   markdown
python      rust        sql   xml    yaml   cpp    java   go      php
ruby        shell       plain*                       (* plain-text — no grammar)
```

Grammars are imported on demand — zero cost until used. Switching language at runtime lazy-loads the new grammar and hot-swaps it into the live view:

```tsx
editor.language.set('python') // loads @codemirror/lang-python, then swaps
```

You rarely call the language API directly (`createEditor({ language })` and `editor.language.set()` handle loading), but the lower-level helpers are exported:

```tsx
import { getAvailableLanguages, loadLanguage } from '@pyreon/code'

getAvailableLanguages() // EditorLanguage[] — all 20 identifiers

// Preload a grammar before mounting (e.g. to avoid a flash):
const ext = await loadLanguage('typescript') // returns the CodeMirror Extension
```

:::note[`loadLanguage` returns the extension]
`loadLanguage(lang)` resolves to the loaded CodeMirror `Extension` (cached after the first load), not `void`. If the optional grammar package isn't installed, it resolves to an empty extension `[]` rather than throwing — the editor degrades to plain-text editing.
:::

## Themes

Two built-in themes ship as exported extensions, plus a resolver:

```tsx
import { lightTheme, darkTheme, resolveTheme } from '@pyreon/code'

// Switch dynamically
editor.theme.set('dark') // 'light' | 'dark' string shorthands
editor.theme.set('light')

// Or pass any CodeMirror theme Extension as a custom theme
import { EditorView } from '@codemirror/view'
const myTheme = EditorView.theme({ '&': { backgroundColor: '#0d1117' } })
editor.theme.set(myTheme)
```

`EditorTheme` is `'light' | 'dark' | Extension`. `resolveTheme(theme)` maps the string shorthands to the built-in extensions and passes a custom `Extension` through unchanged — useful if you're assembling a raw CodeMirror state outside `createEditor`.

## Actions

The instance exposes imperative editor commands. Most operate on the live `EditorView`, so they no-op before the editor has mounted:

```tsx
editor.focus() // focus the editor
editor.insert('// comment') // insert text at the cursor
editor.replaceSelection('replacement') // replace the current selection
editor.select(0, 10) // select a character range
editor.selectAll() // select everything
editor.goToLine(42) // move cursor to a line + scroll + focus
editor.undo() // undo
editor.redo() // redo
editor.foldAll() // fold every foldable block
editor.unfoldAll() // unfold everything
editor.scrollTo(120) // scroll a character offset into view (centered)
```

:::warning[`insert` / `replaceSelection` need a mounted view]
`insert` and `replaceSelection` are **cursor-relative** — they act on `view.state.selection`. The CodeMirror view is created by the `<CodeEditor>` mount _after_ an async grammar load, so calling them before the editor mounts has no cursor to act on. The call is dropped (with a dev-mode warning) — and dropping an `insert` silently loses the text you meant to add. To set content independently of the view (before mount, or from a binding), use `editor.value.set(...)` — it feeds the value signal, which seeds the document whenever the view is created.
:::

## Diagnostics (Lint Integration)

Push diagnostics from external tools (TypeScript, ESLint, your own parser) as character-offset ranges. They render as squiggly underlines via `@codemirror/lint`:

```tsx
editor.setDiagnostics([
  { from: 0, to: 5, severity: 'error', message: 'Unexpected token', source: 'typescript' },
  { from: 20, to: 30, severity: 'warning', message: 'Unused variable', source: 'eslint' },
])

editor.clearDiagnostics()
```

A `Diagnostic` is `{ from, to, severity, message, source? }`. Severities are `'error' | 'warning' | 'info' | 'hint'` (`'hint'` is rendered as `info` by CodeMirror). The underlines render whether or not `lint: true` is set; enabling `lint` adds the gutter markers and the lint-navigation keymap.

## Line Highlights

Highlight whole lines by CSS class — error lines, breakpoints, the current execution line in a debugger:

```tsx
editor.highlightLine(5, 'error-line') // add a highlight to line 5
editor.highlightLine(10, 'current-line') // a different style
editor.clearLineHighlights() // remove all line highlights
```

Highlights are stored by line number and re-applied to the live view as the document changes, so they survive edits. Define the classes (`.error-line { background: #fee }`, etc.) in your own CSS.

## Gutter Markers

Place icons in the gutter — breakpoints, error indicators, anything text or emoji:

```tsx
editor.setGutterMarker(5, { text: '🔴', title: 'Breakpoint' })
editor.setGutterMarker(12, { text: '⚠️', title: 'Warning', class: 'warning-marker' })
editor.clearGutterMarkers()
```

A `GutterMarker` is `{ text?, title?, class? }` — `text` is the marker content, `title` is the hover tooltip, `class` is an optional CSS class on the marker element.

## Custom Keybindings

Register an editor shortcut. The handler runs on the key combo:

```tsx
editor.addKeybinding('Ctrl-Shift-L', () => {
  console.log('Custom shortcut!')
  return true // (any return is treated as handled)
})
```

The key string uses CodeMirror's [key binding syntax](https://codemirror.net/docs/ref/#view.KeyBinding) (`Mod-` for Cmd/Ctrl, `Shift-`, etc.).

## Text Queries

Read content without going through the signal:

```tsx
editor.getLine(5) // text of line 5 (1-based, clamped to bounds)
editor.getWordAtCursor() // the word under the cursor ('' if none)
```

## Minimap

A canvas-based code overview — a scaled-down render of the entire document on the right edge, with a viewport indicator and click-to-scroll. Enable it via config:

```tsx
const editor = createEditor({
  value: longCode,
  minimap: true, // adds the canvas overview sidebar
})
```

For advanced setups (e.g. building a raw CodeMirror state yourself, or composing into `config.extensions`), the extension is exported standalone:

```tsx
import { minimapExtension } from '@pyreon/code'

const editor = createEditor({
  value: longCode,
  extensions: [minimapExtension()], // equivalent to minimap: true
})
```

The minimap reads the editor's dark/light state to pick its background, renders a glyph-per-character overview, draws a viewport rectangle at your scroll position, and jumps to a section on click.

## Two-Way Signal Binding

The single most error-prone pattern with any code editor is keeping it in sync with external state (a form field, a store, a config object) **without an echo loop** — where an external write triggers an editor write that triggers the external write again. `bindEditorToSignal` collapses the hand-rolled flag-pair boilerplate into one call:

```tsx
import { createEditor, bindEditorToSignal } from '@pyreon/code'
import { signal } from '@pyreon/reactivity'

interface Config {
  host: string
  port: number
}

const config = signal<Config>({ host: 'localhost', port: 3000 })

const editor = createEditor({
  value: JSON.stringify(config(), null, 2),
  language: 'json',
})

const binding = bindEditorToSignal({
  editor,
  signal: config,
  serialize: (val) => JSON.stringify(val, null, 2),
  parse: (text) => {
    try {
      return JSON.parse(text)
    } catch {
      return null // parse failure → external state untouched
    }
  },
  onParseError: (err) => console.warn('Invalid JSON:', err.message),
})

// later, on unmount:
binding.dispose()
```

`bindEditorToSignal<T>(options)` returns an `EditorBinding` with a single `dispose()` method. The `signal` may be a real Pyreon `Signal<T>` **or** any `SignalLike<T>` — anything that exposes a `() => T` reader plus a `set(value)` writer (e.g. a `@pyreon/flow` accessor or a custom store), with an optional `peek()`.

**What it guarantees:**

1. **No echo loops.** Two internal flags break the format-on-input race at the external↔editor boundary (the editor's own CM↔signal sync is already loop-safe).
2. **Parse errors don't crash the binding.** A `parse` that returns `null` (or throws) leaves the external state at its last valid value and routes the error to `onParseError`. The user keeps typing.
3. **Both directions are disposable.** `dispose()` tears down both effects.

**What it does NOT do:** it doesn't debounce (every successful parse calls `signal.set`), doesn't preserve cursor across a forced re-serialization, and doesn't register itself with the component lifecycle — you call `dispose()` yourself.

:::warning[Binding pitfalls]
- **Always call `binding.dispose()` on unmount** — otherwise both effects leak. (Or use [`useEditorSignal`](#auto-cleanup-binding-hook) for automatic cleanup.)
- **`serialize` must be deterministic.** If `serialize(parse(text))` produces a different string each call, the helper dispatches redundant writes that fight the user's typing. JSON with consistent indentation is fine.
- **Return `null` (or throw) from `parse` on malformed input** — never a half-valid value. A non-null value for bad input writes garbage to the external state.
- **Don't combine `bindEditorToSignal` with a manual `editor.value.set()` sync loop** — the manual loop defeats the helper's loop prevention.
:::

### Auto-Cleanup Binding Hook

`useEditorSignal` is the lifecycle-aware wrapper around `bindEditorToSignal` — call it inside a component body and it disposes the binding automatically on unmount, so you never write `dispose()` by hand:

```tsx
import { createEditor, CodeEditor, useEditorSignal } from '@pyreon/code'
import { signal } from '@pyreon/reactivity'

function CodeField() {
  const code = signal('console.log("hello")')
  const editor = createEditor({ value: code(), language: 'javascript' })

  // identity serialize/parse — bind raw text to a string signal
  useEditorSignal({
    editor,
    signal: code,
    serialize: (val) => val,
    parse: (text) => text,
  })

  return <CodeEditor instance={editor} style="height: 240px" />
}
```

`useEditorSignal` takes the same `BindEditorToSignalOptions<T>` and returns `void` (the binding is owned by the component). Prefer it over manual `bindEditorToSignal` + `dispose()` whenever you're inside a component.

## Diff Editor

`<DiffEditor>` renders a side-by-side (or inline) diff using `@codemirror/merge`, with collapsed unchanged regions:

```tsx
import { DiffEditor } from '@pyreon/code'

<DiffEditor
  original={`const x = 1\nconst y = 2`}
  modified={`const x = 1\nconst y = 3\nconst z = 4`}
  language="typescript"
  theme="dark"
  style="height: 400px"
/>

// Inline diff instead of side-by-side
<DiffEditor original={oldText} modified={newText} inline />
```

`original` and `modified` accept a plain `string` **or** a `Signal<string>` — pass a signal and the corresponding pane updates reactively when the signal changes:

```tsx
const left = signal('// before')
const right = signal('// after')

<DiffEditor original={left} modified={right} language="javascript" />

right.set('// after (edited)') // the right pane re-renders
```

`DiffEditorProps`: `original`, `modified` (required), plus optional `language`, `theme`, `inline` (default `false`), `readOnly` (default `true`), `style`, `class`. It mounts two CodeMirror instances and tears them down on unmount.

## Tabbed Editor

`<TabbedEditor>` renders a headless tab bar above a single editor, with content cached per tab. It takes a `TabbedEditorInstance` via its `instance` prop:

```tsx
import { TabbedEditor } from '@pyreon/code'

<TabbedEditor instance={tabbedInstance} style="height: 500px" />
```

:::warning[`createTabbedEditor` is not currently exported]
`<TabbedEditor>` requires a `TabbedEditorInstance`. The factory that builds one (`createTabbedEditor`) exists in the package source but is **not re-exported from `@pyreon/code`'s entry point** at the time of writing — so there is currently no public way to construct the `instance` the component needs. The `TabbedEditorInstance` / `Tab` / `TabbedEditorConfig` types and the `TabbedEditor` component _are_ exported. If you need tab management today, compose your own tab bar over multiple `createEditor` instances (one per file) and swap which one you mount. This gap is tracked; the factory is expected to be exported in a future release.
:::

For reference, the `TabbedEditorInstance` shape (returned by the not-yet-exported `createTabbedEditor`) is:

```tsx
instance.editor // the underlying EditorInstance
instance.tabs() // Signal<Tab[]> — all open tabs
instance.activeTab() // Computed<Tab | null> — the current tab
instance.activeTabId() // Signal<string>

instance.openTab({ name: 'utils.ts', language: 'typescript', value: '' })
instance.closeTab('style.css')
instance.switchTab('index.ts')
instance.renameTab('index.ts', 'main.ts')
instance.setModified('index.ts', true) // show the modified dot
instance.moveTab(0, 2) // reorder
instance.getTab('index.ts') // Tab | undefined
instance.closeAll() // close every tab
instance.closeOthers('index.ts') // close all but one
instance.dispose() // tear down
```

A `Tab` is `{ id?, name, language?, value, modified?, closable? }` — `id` defaults to `name`, `closable` defaults to `true`. The tab bar shows a dot on `modified` tabs and a `×` on `closable` ones; switching tabs caches the current content and restores the target's.

## Vim / Emacs Mode

Vim and Emacs key modes are supported but their packages are **not bundled** — install the one you need and flip the config flag:

:::code-group

```bash [vim]
bun add @replit/codemirror-vim
```

```bash [emacs]
bun add @replit/codemirror-emacs
```

:::

```tsx
const editor = createEditor({
  value: 'hello world',
  vim: true, // or emacs: true
})
```

If the corresponding package isn't installed, the flag is silently ignored (the editor still works with default keys).

:::warning[Don't enable both `vim` and `emacs`]
Setting `vim: true` and `emacs: true` together is undefined — emacs wins. Pick one.
:::

## Accessing CodeMirror Directly

For anything the instance API doesn't cover, reach for the raw `EditorView`:

```tsx
const view = editor.view() // EditorView | null (null before mount)

if (view) {
  view.dispatch({
    /* any raw CodeMirror transaction */
  })
}
```

`editor.view` is a reactive signal, so you can also `effect(() => { const v = editor.view(); if (v) … })` to run setup the moment the view exists.

## Cleanup

`createEditor` instances expose `dispose()` to destroy the underlying view and detach listeners:

```tsx
editor.dispose() // destroys the EditorView, resets editor.view() to null
```

When you mount through `<CodeEditor>` / `<TabbedEditor>` / `<DiffEditor>`, the components handle mounting and teardown on unmount for you — you only call `dispose()` manually if you created an instance you're managing outside the component tree.

## Common Patterns

### Read-only viewer

```tsx
const viewer = createEditor({
  value: sourceCode,
  language: 'typescript',
  readOnly: true,
  lineNumbers: true,
  theme: 'dark',
})

<CodeEditor instance={viewer} style="height: 300px" />
```

### Live-validated JSON editor

```tsx
function JsonEditor() {
  const data = signal({ name: 'Alice', age: 30 })
  const error = signal<string | null>(null)

  const editor = createEditor({
    value: JSON.stringify(data(), null, 2),
    language: 'json',
  })

  useEditorSignal({
    editor,
    signal: data,
    serialize: (v) => JSON.stringify(v, null, 2),
    parse: (text) => {
      try {
        return JSON.parse(text)
      } catch {
        return null
      }
    },
    onParseError: (e) => error.set(e.message),
  })

  return (
    <>
      <CodeEditor instance={editor} style="height: 320px" />
      {() => (error() ? <p class="error">{error()}</p> : null)}
    </>
  )
}
```

### Debugger gutter — breakpoints + current line

```tsx
function attachBreakpoints(editor: EditorInstance) {
  let line = 1

  editor.addKeybinding('F9', () => {
    editor.setGutterMarker(editor.cursor().line, { text: '🔴', title: 'Breakpoint' })
    return true
  })

  // highlight the line currently executing
  editor.highlightLine(line, 'current-line')
}
```

## API Reference

### `createEditor(config?)`

Returns an `EditorInstance`. See [Configuration](#configuration) for the full `config` field list.

#### Reactive state

| Member       | Type                                              | Description                                                |
| ------------ | ------------------------------------------------- | ---------------------------------------------------------- |
| `value`      | `Signal<string>`                                  | Editor content — read with `value()`, write `value.set()`  |
| `language`   | `Signal<EditorLanguage>`                          | Current language; setting it lazy-loads + swaps the grammar |
| `theme`      | `Signal<EditorTheme>`                             | `'light' \| 'dark' \| Extension`                           |
| `readOnly`   | `Signal<boolean>`                                 | Read-only state                                            |
| `focused`    | `Signal<boolean>`                                 | Focus state (the editor writes it on focus/blur)           |
| `cursor`     | `Computed<&#123; line, col &#125;>`               | Cursor position, 1-based (read-only)                       |
| `selection`  | `Computed<&#123; from, to, text &#125;>`          | Current selection (read-only)                              |
| `lineCount`  | `Computed<number>`                                | Number of lines (read-only)                                |
| `view`       | `Signal<EditorView \| null>`                      | Underlying CodeMirror view; `null` until mounted           |
| `config`     | `EditorConfig`                                    | The config object the instance was created with            |

#### Methods

| Method                              | Returns  | Description                                                          |
| ----------------------------------- | -------- | ------------------------------------------------------------------- |
| `focus()`                           | `void`   | Focus the editor                                                    |
| `insert(text)`                      | `void`   | Insert at cursor (needs a mounted view — see warning)               |
| `replaceSelection(text)`            | `void`   | Replace the current selection (needs a mounted view)                |
| `select(from, to)`                  | `void`   | Select a character range                                            |
| `selectAll()`                       | `void`   | Select the whole document                                           |
| `goToLine(line)`                    | `void`   | Move cursor to a line, scroll into view, and focus                  |
| `undo()` / `redo()`                 | `void`   | History navigation                                                  |
| `foldAll()` / `unfoldAll()`         | `void`   | Fold / unfold every foldable block                                  |
| `scrollTo(pos)`                     | `void`   | Scroll a character offset into view (centered)                      |
| `setDiagnostics(diagnostics)`       | `void`   | Render lint diagnostics (array of `Diagnostic`)                     |
| `clearDiagnostics()`                | `void`   | Remove all diagnostics                                              |
| `highlightLine(line, className)`    | `void`   | Add a CSS-class line highlight                                      |
| `clearLineHighlights()`             | `void`   | Remove all line highlights                                          |
| `setGutterMarker(line, marker)`     | `void`   | Place a gutter marker (`GutterMarker`)                              |
| `clearGutterMarkers()`              | `void`   | Remove all gutter markers                                           |
| `addKeybinding(key, handler)`       | `void`   | Register a custom key binding (CodeMirror key syntax)               |
| `getLine(line)`                     | `string` | Text of a line (1-based, clamped); `''` before mount               |
| `getWordAtCursor()`                 | `string` | Word under the cursor; `''` if none / before mount                 |
| `dispose()`                         | `void`   | Destroy the view and detach listeners                              |

### `EditorConfig`

| Field                   | Type                  | Default     | Description                                  |
| ----------------------- | --------------------- | ----------- | -------------------------------------------- |
| `value`                 | `string`              | `''`        | Initial content                              |
| `language`              | `EditorLanguage`      | `'plain'`   | Syntax highlighting language                 |
| `theme`                 | `EditorTheme`         | `'light'`   | `'light' \| 'dark' \| Extension`             |
| `lineNumbers`           | `boolean`             | `true`      | Show line-number gutter                      |
| `readOnly`              | `boolean`             | `false`     | Read-only mode                               |
| `foldGutter`            | `boolean`             | `true`      | Code folding gutter                          |
| `bracketMatching`       | `boolean`             | `true`      | Bracket matching + auto-close                |
| `autocomplete`          | `boolean`             | `true`      | Completion popups                            |
| `search`                | `boolean`             | `true`      | Find & replace keymap                        |
| `lint`                  | `boolean`             | `false`     | Lint gutter + lint-navigation keymap         |
| `highlightIndentGuides` | `boolean`             | `true`      | Indent guide lines                           |
| `vim`                   | `boolean`             | `false`     | Vim mode (needs `@replit/codemirror-vim`)    |
| `emacs`                 | `boolean`             | `false`     | Emacs mode (needs `@replit/codemirror-emacs`)|
| `tabSize`               | `number`              | `2`         | Indent width in spaces                       |
| `lineWrapping`          | `boolean`             | `false`     | Soft-wrap long lines                         |
| `placeholder`           | `string`              | —           | Placeholder shown when empty                 |
| `minimap`               | `boolean`             | `false`     | Canvas code-overview sidebar                 |
| `extensions`            | `Extension[]`         | `[]`        | Extra raw CodeMirror extensions              |
| `onChange`              | `(value: string) => void` | —       | Called on every content change               |

### `bindEditorToSignal(options)`

Two-way binding between an `EditorInstance` and a `SignalLike<T>`. Returns an `EditorBinding`.

| Option         | Type                            | Description                                                       |
| -------------- | ------------------------------- | ----------------------------------------------------------------- |
| `editor`       | `EditorInstance`                | The editor to bind                                                |
| `signal`       | `SignalLike<T>`                 | External state — a `Signal<T>` or any `() => T` + `set(v)` pair   |
| `serialize`    | `(value: T) => string`          | Project external value into editor text (must be deterministic)   |
| `parse`        | `(text: string) => T \| null`   | Parse editor text back; return `null` (or throw) on failure       |
| `onParseError?`| `(error: Error) => void`        | Optional handler for parse failures                               |

`EditorBinding` = `{ dispose(): void }`.

### `useEditorSignal(options)`

Same `BindEditorToSignalOptions<T>` as above; returns `void`. Call inside a component — disposes the binding automatically on unmount.

### `loadLanguage(lang)` / `getAvailableLanguages()`

| Function                     | Returns               | Description                                                       |
| ---------------------------- | --------------------- | ----------------------------------------------------------------- |
| `loadLanguage(lang)`         | `Promise<Extension>`  | Lazy-load (+ cache) a grammar; `[]` if the optional pkg is absent |
| `getAvailableLanguages()`    | `EditorLanguage[]`    | All 20 supported language identifiers                             |

### `minimapExtension()`

Returns a CodeMirror `Extension` — the canvas code-overview minimap. Equivalent to `createEditor({ minimap: true })`; usable in `config.extensions` or a hand-built CodeMirror state.

### Themes

| Export                | Type                      | Description                                  |
| --------------------- | ------------------------- | -------------------------------------------- |
| `lightTheme`          | `Extension`               | Built-in light theme                         |
| `darkTheme`           | `Extension`               | Built-in dark theme (VS Code inspired)       |
| `resolveTheme(theme)` | `(EditorTheme) => Extension` | Map `'light'`/`'dark'` to a theme, pass an `Extension` through |

### Components

| Component        | Props                                                                                  | Description                          |
| ---------------- | -------------------------------------------------------------------------------------- | ------------------------------------ |
| `<CodeEditor>`   | `instance: EditorInstance`, `style?`, `class?`                                         | Single-file editor                   |
| `<DiffEditor>`   | `original`, `modified` (`string \| Signal<string>`), `language?`, `theme?`, `inline?`, `readOnly?`, `style?`, `class?` | Side-by-side / inline diff           |
| `<TabbedEditor>` | `instance: TabbedEditorInstance`, `style?`, `class?`                                   | Tab bar over one editor (see [note](#tabbed-editor)) |

### Exported types

`EditorConfig`, `EditorInstance`, `EditorLanguage`, `EditorTheme`, `GutterMarker`, `CodeEditorProps`, `DiffEditorProps`, `Tab`, `TabbedEditorConfig`, `TabbedEditorInstance`, `TabbedEditorProps`, plus `BindEditorToSignalOptions`, `EditorBinding`, and `SignalLike` from the binding module.

## Bundle Size

`@pyreon/code` is built on CodeMirror 6 instead of Monaco. Language grammars are `optionalDependencies` loaded on demand by `loadLanguage`, so a JSON-only editor never downloads the Rust, C++, or Markdown grammar; Vim and Emacs key modes are optional and not bundled at all.

Measured with esbuild (ESM, minify, tree-shake, code-split) + gzip -9 — reproduce with `bun run --filter=@pyreon/code bench`:

| Bundle | minified | gzipped | notes |
| --- | --- | --- | --- |
| `@pyreon/code` core editor | ~416 KB | **~138 KB** | CM6 core + wrapper; framework runtime external, no grammar |
| — + one language grammar | ~111 KB | ~41 KB | streams on first use; reuses the loaded core |
| `@pyreon/code` full API | ~444 KB | ~147 KB | + diff + tabs + minimap + binding |
| `@uiw/react-codemirror` | ~396 KB | ~129 KB | fair peer — wraps the same CM6 (React external) |
| `monaco-editor` ESM core | ~3.6 MB | **~940 KB** | conservative lower bound (CSS, fonts, web workers excluded) |

The two CM6 wrappers land within ~7% of each other — they wrap the same engine, so the delta is wrapper + which-extensions-each-bundles, not the editor. Against Monaco, `@pyreon/code`'s core is **~7x smaller gzipped**, and Monaco's real footprint is larger still once its CSS and web-worker bundles are counted.

This is a bundle-size measurement, not a runtime latency benchmark — the mount / doc-swap / reactive-binding timing comparison is a separate axis (it needs real-browser layout).
