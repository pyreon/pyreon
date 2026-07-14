---
title: "Code Editor — API Reference"
description: "Reactive code editor — CodeMirror 6 with signals, minimap, diff editor, lazy-loaded languages"
---

# @pyreon/code — API Reference

> **Generated** from `code`'s `src/manifest.ts` — the same source that powers `llms.txt` and MCP `get_api`. Do not edit this page by hand; edit the manifest. For the conceptual guide, see [code](/docs/code).

Reactive code editor for Pyreon built on CodeMirror 6 — the core editor is ~138 KB gz (measured), ~7x lighter than Monaco's ~940 KB gz core. `editor.value` is a writable Signal&lt;string&gt; — reads track reactively, writes push back into CodeMirror. 19 language grammars lazy-loaded on demand. Canvas-based minimap, diff editor, tabbed editor, and two-way signal binding with built-in loop prevention.

> **Peer dependencies:** `@pyreon/runtime-dom` — install alongside this package.

## Features

- createEditor — reactive instance with writable Signal&lt;string&gt; value
- createTabbedEditor — reactive multi-file editor (reactive tabs + open/close/switch/move)
- CodeEditor, DiffEditor, TabbedEditor JSX components
- bindEditorToSignal — two-way binding with built-in loop prevention
- 19 language grammars via loadLanguage (lazy-loaded)
- Canvas-based minimapExtension for code overview
- Built on CodeMirror 6 (~250KB vs Monaco ~2.5MB)

## Complete example

A full, end-to-end usage of the package:

```tsx
import { createEditor, createTabbedEditor, CodeEditor, DiffEditor, TabbedEditor, bindEditorToSignal, loadLanguage, minimapExtension } from '@pyreon/code'
import { signal } from '@pyreon/reactivity'

// Create a reactive editor instance
const editor = createEditor({
  value: 'const x = 1',
  language: 'typescript',
  theme: 'dark',
  minimap: true,
  lineNumbers: true,
  onChange: (next) => console.log('user edit:', next),
})

// editor.value is a writable Signal<string>
editor.value()           // read reactively — tracks in effects/JSX
editor.value.set('new')  // write back into CodeMirror
editor.cursor()          // computed { line, col }
editor.lineCount()       // computed number

// Mount with JSX component:
<CodeEditor instance={editor} style="height: 400px" />

// Diff editor — side-by-side comparison:
<DiffEditor original="old code" modified="new code" language="typescript" />

// Two-way binding to external signal (e.g. form field, store):
interface Config { host: string; port: number }
const config = signal<Config>({ host: 'localhost', port: 3000 })

const configEditor = createEditor({ value: JSON.stringify(config(), null, 2), language: 'json' })

const binding = bindEditorToSignal({
  editor: configEditor,
  signal: config,
  serialize: (val) => JSON.stringify(val, null, 2),
  parse: (text) => { try { return JSON.parse(text) } catch { return null } },
  onParseError: (err) => console.warn('Invalid JSON:', err.message),
})
// binding.dispose() on unmount

// Lazy-load a language grammar:
await loadLanguage('python')

// Tabbed editor — build an instance with createTabbedEditor, then mount it
// via the component's `instance` prop (each Tab uses `name`, not `label`):
const tabbed = createTabbedEditor({
  tabs: [
    { id: 'main', name: 'main.ts', language: 'typescript', value: 'export {}' },
    { id: 'styles', name: 'styles.css', language: 'css', value: 'body {}' },
  ],
})
tabbed.openTab({ id: 'readme', name: 'README.md', language: 'markdown', value: '# Hi' })
<TabbedEditor instance={tabbed} style="height: 500px" />
```

## Exports

