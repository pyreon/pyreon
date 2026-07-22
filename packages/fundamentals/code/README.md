# @pyreon/code

Reactive code editor — CodeMirror 6 wrapped in Pyreon signals.

A drop-in code editor for in-app editors (markdown previews, query builders, schema fields, REPLs, configuration files). Built on CodeMirror 6 — the measured core is ~138 KB gz vs ~940 KB gz for Monaco's ESM core (~7× smaller gzipped; reproduce with `bun run --filter=@pyreon/code bench`). Every editor field (`value`, `cursor`, `selection`, `lineCount`, `focused`) is a Pyreon signal so the editor composes natively with `effect` / `computed` / `<Show>` without manual change-event plumbing. Ships a single-pane editor, a side-by-side diff editor, a tabbed multi-file editor, lazy-loaded language grammars for 20 languages, a canvas-based minimap, and a two-way signal binding helper with format-on-input loop protection.

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
| `readOnly` | `false` | Blocks user-input transactions; cursor stays |
| `editable` | `true` | `false` removes `contenteditable` entirely (pure display surface); live via `editor.editable.set()` |
| `foldGutter` | `true` | |
| `bracketMatching` | `true` | |
| `autocomplete` | `true` | |
| `search` | `true` | Cmd/Ctrl+F. `false` omits the search keymap + selection-match highlighting; `openSearchPanel(editor)` still works |
| `lint` | `false` | Pass diagnostics via `setDiagnostics` |
| `vim` / `emacs` | `false` | Keybindings |
| `tabSize` | `2` | |
| `placeholder` | — | Hint text when empty |
| `minimap` | `false` | Canvas code-overview sidebar |
| `ariaLabel` | `'Code editor'` | Accessible name for the content textbox |
| `onError` | — | Mount-failure handler (throwing extension / failed grammar import) |

Add custom keybindings imperatively on the instance: `editor.addKeybinding('Ctrl-s', () => save())`.

Open the find/replace panel programmatically with `openSearchPanel(editor)` — the deliberate escape hatch that works even with `search: false` (pre-mount it dev-warns + returns `false`).

`EditorInstance` shape:

| Member | Type |
|---|---|
| `value` | `Signal<string>` — two-way synced with the editor |
| `language` | `Signal<EditorLanguage>` |
| `theme` | `Signal<EditorTheme>` |
| `readOnly` | `Signal<boolean>` |
| `editable` | `Signal<boolean>` — live `EditorView.editable` toggle |
| `cursor` | `Computed<{ line, col }>` |
| `selection` | `Computed<{ from, to, text }>` |
| `lineCount` | `Computed<number>` |
| `focused` | `Signal<boolean>` |
| `view` | `Signal<EditorView \| null>` (raw CodeMirror, null until mounted) |
| `focus()` / `insert(text)` / `replaceSelection(text)` | imperative |
| `select(from, to)` / `selectAll()` / `goToLine(line)` | imperative |
| `undo()` / `redo()` / `foldAll()` / `unfoldAll()` | imperative |
| `dispose()` | manual cleanup — lifecycle is user-owned; `<CodeEditor>` does NOT auto-dispose (see Gotchas) |

## Languages — 20 identifiers, lazy-loaded

```ts
import { loadLanguage, getAvailableLanguages } from '@pyreon/code'

getAvailableLanguages()
// ['javascript', 'typescript', 'jsx', 'tsx', 'html', 'css', 'json',
//  'markdown', 'python', 'rust', 'sql', 'xml', 'yaml', 'cpp', 'java',
//  'go', 'php', 'ruby', 'shell', 'plain']

await loadLanguage('typescript') // returns a CodeMirror Extension
```

**19 have a real grammar** (`plain` is intentionally empty — plain-text editing). 17 come from the modern `@codemirror/lang-*` packages; `ruby` and `shell` come from `@codemirror/legacy-modes` (CodeMirror-5-era StreamLanguage grammars). All are lazy-loaded — an uninstalled optional grammar package resolves to an empty extension rather than throwing, so a JSON-only editor never downloads the Rust or C++ grammar.

Setting `editor.language.set('python')` triggers the load + grammar swap; mid-load the editor stays usable in the previous grammar.

## Components

### `<CodeEditor instance={editor} style="...">`

Single-pane editor mounting the `EditorInstance` view.

### `<DiffEditor>` — side-by-side or unified diff

```tsx
;<DiffEditor
  original="const a = 1"
  modified="const a = 2"
  language="typescript"
  style="height: 300px"
/>
```

`original` / `modified` also accept `Signal<string>` — the diff updates reactively. Pass `inline` for a **unified** view: one editor showing the modified document with the original rendered as deleted-chunk widgets (via `@codemirror/merge`'s `unifiedMergeView`); when `readOnly={false}` each chunk gets accept/reject controls.

```tsx
;<DiffEditor original={before} modified={after} inline style="height: 300px" />
```

### `<TabbedEditor>` — multi-file editor

Build a `TabbedEditorInstance` with `createTabbedEditor`, then pass it via the
component's `instance` prop. A `Tab` uses `name` (the displayed file name), not
`label`; `id` is the optional unique key (defaults to `name`).

```tsx
import { createTabbedEditor, TabbedEditor } from '@pyreon/code'

const tabbed = createTabbedEditor({
  tabs: [
    { id: 'main', name: 'main.ts', value: 'export {}', language: 'typescript' },
    { id: 'style', name: 'style.css', value: 'body {}', language: 'css' },
  ],
})

;<TabbedEditor instance={tabbed} style="height: 500px" />
```

`TabbedEditorInstance` exposes `editor`, `tabs: Signal<Tab[]>`, `activeTab: Computed<Tab | null>`, `activeTabId: Signal<string>`, plus `openTab` / `closeTab` / `switchTab` / `renameTab` / `setModified` / `moveTab` / `closeAll` / `closeOthers` actions.

## Two-way binding to an external signal

`bindEditorToSignal` replaces the loop-prevention flag-pair boilerplate that recurs in every consumer trying to sync `editor.value` with their app state.

```ts
import { signal } from '@pyreon/reactivity'
import { bindEditorToSignal } from '@pyreon/code'

const code = signal('export const x = 1')

const { dispose } = bindEditorToSignal({
  editor,
  signal: code, // Signal<string> or any SignalLike<T>
  serialize: (v) => v, // T → string
  parse: (s) => s, // string → T | null (return null on parse failure)
  onParseError: (err) => console.warn('parse failed:', err.message),
})

// External writes flow into the editor; user edits flow back into `code`.
// Internal flag-pair breaks the format-on-input race; parse failures call
// `onParseError` and leave external state at its last valid value.

onUnmount(dispose)
```

Accepts a generic `T` — use `serialize` / `parse` to round-trip JSON, YAML, or any custom format. Both directions are loop-safe. `parse` returns `T | null` — return `null` (or throw) on invalid input to route it to `onParseError`.

`useEditorSignal(options)` is the same binding with automatic cleanup: it takes the same `BindEditorToSignalOptions`, calls `bindEditorToSignal` for you, and disposes on unmount (via `onUnmount`) — no manual `dispose()` needed.

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

**Third-party themes drop in directly.** `EditorTheme` accepts any CodeMirror `Extension`, and `resolveTheme` passes it through unchanged — so every `@uiw/codemirror-theme-*` package (dracula, github, tokyo-night, material, … an instant ~35-theme gallery) works as-is:

```ts
import { dracula } from '@uiw/codemirror-theme-dracula'

createEditor({ value: code, theme: dracula })
```

## Performance — runtime wrapper overhead vs @uiw/react-codemirror

Both wrap the SAME CodeMirror 6 engine, so the runtime bench (`bun run --filter=@pyreon/code bench:runtime`, real Chromium) measures only the WRAPPER's update path, on @uiw's documented controlled-value pattern. The portable signal is the deterministic COUNT: for 110 keystrokes + 1 external write the owning component re-renders **once** in Pyreon (the body runs once; updates ride the signal) vs **~110 React commits** for the controlled @uiw pattern (keystroke → onChange → setState → re-render → value-sync effect). Measured externally observable deltas: external `value` write → DOM ~0.4ms vs ~84ms (quiet editor; ~530ms if written within @uiw's 200ms anti-clobber typing latch — their deliberate design, disclosed not counted), dispose ~2× faster, mount ~1.3× slower (async grammar/mount settle — the lazy-loading price). Under real typing cadence the per-keystroke wall-clock is indistinguishable (CM6 dominates both). Honest limits: author-judge; @uiw's UNCONTROLLED mode skips the round-trip and is exempt — the claim is scoped to controlled/bound-state usage (what `bindEditorToSignal` competes with). Current numbers: `bench/RESULTS-runtime.md`.

## Gotchas

- **`@pyreon/runtime-dom` is a required peer** — `<CodeEditor>` JSX emits `_tpl()` calls.
- **`editor.value.set(...)` mutates the CodeMirror document**; subscribing to `editor.value()` re-fires on every keystroke. For derived state, layer `computed`/`useDebouncedValue` on top instead of reading raw `value` on every effect tick.
- **`editor.view()` is `null` until the editor is mounted** — wait for `<CodeEditor>` to render before reaching for raw CodeMirror APIs, or use `effect(() => { if (editor.view()) { … } })`.
- **`bindEditorToSignal` requires `parse` for non-string T** — otherwise parse failures crash silently. Always supply `onParseError` if `parse` can throw.
- **Languages are lazy-loaded** — first switch to a new language triggers a chunk fetch. Pre-load via `await loadLanguage('typescript')` if you need synchronous availability. A mount failure (a throwing extension or a failed grammar import) routes to the config `onError` instead of an unhandled rejection, and disposing while the grammar is still loading is leak-safe.
- **Lifecycle is user-owned — `<CodeEditor>` does NOT auto-dispose the instance on unmount.** The instance is created by you and may be remounted (e.g. by `<TabbedEditor>` or a route revisit), so the component never tears it down. Call `editor.dispose()` from your own cleanup (`onUnmount`) when the instance is done for good, or the CodeMirror view leaks.
- **Reading `.peek()` of `editor.value` inside an effect** bypasses tracking deliberately — used by `bindEditorToSignal`'s loop guard. Annotate with the `pyreon/no-peek-in-tracked` suppression where you genuinely need a non-tracking read.

## Documentation

Full docs: [pyreon.dev/docs/code](https://pyreon.dev/docs/code) (or `docs/src/content/docs/code.md` in this repo).

## License

MIT