| Symbol | Kind | Summary |
| --- | --- | --- |
| [`createEditor`](#createeditor) | function | Create a reactive editor instance. |
| [`bindEditorToSignal`](#bindeditortosignal) | function | Two-way binding between an editor instance and an external Signal&lt;T&gt; (or SignalLike&lt;T&gt;). |
| [`CodeEditor`](#codeeditor) | component | Mount component for a `createEditor` instance. |
| [`DiffEditor`](#diffeditor) | component | Side-by-side diff editor. |
| [`createTabbedEditor`](#createtabbededitor) | function | Create a reactive multi-file (tabbed) editor instance. |
| [`TabbedEditor`](#tabbededitor) | component | Mount component for a `createTabbedEditor` instance. |
| [`loadLanguage`](#loadlanguage) | function | Lazy-load a language grammar and return its CodeMirror `Extension`. |
| [`minimapExtension`](#minimapextension) | function | CodeMirror extension that renders a canvas-based code overview minimap. |
| [`useEditorSignal`](#useeditorsignal) | function | Component hook that two-way-binds an editor to a signal WITH automatic cleanup. |
| [`getAvailableLanguages`](#getavailablelanguages) | function | Return every supported language identifier (the keys of the internal grammar-loader registry) — for building a language  |
| [`darkTheme / lightTheme / resolveTheme`](#darktheme-lighttheme-resolvetheme) | constant | The built-in editor themes. |

## API

### createEditor `function`

```ts
(config: EditorConfig) => EditorInstance
```

Create a reactive editor instance. `editor.value` is a writable Signal&lt;string&gt; — `editor.value()` reads reactively, `editor.value.set(next)` writes back into CodeMirror. `editor.cursor` and `editor.lineCount` are computed signals. Config accepts value, language, theme, minimap, lineNumbers, foldGutter, onChange, onError (mount failures route here instead of an unhandled rejection), and more. The instance is framework-independent — mount it via `<CodeEditor instance={editor} />`.

**Example**

```tsx
const editor = createEditor({
  value: '// hello',
  language: 'typescript',
  theme: 'dark',
  minimap: true,
  onChange: (next) => console.log('edit:', next),
})

editor.value()              // reactive read
editor.value.set('new')     // write into CodeMirror
editor.cursor()             // { line, col }
editor.lineCount()          // computed
editor.goToLine(42)
editor.insert('code')

<CodeEditor instance={editor} style="height: 400px" />
```

**Common mistakes**

- Forgetting to declare @pyreon/runtime-dom in consumer app deps — &lt;CodeEditor&gt; JSX emits _tpl() which needs runtime-dom
- Hand-rolling the applyingFromExternal/applyingFromEditor flag pattern — use bindEditorToSignal instead
- Calling cursor-relative methods (insert / replaceSelection) before mount — the view is created by mount() after an async grammar load, so a pre-mount call has no cursor and is dropped (with a dev warning). Use editor.value.set(...) to set content independently of the view (it seeds the doc whenever the view is created)
- Setting both vim: true and emacs: true — emacs wins
- Relying on a thrown error to debug a broken setup (a throwing extension / failed grammar import) — mount failures no longer surface as an unhandled rejection; pass onError to observe them, otherwise they log a [Pyreon] message in dev. Disposing the editor while it is still mounting (a fast navigate-away during the async grammar load) is also leak-safe

**See also:** `CodeEditor` · `bindEditorToSignal` · `loadLanguage`

---

### bindEditorToSignal `function`

```ts
<T>(options: BindEditorToSignalOptions<T>) => EditorBinding
```

Two-way binding between an editor instance and an external Signal&lt;T&gt; (or SignalLike&lt;T&gt;). Replaces the recurring loop-prevention flag-pair boilerplate. Round-trips through user-supplied `serialize`/`parse` functions. Internal flags break the format-on-input race; parse failures call `onParseError` and leave the external state at its last valid value. Returns `{ dispose }` for cleanup.

**Example**

```tsx
const data = signal<Doc>({ name: 'Alice', count: 1 })
const editor = createEditor({ value: JSON.stringify(data(), null, 2), language: 'json' })

const binding = bindEditorToSignal({
  editor,
  signal: data,
  serialize: (val) => JSON.stringify(val, null, 2),
  parse: (text) => { try { return JSON.parse(text) } catch { return null } },
  onParseError: (err) => console.warn(err.message),
})
// binding.dispose() on unmount
```

**Common mistakes**

- Forgetting to call binding.dispose() on unmount — leaks both effects
- Non-deterministic serialize() — if serialize(parse(text)) varies on each call, the helper dispatches redundant writes that fight the user's typing
- Returning a non-null value from parse() for malformed input — return null on failure, or throw
- Using bindEditorToSignal AND a manual editor.value.set() loop — defeats loop prevention

**See also:** `createEditor`

---

### CodeEditor `component`

```ts
(props: CodeEditorProps) => VNodeChild
```

Mount component for a `createEditor` instance. Accepts `instance`, `style`, `class`, and passes through to a container div. Auto-mounts the CodeMirror view on render and cleans up on unmount.

**Example**

```tsx
<CodeEditor instance={editor} style="height: 400px" class="my-editor" />
```

**See also:** `createEditor` · `DiffEditor` · `TabbedEditor`

---

### DiffEditor `component`

```ts
(props: DiffEditorProps) => VNodeChild
```

Side-by-side diff editor. Accepts `original` and `modified` strings plus optional `language` and `theme`. Renders two CodeMirror instances with unified diff highlighting via @codemirror/merge.

**Example**

```tsx
<DiffEditor original="old code" modified="new code" language="typescript" />
```

**See also:** `CodeEditor` · `TabbedEditor`

---

### createTabbedEditor `function`

```ts
(config?: TabbedEditorConfig) => TabbedEditorInstance
```

Create a reactive multi-file (tabbed) editor instance. `config` is `{ tabs?, theme?, editorConfig? }` — `tabs` is an array of `Tab` (`{ name, value, id?, language?, modified?, closable? }`), `editorConfig` applies to every tab. The instance wraps a single underlying `editor` and exposes reactive `tabs` (Signal&lt;Tab[]&gt;), `activeTab` (Computed&lt;Tab | null&gt;), and `activeTabId` (Signal&lt;string&gt;), plus imperative `openTab` / `closeTab` / `switchTab` / `renameTab` / `setModified` / `moveTab` / `getTab` / `closeAll` / `closeOthers` / `dispose`. Mount it via `<TabbedEditor instance={…} />`.

**Example**

```tsx
const tabbed = createTabbedEditor({
  tabs: [
    { id: 'main', name: 'main.ts', language: 'typescript', value: 'export {}' },
    { id: 'styles', name: 'styles.css', language: 'css', value: 'body {}' },
  ],
})
tabbed.openTab({ name: 'README.md', language: 'markdown', value: '# Hi' })
tabbed.switchTab('styles')
tabbed.activeTab()   // Computed<Tab | null>

<TabbedEditor instance={tabbed} style="height: 500px" />
```

**Common mistakes**

- Passing `tabs` directly to &lt;TabbedEditor&gt; — the component takes an `instance` prop, not `tabs`. Build the instance with createTabbedEditor, then pass `instance={tabbed}`.
- Using `label` for the tab title — a Tab uses `name` (the displayed file name); `id` is the optional unique key (defaults to `name`).
- Forgetting to call instance.dispose() on unmount — it owns an underlying editor instance.

**See also:** `TabbedEditor` · `createEditor`

---

### TabbedEditor `component`

```ts
(props: TabbedEditorProps) => VNodeChild
```

Mount component for a `createTabbedEditor` instance. Props are `instance` (REQUIRED — a TabbedEditorInstance), plus optional `style` and `class`. Renders a headless tab bar (plain div + button tabs) above the editor; switching tabs swaps the underlying document reactively.

**Example**

```tsx
const tabbed = createTabbedEditor({ tabs: [{ name: 'a.ts', value: 'export {}' }] })
<TabbedEditor instance={tabbed} style="height: 500px" />
```

**Common mistakes**

- Passing `tabs={[…]}` — there is no `tabs` prop; pass a `createTabbedEditor` instance via `instance`.

**See also:** `createTabbedEditor` · `CodeEditor` · `DiffEditor`

---

### loadLanguage `function`

```ts
(language: EditorLanguage) => Promise<Extension>
```

Lazy-load a language grammar and return its CodeMirror `Extension`. All 19 non-plain identifiers ship a real grammar: json, typescript, javascript, jsx, tsx, python, css, html, markdown, rust, go, java, cpp, sql, xml, yaml, php from the modern `@codemirror/lang-*` packages, plus ruby and shell from `@codemirror/legacy-modes` (StreamLanguage). `plain` is intentionally empty. The result is cached per language; an uninstalled optional grammar package (or an unknown identifier) resolves to an empty `[]` extension (never throws). `createEditor` loads the grammar for its `language` on mount, so calling `loadLanguage` ahead of time just warms the cache.

**Example**

```tsx
const ext = await loadLanguage('python') // the CodeMirror Extension
// createEditor({ language: 'python' }) now resolves instantly (cache warm)
```

**See also:** `createEditor` · `getAvailableLanguages`

---

### minimapExtension `function`

```ts
() => Extension
```

CodeMirror extension that renders a canvas-based code overview minimap. Enable via `createEditor({ minimap: true })` or add the extension manually to a CodeMirror state.

**Example**

```tsx
const editor = createEditor({ value: longCode, minimap: true })
// or: import { minimapExtension } from '@pyreon/code'
```

**See also:** `createEditor`

---

### useEditorSignal `function`

```ts
useEditorSignal<T>(options: BindEditorToSignalOptions<T>) => void
```

Component hook that two-way-binds an editor to a signal WITH automatic cleanup. It wraps `bindEditorToSignal` and registers `onUnmount(() => binding.dispose())`, so you do not manage the binding lifecycle yourself — unlike `bindEditorToSignal`, which returns a `{ dispose }` handle for user-owned lifecycles. Options: `{ editor, signal, serialize, parse, onParseError? }` — `signal` is any `SignalLike<T>`, `serialize` projects the value into editor text, `parse` reads it back.

**Example**

```tsx
function MyEditor() {
  const code = signal('console.log(1)')
  const editor = createEditor({ value: code(), language: 'javascript' })
  useEditorSignal({ editor, signal: code, serialize: (v) => v, parse: (t) => t })
  return <CodeEditor instance={editor} />
}
```

**Common mistakes**

- Calling it outside a component — it relies on `onUnmount` for cleanup, so it only works during component setup. For a manually-managed lifecycle use `bindEditorToSignal` (which returns a `{ dispose }` handle) and call `dispose()` yourself.
- Expecting a return value — it returns `void` (no binding handle); disposal is automatic. If you need to tear the binding down early, use `bindEditorToSignal` instead.
- A non-deterministic `serialize`/`parse` pair — the binding round-trips through both, so `serialize(parse(serialize(x)))` must equal `serialize(x)` or the editor and the signal fight each other.

**See also:** `bindEditorToSignal` · `createEditor`

---

### getAvailableLanguages `function`

```ts
getAvailableLanguages() => EditorLanguage[]
```

Return every supported language identifier (the keys of the internal grammar-loader registry) — for building a language picker. Pairs with `loadLanguage(id)`, which lazy-loads a grammar on demand. The set covers the bundled CodeMirror grammars plus `'plain'` (no highlighting).

**Example**

```tsx
const languages = getAvailableLanguages()
// → ['javascript', 'typescript', 'python', 'plain', …]
```

**Common mistakes**

- Assuming a returned id is already loaded — `getAvailableLanguages()` lists what CAN be loaded; the grammar itself is lazy. Pass the id to `createEditor({ language })` (or `loadLanguage(id)`) to actually load it.

**See also:** `loadLanguage` · `createEditor`

---

### darkTheme / lightTheme / resolveTheme `constant`

```ts
darkTheme: Extension · lightTheme: Extension · resolveTheme(theme: EditorTheme) => Extension
```

The built-in editor themes. `lightTheme` and `darkTheme` are CodeMirror `Extension`s (a clean light palette and a VS-Code-inspired dark one). `darkTheme` carries the `{ dark: true }` facet — the flag CodeMirror's dark-aware features AND this package's minimap key on (NOT a CSS class). `resolveTheme(theme)` maps `'light'`/`'dark'` to those extensions and passes a custom `Extension` through unchanged (`EditorTheme = 'light' | 'dark' | Extension`). You normally set `createEditor({ theme })` and let it resolve — reach for the raw extensions only when composing your own CodeMirror state.

**Example**

```tsx
const editor = createEditor({ value: code, theme: 'dark' })   // resolved internally
// or compose the raw extension yourself:
const extensions = [darkTheme /* , ...other CM extensions */]
```

**Common mistakes**

- Toggling dark mode by swapping a CSS class — CodeMirror keys its dark-aware behavior (and this package's minimap) on the `EditorView.darkTheme` FACET carried by `darkTheme`, not a class. Provide `darkTheme` (or `theme: 'dark'`) so the facet is set.
- Passing a theme NAME other than 'light'/'dark' to `resolveTheme` — only those two strings map to a preset; any other value must be a real CodeMirror `Extension` (it is returned as-is).

**See also:** `createEditor` · `minimapExtension`

---

## Package-level notes

> **Peer dep:** `@pyreon/runtime-dom` is required in consumer apps because `<CodeEditor>` JSX emits `_tpl()` / `_bind()` calls.

> **Note:** editor.value is a writable Signal&lt;string&gt;. Read with `editor.value()` (reactive), write with `editor.value.set(next)` (pushes into CodeMirror). Do NOT call `editor.value(newText)` — that reads and ignores the argument.

> **Two-way binding:** For external signal &lt;-&gt; editor synchronization, use `bindEditorToSignal` — it handles loop prevention, format-on-input races, and parse error recovery. Hand-rolling the flag pattern is the #1 source of bugs.

> **Bundle size:** Built on CodeMirror 6. Measured (esbuild+gzip, code-split): the core editor is ~138 KB gz (~416 KB min) — at parity with @uiw/react-codemirror (~129 KB gz), both wrap the same CM6. Monaco's ESM core is ~940 KB gz (~3.6 MB min, workers/CSS excluded) — @pyreon/code is ~7x smaller gzipped. Each extra language grammar streams as a ~40 KB gz lazy chunk that reuses the loaded core. Reproduce with `bun run --filter=@pyreon/code bench`.

> **ruby / shell grammars:** `ruby` and `shell` highlighting come from `@codemirror/legacy-modes` (an optionalDependency). It installs by default; if your package manager skips optional deps, those two fall back to plain-text (empty extension) rather than throwing.
